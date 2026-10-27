import { and, desc, eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopFollows, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'

export async function GET(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const rows = await db.select({ id: disloopUsers.id, username: disloopUsers.usernameDisplay, displayName: disloopUsers.displayName, avatarUrl: disloopUsers.profileAvatarUrl, createdAt: disloopBlocks.createdAt })
    .from(disloopBlocks).innerJoin(disloopUsers, eq(disloopUsers.id, disloopBlocks.blockedId))
    .where(eq(disloopBlocks.blockerId, access.user.id)).orderBy(desc(disloopBlocks.createdAt))
  return NextResponse.json({ blocks: rows })
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const targetId = request.nextUrl.searchParams.get('userId')
  if (!targetId || !isUuid(targetId) || targetId === access.user.id) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  const [target] = await db.select({ id: disloopUsers.id }).from(disloopUsers).where(and(eq(disloopUsers.id, targetId), eq(disloopUsers.isMember, true))).limit(1)
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  await db.transaction(async (tx) => {
    await tx.insert(disloopBlocks).values({ blockerId: access.user.id, blockedId: targetId }).onConflictDoNothing()
    await tx.delete(disloopFollows).where(orPair(access.user.id, targetId))
  })
  return NextResponse.json({ blocked: true })
}

export async function DELETE(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const targetId = request.nextUrl.searchParams.get('userId')
  if (!targetId || !isUuid(targetId) || targetId === access.user.id) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  await db.delete(disloopBlocks).where(and(eq(disloopBlocks.blockerId, access.user.id), eq(disloopBlocks.blockedId, targetId)))
  return NextResponse.json({ blocked: false })
}

function orPair(a: string, b: string) {
  return or(and(eq(disloopFollows.followerId, a), eq(disloopFollows.followedId, b)), and(eq(disloopFollows.followerId, b), eq(disloopFollows.followedId, a)))
}
