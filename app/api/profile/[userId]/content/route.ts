import { and, desc, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  disloopNewsPosts,
  disloopReelLikes,
  disloopReelViews,
  disloopReels,
  disloopReposts,
  disloopProfilePins,
  disloopUsers,
} from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { safeApiFailureReason } from '@/lib/api-errors'
import { privateMediaUrl } from '@/lib/private-media'
import { getCurrentUser } from '@/lib/session'

const PAGE_SIZE = 12
const MAX_OFFSET = 10_000
type Tab = 'posts' | 'reposts' | 'reels' | 'stats'
type ReelSort = 'newest' | 'viewed' | 'liked'

function isTab(value: string | null): value is Tab {
  return value === 'posts' || value === 'reposts' || value === 'reels' || value === 'stats'
}

function parseOffset(value: string | null) {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_OFFSET ? parsed : null
}

function parseReelSort(value: string | null): ReelSort {
  return value === 'viewed' || value === 'liked' ? value : 'newest'
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: 'invalid_profile' }, { status: 400 })

  const tabValue = request.nextUrl.searchParams.get('tab')
  if (!isTab(tabValue)) return NextResponse.json({ error: 'invalid_profile_tab' }, { status: 400 })
  const offset = parseOffset(request.nextUrl.searchParams.get('offset'))
  if (offset === null) return NextResponse.json({ error: 'invalid_offset' }, { status: 400 })

  try {
    const viewer = await getCurrentUser()
    const [profile] = await db.select({ id: disloopUsers.id, hideReposts: disloopUsers.hideReposts })
      .from(disloopUsers)
      .where(eq(disloopUsers.id, userId))
      .limit(1)
    if (!profile) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })

    if (tabValue === 'stats') {
      const [[{ posts }], [{ reels }]] = await Promise.all([
        db.select({ posts: sql<number>`count(*)::int` }).from(disloopNewsPosts)
          .where(and(eq(disloopNewsPosts.authorId, userId), eq(disloopNewsPosts.isHidden, false))),
        db.select({ reels: sql<number>`count(*)::int` }).from(disloopReels)
          .where(and(eq(disloopReels.authorId, userId), eq(disloopReels.isHidden, false))),
      ])
      return NextResponse.json({ posts, reels }, { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } })
    }

    if (tabValue === 'posts') {
      const readPosts = async (includePinnedOrdering: boolean) => {
        const query = db.select({
          id: disloopNewsPosts.id,
          authorId: disloopNewsPosts.authorId,
          title: disloopNewsPosts.title,
          body: disloopNewsPosts.body,
          category: disloopNewsPosts.category,
          tags: disloopNewsPosts.tags,
          createdAt: disloopNewsPosts.createdAt,
        }).from(disloopNewsPosts)
        const postsQuery = includePinnedOrdering
          ? query.leftJoin(disloopProfilePins, and(eq(disloopProfilePins.userId, userId), eq(disloopProfilePins.postId, disloopNewsPosts.id)))
            .where(and(eq(disloopNewsPosts.authorId, userId), eq(disloopNewsPosts.isHidden, false)))
            .orderBy(desc(sql`(${disloopProfilePins.postId} is not null)`), desc(disloopNewsPosts.createdAt), desc(disloopNewsPosts.id))
          : query.where(and(eq(disloopNewsPosts.authorId, userId), eq(disloopNewsPosts.isHidden, false)))
            .orderBy(desc(disloopNewsPosts.createdAt), desc(disloopNewsPosts.id))
        return postsQuery.limit(PAGE_SIZE + 1).offset(offset)
      }
      let posts: Awaited<ReturnType<typeof readPosts>>
      try {
        posts = await readPosts(true)
      } catch (error) {
        if (safeApiFailureReason(error) !== 'missing_table') throw error
        console.warn('[profile-content] profile pins unavailable; using regular post ordering', { userId })
        posts = await readPosts(false)
      }
      const [{ totalCount }] = await db.select({ totalCount: sql<number>`count(*)::int` }).from(disloopNewsPosts)
          .where(and(eq(disloopNewsPosts.authorId, userId), eq(disloopNewsPosts.isHidden, false)))
      const hasMore = posts.length > PAGE_SIZE
      return NextResponse.json({
        entries: posts.slice(0, PAGE_SIZE).map((post) => ({ ...post, createdAt: post.createdAt.toISOString() })),
        totalCount,
        hasMore,
      }, { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } })
    }

    if (tabValue === 'reels') {
      const sort = parseReelSort(request.nextUrl.searchParams.get('sort'))
      const viewCount = sql<number>`(select count(*)::int from ${disloopReelViews} where ${disloopReelViews.reelId} = ${disloopReels.id})`
      const likeCount = sql<number>`(select count(*)::int from ${disloopReelLikes} where ${disloopReelLikes.reelId} = ${disloopReels.id})`
      const order = sort === 'viewed'
        ? [desc(disloopReels.isPinned), desc(viewCount), desc(disloopReels.createdAt), desc(disloopReels.id)]
        : sort === 'liked'
          ? [desc(disloopReels.isPinned), desc(likeCount), desc(disloopReels.createdAt), desc(disloopReels.id)]
          : [desc(disloopReels.isPinned), desc(disloopReels.createdAt), desc(disloopReels.id)]
      const [reels, [{ totalCount }]] = await Promise.all([
        db.select({
          id: disloopReels.id,
          authorId: disloopReels.authorId,
          videoUrl: disloopReels.videoUrl,
          caption: disloopReels.caption,
          coverPath: disloopReels.coverPath,
          isPinned: disloopReels.isPinned,
          createdAt: disloopReels.createdAt,
          viewCount,
          likeCount,
        }).from(disloopReels)
          .where(and(eq(disloopReels.authorId, userId), eq(disloopReels.isHidden, false)))
          .orderBy(...order)
          .limit(PAGE_SIZE + 1)
          .offset(offset),
        db.select({ totalCount: sql<number>`count(*)::int` }).from(disloopReels)
          .where(and(eq(disloopReels.authorId, userId), eq(disloopReels.isHidden, false))),
      ])
      return NextResponse.json({
        entries: reels.slice(0, PAGE_SIZE).map((reel) => ({
          ...reel,
          coverUrl: reel.coverPath ? privateMediaUrl(reel.coverPath) : null,
          createdAt: reel.createdAt.toISOString(),
        })),
        totalCount,
        hasMore: reels.length > PAGE_SIZE,
      }, { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } })
    }

    if (profile.hideReposts && viewer?.id !== userId) {
      return NextResponse.json({ entries: [], totalCount: 0, hasMore: false }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const through = offset + PAGE_SIZE + 1
    const [news, reels, [{ newsCount }], [{ reelCount }]] = await Promise.all([
      db.select({
        id: disloopNewsPosts.id,
        type: sql<'news'>`'news'`,
        createdAt: disloopReposts.createdAt,
        title: disloopNewsPosts.title,
        body: disloopNewsPosts.body,
        caption: sql<string | null>`NULL`,
        coverUrl: disloopNewsPosts.coverUrl,
        videoUrl: sql<string | null>`NULL`,
        authorId: disloopNewsPosts.authorId,
        authorName: disloopUsers.displayName,
        authorUsername: disloopUsers.usernameDisplay,
      }).from(disloopReposts)
        .innerJoin(disloopNewsPosts, eq(disloopReposts.contentId, disloopNewsPosts.id))
        .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
        .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'news'), eq(disloopNewsPosts.isHidden, false)))
        .orderBy(desc(disloopReposts.createdAt), desc(disloopReposts.id))
        .limit(through),
      db.select({
        id: disloopReels.id,
        type: sql<'reel'>`'reel'`,
        createdAt: disloopReposts.createdAt,
        title: sql<string | null>`NULL`,
        body: sql<string | null>`NULL`,
        caption: disloopReels.caption,
        coverUrl: sql<string | null>`NULL`,
        videoUrl: disloopReels.videoUrl,
        authorId: disloopReels.authorId,
        authorName: disloopUsers.displayName,
        authorUsername: disloopUsers.usernameDisplay,
      }).from(disloopReposts)
        .innerJoin(disloopReels, eq(disloopReposts.contentId, disloopReels.id))
        .leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id))
        .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'reel'), eq(disloopReels.isHidden, false)))
        .orderBy(desc(disloopReposts.createdAt), desc(disloopReposts.id))
        .limit(through),
      db.select({ newsCount: sql<number>`count(*)::int` }).from(disloopReposts)
        .innerJoin(disloopNewsPosts, eq(disloopReposts.contentId, disloopNewsPosts.id))
        .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'news'), eq(disloopNewsPosts.isHidden, false))),
      db.select({ reelCount: sql<number>`count(*)::int` }).from(disloopReposts)
        .innerJoin(disloopReels, eq(disloopReposts.contentId, disloopReels.id))
        .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'reel'), eq(disloopReels.isHidden, false))),
    ])
    const entries = [...news, ...reels]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .slice(offset, offset + PAGE_SIZE)
      .map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        authorName: entry.authorName ?? 'Disloop Community',
        authorUsername: entry.authorUsername ?? 'community-team',
      }))
    const totalCount = newsCount + reelCount
    return NextResponse.json({ entries, totalCount, hasMore: offset + entries.length < totalCount }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('[profile-content] read failed', { userId, tab: tabValue, error })
    return NextResponse.json({ error: 'profile_content_unavailable' }, { status: 500 })
  }
}
