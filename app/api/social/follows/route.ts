import { and, asc, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopFollows, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { areUsersBlocked } from '@/lib/relationship-access'
import { apiFailurePayload } from '@/lib/api-errors'
import { getFollowCounts } from '@/lib/social-follows'

export async function GET(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const userId = request.nextUrl.searchParams.get('userId')
  const direction = request.nextUrl.searchParams.get('direction') === 'following' ? 'following' : 'followers'
  if (!userId || !isUuid(userId)) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  try {
    const counts = await getFollowCounts(userId, access.user.id)
    if (request.nextUrl.searchParams.get('countsOnly') === 'true') {
      return NextResponse.json(counts, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const rows = await db.select({
      id: disloopUsers.id,
      username: disloopUsers.usernameDisplay,
      displayName: disloopUsers.displayName,
      avatarUrl: sql<string | null>`coalesce(${disloopUsers.profileAvatarUrl}, ${disloopUsers.avatarUrl})`,
      nameStyle: disloopUserFlair.nameStyle,
      customTitle: disloopUserFlair.customTitle,
    }).from(disloopFollows)
      .innerJoin(disloopUsers, eq(disloopUsers.id, direction === 'followers' ? disloopFollows.followerId : disloopFollows.followedId))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(and(direction === 'followers' ? eq(disloopFollows.followedId, userId) : eq(disloopFollows.followerId, userId), eq(disloopUsers.isMember, true)))
      .orderBy(asc(disloopUsers.usernameDisplay))
    const visible = []
    for (const row of rows) if (!(await areUsersBlocked(access.user.id, row.id))) visible.push(row)
    const relationships = await Promise.all(visible.map(async (row) => {
      const [following, followsYou] = await Promise.all([
        db.select({ id: disloopFollows.followerId }).from(disloopFollows).where(and(eq(disloopFollows.followerId, access.user.id), eq(disloopFollows.followedId, row.id))).limit(1),
        db.select({ id: disloopFollows.followerId }).from(disloopFollows).where(and(eq(disloopFollows.followerId, row.id), eq(disloopFollows.followedId, access.user.id))).limit(1),
      ])
      return { ...row, following: following.length > 0, followsYou: followsYou.length > 0 }
    }))
    return NextResponse.json({ ...counts, users: relationships }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('follow_list_failed', error, 'GET /api/social/follows'), {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const followerId = request.nextUrl.searchParams.get('followerId')
  const followedId = access.user.id
  if (!followerId || !isUuid(followerId) || followerId === followedId) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  try {
    await db.delete(disloopFollows).where(and(eq(disloopFollows.followerId, followerId), eq(disloopFollows.followedId, followedId)))
    return NextResponse.json({ removed: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('follow_remove_failed', error, 'DELETE /api/social/follows'), {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
