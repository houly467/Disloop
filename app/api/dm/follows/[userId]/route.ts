import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopFollows, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { createNotification } from '@/lib/social'

type RouteProps = { params: Promise<{ userId: string }> }

async function getTarget(userId: string) {
  const [target] = await db
    .select({ id: disloopUsers.id })
    .from(disloopUsers)
    .where(and(eq(disloopUsers.id, userId), eq(disloopUsers.isMember, true), eq(disloopUsers.isSeed, false)))
    .limit(1)
  return target ?? null
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`follows:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit
  const { userId } = await params
  if (!isUuid(userId) || userId === user.id) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })

  try {
    if (!(await getTarget(userId))) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    const [created] = await db.insert(disloopFollows).values({ followerId: user.id, followedId: userId }).onConflictDoNothing().returning({ followerId: disloopFollows.followerId })
    if (created) await createNotification({ recipientId: userId, actorId: user.id, type: 'follow', targetType: 'profile', targetId: user.id })
    return NextResponse.json({ following: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('follow_failed', error, 'POST /api/dm/follows/[userId]'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`follows:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit
  const { userId } = await params
  if (!isUuid(userId) || userId === user.id) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })

  try {
    await db.delete(disloopFollows)
      .where(and(eq(disloopFollows.followerId, user.id), eq(disloopFollows.followedId, userId)))
    return NextResponse.json({ following: false })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('unfollow_failed', error, 'DELETE /api/dm/follows/[userId]'), { status: 500 })
  }
}
