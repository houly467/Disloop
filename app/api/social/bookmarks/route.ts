import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  disloopBlocks,
  disloopBookmarks,
  disloopNewsPosts,
  disloopReels,
  disloopUserFlair,
  disloopUsers,
} from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { rateLimitResponse } from '@/lib/rate-limit'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { isNewAccount } from '@/lib/new-account'

type SavedBookmark = {
  type: 'news' | 'reel'
  savedAt: string
  item: {
    id: string
    authorId: string
    title?: string
    body?: string
    category?: string
    coverUrl?: string | null
    videoUrl?: string
    caption?: string
    createdAt: string
    authorName: string | null
    authorUsername: string | null
    authorAvatar: string | null
    authorCreatedAt: string
    authorIsNewAccount: boolean
    authorNameStyle: string | null
    authorCustomTitle: string | null
  }
}

const bookmarkInput = z.object({
  contentType: z.enum(['news', 'reel']),
  contentId: z.string().refine(isUuid),
  saved: z.boolean(),
}).strict()

export async function GET(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const contentType = request.nextUrl.searchParams.get('contentType')
  const idsValue = request.nextUrl.searchParams.get('ids')
  if (idsValue !== null) {
    const ids = [...new Set(idsValue.split(',').filter(Boolean))]
    if (!['news', 'reel'].includes(contentType ?? '') || ids.length > 100 || ids.some((id) => !isUuid(id))) {
      return NextResponse.json({ savedIds: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!ids.length) return NextResponse.json({ savedIds: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })
    try {
      const rows = await db.select({ contentId: disloopBookmarks.contentId }).from(disloopBookmarks)
        .where(and(eq(disloopBookmarks.userId, user.id), eq(disloopBookmarks.contentType, contentType!), inArray(disloopBookmarks.contentId, ids)))
      return NextResponse.json({ savedIds: rows.map((row) => row.contentId), available: true }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error('[social-bookmarks] status read failed', { userId: user.id, contentType, error })
      return NextResponse.json({ savedIds: [], available: false }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }

  try {
    const rows = await db.select({
      contentType: disloopBookmarks.contentType,
      contentId: disloopBookmarks.contentId,
      createdAt: disloopBookmarks.createdAt,
    }).from(disloopBookmarks).where(eq(disloopBookmarks.userId, user.id))
      .orderBy(desc(disloopBookmarks.createdAt)).limit(100)
    const newsIds = rows.filter((row) => row.contentType === 'news').map((row) => row.contentId)
    const reelIds = rows.filter((row) => row.contentType === 'reel').map((row) => row.contentId)
    const [news, reels] = await Promise.all([
      newsIds.length ? db.select({
        id: disloopNewsPosts.id,
        authorId: disloopNewsPosts.authorId,
        title: disloopNewsPosts.title,
        body: disloopNewsPosts.body,
        category: disloopNewsPosts.category,
        coverUrl: disloopNewsPosts.coverUrl,
        createdAt: disloopNewsPosts.createdAt,
        authorName: disloopUsers.displayName,
        authorUsername: disloopUsers.usernameDisplay,
        authorAvatar: disloopUsers.avatarUrl,
        authorCreatedAt: disloopUsers.createdAt,
        authorNameStyle: disloopUserFlair.nameStyle,
        authorCustomTitle: disloopUserFlair.customTitle,
      }).from(disloopNewsPosts)
        .innerJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(and(inArray(disloopNewsPosts.id, newsIds), eq(disloopNewsPosts.isHidden, false))) : Promise.resolve([]),
      reelIds.length ? db.select({
        id: disloopReels.id,
        authorId: disloopReels.authorId,
        videoUrl: disloopReels.videoUrl,
        caption: disloopReels.caption,
        createdAt: disloopReels.createdAt,
        authorName: disloopUsers.displayName,
        authorUsername: disloopUsers.usernameDisplay,
        authorAvatar: disloopUsers.avatarUrl,
        authorCreatedAt: disloopUsers.createdAt,
        authorNameStyle: disloopUserFlair.nameStyle,
        authorCustomTitle: disloopUserFlair.customTitle,
      }).from(disloopReels)
        .innerJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id))
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(and(inArray(disloopReels.id, reelIds), eq(disloopReels.isHidden, false))) : Promise.resolve([]),
    ])
    const authors = [...new Set([...news.map((item) => item.authorId), ...reels.map((item) => item.authorId)].filter((id) => id !== user.id))]
    const blocked = authors.length ? await db.select({ blockerId: disloopBlocks.blockerId, blockedId: disloopBlocks.blockedId })
      .from(disloopBlocks)
      .where(or(
        and(eq(disloopBlocks.blockerId, user.id), inArray(disloopBlocks.blockedId, authors)),
        and(inArray(disloopBlocks.blockerId, authors), eq(disloopBlocks.blockedId, user.id)),
      )) : []
    const blockedIds = new Set(blocked.flatMap((row) => [row.blockerId, row.blockedId].filter((id) => id !== user.id)))
    const newsById = new Map(news.filter((item) => !blockedIds.has(item.authorId)).map((item) => [item.id, item]))
    const reelsById = new Map(reels.filter((item) => !blockedIds.has(item.authorId)).map((item) => [item.id, item]))
    const bookmarks = rows.flatMap<SavedBookmark>((row) => {
      if (row.contentType === 'news') {
        const item = newsById.get(row.contentId)
        return item ? [{ type: 'news' as const, savedAt: row.createdAt.toISOString(), item: { ...item, authorCreatedAt: item.authorCreatedAt.toISOString(), authorIsNewAccount: isNewAccount(item.authorCreatedAt), createdAt: item.createdAt.toISOString() } }] : []
      }
      if (row.contentType === 'reel') {
        const item = reelsById.get(row.contentId)
        return item ? [{ type: 'reel' as const, savedAt: row.createdAt.toISOString(), item: { ...item, authorCreatedAt: item.authorCreatedAt.toISOString(), authorIsNewAccount: isNewAccount(item.authorCreatedAt), createdAt: item.createdAt.toISOString() } }] : []
      }
      return []
    })
    return NextResponse.json({ bookmarks, available: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[social-bookmarks] list read failed', { userId: user.id, error })
    return NextResponse.json({ bookmarks: [], available: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`social-bookmarks:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, bookmarkInput)
  if (!data) return NextResponse.json({ error: 'invalid_bookmark' }, { status: 400 })

  try {
    const [content] = data.contentType === 'news'
      ? await db.select({ authorId: disloopNewsPosts.authorId }).from(disloopNewsPosts)
        .where(and(eq(disloopNewsPosts.id, data.contentId), eq(disloopNewsPosts.isHidden, false))).limit(1)
      : await db.select({ authorId: disloopReels.authorId }).from(disloopReels)
        .where(and(eq(disloopReels.id, data.contentId), eq(disloopReels.isHidden, false))).limit(1)
    if (!content) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    if (content.authorId !== user.id) {
      const [blocked] = await db.select({ blockerId: disloopBlocks.blockerId }).from(disloopBlocks)
        .where(or(
          and(eq(disloopBlocks.blockerId, user.id), eq(disloopBlocks.blockedId, content.authorId)),
          and(eq(disloopBlocks.blockerId, content.authorId), eq(disloopBlocks.blockedId, user.id)),
        )).limit(1)
      if (blocked) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    }

    if (data.saved) {
      await db.insert(disloopBookmarks).values({ userId: user.id, contentType: data.contentType, contentId: data.contentId }).onConflictDoNothing()
    } else {
      await db.delete(disloopBookmarks).where(and(
        eq(disloopBookmarks.userId, user.id),
        eq(disloopBookmarks.contentType, data.contentType),
        eq(disloopBookmarks.contentId, data.contentId),
      ))
    }
    return NextResponse.json({ saved: data.saved })
  } catch (error) {
    console.error('[social-bookmarks] update failed', { userId: user.id, contentType: data.contentType, contentId: data.contentId, error })
    return NextResponse.json({ error: 'bookmarks_unavailable' }, { status: 503 })
  }
}
