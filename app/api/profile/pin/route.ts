import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopNewsPosts, disloopProfilePins } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { rateLimitResponse } from '@/lib/rate-limit'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { parseJsonBody } from '@/lib/validation'
import { getCurrentUser } from '@/lib/session'
import { areUsersBlocked } from '@/lib/relationship-access'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId || !isUuid(userId)) return NextResponse.json({ postId: null, available: true }, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const viewer = await getCurrentUser()
    if (viewer && viewer.id !== userId && await areUsersBlocked(viewer.id, userId)) {
      return NextResponse.json({ postId: null, available: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const [pin] = await db.select({ postId: disloopProfilePins.postId })
      .from(disloopProfilePins)
      .innerJoin(disloopNewsPosts, and(
        eq(disloopNewsPosts.id, disloopProfilePins.postId),
        eq(disloopNewsPosts.authorId, disloopProfilePins.userId),
        eq(disloopNewsPosts.isHidden, false),
      ))
      .where(eq(disloopProfilePins.userId, userId)).limit(1)
    return NextResponse.json({ postId: pin?.postId ?? null, available: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[profile-pin] read failed', { userId, error })
    return NextResponse.json({ postId: null, available: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`profile-pin:${user.id}`, 20, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ postId: z.string().nullable() }).strict())
  if (!data || (data.postId !== null && !isUuid(data.postId))) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 400 })
  }

  try {
    if (data.postId === null) {
      await db.delete(disloopProfilePins).where(eq(disloopProfilePins.userId, user.id))
      return NextResponse.json({ postId: null })
    }
    const [post] = await db.select({ id: disloopNewsPosts.id }).from(disloopNewsPosts)
      .where(and(
        eq(disloopNewsPosts.id, data.postId),
        eq(disloopNewsPosts.authorId, user.id),
        eq(disloopNewsPosts.isHidden, false),
      )).limit(1)
    if (!post) return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
    await db.insert(disloopProfilePins).values({ userId: user.id, postId: post.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: disloopProfilePins.userId, set: { postId: post.id, updatedAt: new Date() } })
    return NextResponse.json({ postId: post.id })
  } catch (error) {
    console.error('[profile-pin] update failed', { userId: user.id, postId: data.postId, error })
    return NextResponse.json({ error: 'profile_pin_unavailable' }, { status: 503 })
  }
}
