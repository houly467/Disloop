import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopLikes, disloopNewsPosts, disloopReelLikes } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { isUuid } from '@/lib/dm'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const contentTypes = new Set(['news', 'reel', 'daily'])

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const contentId = request.nextUrl.searchParams.get('id')
  if (!type || !contentTypes.has(type) || !contentId || !isUuid(contentId)) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const viewer = await getCurrentUser()
  try {
    const [{ count }] = type === 'reel'
      ? await db.select({ count: sql<number>`count(*)::int` }).from(disloopReelLikes).where(eq(disloopReelLikes.reelId, contentId))
      : await db.select({ count: sql<number>`count(*)::int` }).from(disloopLikes).where(and(eq(disloopLikes.contentType, type), eq(disloopLikes.contentId, contentId)))
    const mine = viewer ? type === 'reel'
      ? await db.select({ userId: disloopReelLikes.userId }).from(disloopReelLikes).where(and(eq(disloopReelLikes.reelId, contentId), eq(disloopReelLikes.userId, viewer.id))).limit(1)
      : await db.select({ userId: disloopLikes.userId }).from(disloopLikes).where(and(eq(disloopLikes.contentType, type), eq(disloopLikes.contentId, contentId), eq(disloopLikes.userId, viewer.id))).limit(1) : []
    return NextResponse.json({ count, likedByMe: mine.length > 0 }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('likes_unavailable', error, 'GET /api/social/likes'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`likes:${user.id}`, 60, 60)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ type: z.enum(['news', 'daily']), contentId: z.uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const contentType = data.type
  try {
    const content = contentType === 'news'
      ? await db.select({ id: disloopNewsPosts.id, authorId: disloopNewsPosts.authorId }).from(disloopNewsPosts).where(and(eq(disloopNewsPosts.id, data.contentId), eq(disloopNewsPosts.isHidden, false))).limit(1)
      : await db.select({ id: disloopDailyPosts.id, authorId: disloopDailyPosts.authorId }).from(disloopDailyPosts).where(and(eq(disloopDailyPosts.id, data.contentId), eq(disloopDailyPosts.isHidden, false))).limit(1)
    const post = content[0]
    if (!post) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    if (post.authorId === user.id) return NextResponse.json({ error: 'cannot_like_own_content' }, { status: 403 })
    const [existing] = await db.select({ userId: disloopLikes.userId }).from(disloopLikes).where(and(eq(disloopLikes.contentType, contentType), eq(disloopLikes.contentId, data.contentId), eq(disloopLikes.userId, user.id))).limit(1)
    let liked = Boolean(existing)
    if (existing) {
      await db.delete(disloopLikes).where(and(eq(disloopLikes.contentType, contentType), eq(disloopLikes.contentId, data.contentId), eq(disloopLikes.userId, user.id)))
      liked = false
    } else {
      await db.insert(disloopLikes).values({ contentType, contentId: data.contentId, userId: user.id }).onConflictDoNothing()
      liked = true
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(disloopLikes).where(and(eq(disloopLikes.contentType, contentType), eq(disloopLikes.contentId, data.contentId)))
    return NextResponse.json({ liked, count })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('like_update_failed', error, '/api/social/likes'), { status: 500 })
  }
}
