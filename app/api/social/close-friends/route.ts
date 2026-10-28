import { and, eq, inArray, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopCloseFriends, disloopFollows, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { canManageCloseFriend } from '@/lib/close-friend-rules'
import { rateLimitResponse } from '@/lib/rate-limit'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  try {
    const [friendRows, relationRows] = await Promise.all([
      db.select({ friendId: disloopCloseFriends.friendId }).from(disloopCloseFriends).where(eq(disloopCloseFriends.ownerId, user.id)),
      db.select({ followerId: disloopFollows.followerId, followedId: disloopFollows.followedId }).from(disloopFollows)
        .where(or(eq(disloopFollows.followerId, user.id), eq(disloopFollows.followedId, user.id))),
    ])
    const friendIds = new Set(friendRows.map((row) => row.friendId))
    const candidates = [...new Set(relationRows.map((row) => row.followerId === user.id ? row.followedId : row.followerId).filter((id) => id !== user.id))]
    if (!candidates.length) return NextResponse.json({ friends: [], candidates: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })
    const blocked = await db.select({ blockerId: disloopBlocks.blockerId, blockedId: disloopBlocks.blockedId }).from(disloopBlocks)
      .where(or(
        and(eq(disloopBlocks.blockerId, user.id), inArray(disloopBlocks.blockedId, candidates)),
        and(inArray(disloopBlocks.blockerId, candidates), eq(disloopBlocks.blockedId, user.id)),
      ))
    const blockedIds = new Set(blocked.flatMap((row) => [row.blockerId, row.blockedId].filter((id) => id !== user.id)))
    const people = await db.select({
      id: disloopUsers.id,
      displayName: disloopUsers.displayName,
      username: disloopUsers.usernameDisplay,
      avatarUrl: disloopUsers.avatarUrl,
      nameStyle: disloopUserFlair.nameStyle,
      customTitle: disloopUserFlair.customTitle,
    }).from(disloopUsers).leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(inArray(disloopUsers.id, candidates))
    const visible = people.filter((person) => !blockedIds.has(person.id)).map((person) => ({ ...person, isCloseFriend: friendIds.has(person.id) }))
    return NextResponse.json({
      friends: visible.filter((person) => person.isCloseFriend),
      candidates: visible,
      available: true,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[close-friends] list failed', { userId: user.id, error })
    return NextResponse.json({ friends: [], candidates: [], available: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`close-friends:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ friendId: z.string().refine(isUuid), add: z.boolean() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_close_friend' }, { status: 400 })
  if (data.friendId === user.id) return NextResponse.json({ error: 'invalid_close_friend' }, { status: 400 })
  try {
    const [relation] = await db.select({ followerId: disloopFollows.followerId }).from(disloopFollows)
      .where(or(
        and(eq(disloopFollows.followerId, user.id), eq(disloopFollows.followedId, data.friendId)),
        and(eq(disloopFollows.followerId, data.friendId), eq(disloopFollows.followedId, user.id)),
      )).limit(1)
    const [blocked] = await db.select({ blockerId: disloopBlocks.blockerId }).from(disloopBlocks)
      .where(or(
        and(eq(disloopBlocks.blockerId, user.id), eq(disloopBlocks.blockedId, data.friendId)),
        and(eq(disloopBlocks.blockerId, data.friendId), eq(disloopBlocks.blockedId, user.id)),
      )).limit(1)
    if (!canManageCloseFriend(user.id, data.friendId, Boolean(relation), Boolean(blocked))) return NextResponse.json({ error: 'not_related' }, { status: 404 })
    if (data.add) {
      await db.insert(disloopCloseFriends).values({ ownerId: user.id, friendId: data.friendId }).onConflictDoNothing()
    } else {
      await db.delete(disloopCloseFriends).where(and(eq(disloopCloseFriends.ownerId, user.id), eq(disloopCloseFriends.friendId, data.friendId)))
    }
    return NextResponse.json({ isCloseFriend: data.add })
  } catch (error) {
    console.error('[close-friends] update failed', { userId: user.id, friendId: data.friendId, error })
    return NextResponse.json({ error: 'close_friends_unavailable' }, { status: 503 })
  }
}
