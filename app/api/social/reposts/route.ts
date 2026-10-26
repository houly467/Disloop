import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopNewsPosts, disloopReels, disloopReposts, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { awardCappedRepostXp, createNotification, type SocialContentType } from '@/lib/social'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const contentTypes = new Set<SocialContentType>(['news', 'reel', 'daily'])

function isContentType(value: unknown): value is SocialContentType {
  return typeof value === 'string' && contentTypes.has(value as SocialContentType)
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const contentId = request.nextUrl.searchParams.get('id')
  const userId = request.nextUrl.searchParams.get('userId')
  try {
    if (type && contentId && isContentType(type) && isUuid(contentId)) {
      const viewer = await getCurrentUser()
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(disloopReposts)
        .where(and(eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId)))
      const existing = viewer ? await db.select({ id: disloopReposts.id }).from(disloopReposts)
        .where(and(eq(disloopReposts.userId, viewer.id), eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId))).limit(1) : []
      return NextResponse.json({ count, repostedByMe: existing.length > 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_profile' }, { status: 400 })
    const news = await db.select({
      id: disloopNewsPosts.id,
      repostedAt: disloopReposts.createdAt,
      title: disloopNewsPosts.title,
      body: disloopNewsPosts.body,
      coverUrl: disloopNewsPosts.coverUrl,
      authorId: disloopNewsPosts.authorId,
      authorName: disloopUsers.displayName,
      authorUsername: disloopUsers.usernameDisplay,
      authorAvatar: disloopUsers.avatarUrl,
    }).from(disloopReposts)
      .innerJoin(disloopNewsPosts, eq(disloopReposts.contentId, disloopNewsPosts.id))
      .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
      .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'news'), eq(disloopNewsPosts.isHidden, false)))
      .orderBy(desc(disloopReposts.createdAt)).limit(30)
    const reels = await db.select({
      id: disloopReels.id,
      repostedAt: disloopReposts.createdAt,
      caption: disloopReels.caption,
      videoUrl: disloopReels.videoUrl,
      authorId: disloopReels.authorId,
      authorName: disloopUsers.displayName,
      authorUsername: disloopUsers.usernameDisplay,
      authorAvatar: disloopUsers.avatarUrl,
    }).from(disloopReposts)
      .innerJoin(disloopReels, eq(disloopReposts.contentId, disloopReels.id))
      .leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id))
      .where(and(eq(disloopReposts.userId, userId), eq(disloopReposts.contentType, 'reel'), eq(disloopReels.isHidden, false)))
      .orderBy(desc(disloopReposts.createdAt)).limit(30)
    const entries = [
      ...news.map((item) => ({ type: 'news' as const, ...item, createdAt: item.repostedAt.toISOString(), authorName: item.authorName ?? 'Disloop Community', authorUsername: item.authorUsername ?? 'community-team' })),
      ...reels.map((item) => ({ type: 'reel' as const, ...item, createdAt: item.repostedAt.toISOString(), authorName: item.authorName ?? 'Disloop Community', authorUsername: item.authorUsername ?? 'community-team' })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
    return NextResponse.json({ reposts: entries }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reposts_failed', error, 'GET /api/social/reposts'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`reposts:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ type: z.enum(['news', 'reel', 'daily']), contentId: z.uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const { type, contentId } = data

  try {
    const source = type === 'news'
      ? await db.select({ id: disloopNewsPosts.id, authorId: disloopNewsPosts.authorId }).from(disloopNewsPosts).where(and(eq(disloopNewsPosts.id, contentId), eq(disloopNewsPosts.isHidden, false))).limit(1)
      : type === 'reel'
        ? await db.select({ id: disloopReels.id, authorId: disloopReels.authorId }).from(disloopReels).where(and(eq(disloopReels.id, contentId), eq(disloopReels.isHidden, false))).limit(1)
        : await db.select({ id: disloopDailyPosts.id, authorId: disloopDailyPosts.authorId }).from(disloopDailyPosts).where(and(eq(disloopDailyPosts.id, contentId), eq(disloopDailyPosts.isHidden, false))).limit(1)
    const original = source[0]
    if (!original) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    if (original.authorId === user.id) return NextResponse.json({ error: 'cannot_repost_own_content' }, { status: 403 })
    const [created] = await db.insert(disloopReposts).values({ userId: user.id, contentType: type, contentId }).onConflictDoNothing().returning({ id: disloopReposts.id })
    if (created) {
      await Promise.allSettled([
        createNotification({ recipientId: original.authorId, actorId: user.id, type: 'repost', targetType: type, targetId: contentId }),
        awardCappedRepostXp(original.authorId, type, contentId),
      ])
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(disloopReposts)
      .where(and(eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId)))
    return NextResponse.json({ reposted: true, count }, { status: created ? 201 : 200 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('repost_failed', error, 'POST /api/social/reposts'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`reposts:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ type: z.enum(['news', 'reel', 'daily']), contentId: z.uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const { type, contentId } = data
  try {
    await db.delete(disloopReposts).where(and(eq(disloopReposts.userId, user.id), eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId)))
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(disloopReposts)
      .where(and(eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId)))
    return NextResponse.json({ reposted: false, count })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('unrepost_failed', error, 'DELETE /api/social/reposts'), { status: 500 })
  }
}
