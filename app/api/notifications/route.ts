import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopFollows, disloopGroupInvites, disloopGroups, disloopNotifications, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { isNewAccount } from '@/lib/new-account'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const before = request.nextUrl.searchParams.get('before')
  const cursor = before ? new Date(before) : null
  if (cursor && Number.isNaN(cursor.getTime())) return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })
  try {
    const [{ unreadCount }] = await db.select({ unreadCount: sql<number>`count(*)::int` }).from(disloopNotifications)
      .where(and(eq(disloopNotifications.recipientId, user.id), sql`${disloopNotifications.readAt} IS NULL`, isNull(disloopNotifications.dismissedAt)))
    if (request.nextUrl.searchParams.get('summary') === '1') return NextResponse.json({ unreadCount })
    const conditions = [eq(disloopNotifications.recipientId, user.id), isNull(disloopNotifications.dismissedAt)]
    if (cursor) conditions.push(lt(disloopNotifications.createdAt, cursor))
    const rows = await db.select({
      id: disloopNotifications.id,
      type: disloopNotifications.type,
      targetType: disloopNotifications.targetType,
      targetId: disloopNotifications.targetId,
      createdAt: disloopNotifications.createdAt,
      readAt: disloopNotifications.readAt,
      actorId: disloopUsers.id,
      actorName: disloopUsers.displayName,
      actorUsername: disloopUsers.usernameDisplay,
      actorAvatar: disloopUsers.avatarUrl,
      actorCreatedAt: disloopUsers.createdAt,
      actorNameStyle: disloopUserFlair.nameStyle,
      actorCustomTitle: disloopUserFlair.customTitle,
      groupInviteId: disloopGroupInvites.id,
      groupInviteExpiresAt: disloopGroupInvites.expiresAt,
      groupInviteGroupId: disloopGroupInvites.groupId,
      groupInviteName: disloopGroups.name,
      groupInviteTag: disloopGroups.tag,
      viewerFollowingActor: sql<boolean>`exists (select 1 from ${disloopFollows} where ${disloopFollows.followerId} = ${user.id} and ${disloopFollows.followedId} = ${disloopUsers.id})`,
    }).from(disloopNotifications)
      .innerJoin(disloopUsers, eq(disloopNotifications.actorId, disloopUsers.id))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .leftJoin(disloopGroupInvites, and(
        eq(disloopNotifications.type, 'group_invite'),
        eq(disloopNotifications.targetType, 'group_invite'),
        eq(disloopNotifications.targetId, disloopGroupInvites.id),
        eq(disloopGroupInvites.inviteeId, user.id),
        eq(disloopGroupInvites.inviterId, disloopNotifications.actorId),
        gt(disloopGroupInvites.expiresAt, new Date()),
      ))
      .leftJoin(disloopGroups, eq(disloopGroupInvites.groupId, disloopGroups.id))
      .where(and(...conditions))
      .orderBy(desc(disloopNotifications.createdAt), desc(disloopNotifications.id))
      .limit(51)
    const page = rows.slice(0, 50)
    return NextResponse.json({
      unreadCount,
      notifications: page.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
        actorCreatedAt: row.actorCreatedAt.toISOString(),
        actorIsNewAccount: isNewAccount(row.actorCreatedAt),
        groupInvite: row.groupInviteId && row.groupInviteExpiresAt ? {
          id: row.groupInviteId,
          groupId: row.groupInviteGroupId,
          name: row.groupInviteName,
          tag: row.groupInviteTag,
          expiresAt: row.groupInviteExpiresAt.toISOString(),
          available: true,
        } : row.type === 'group_invite' ? {
          id: row.targetId,
          groupId: null,
          name: null,
          tag: null,
          expiresAt: null,
          available: false,
        } : null,
      })),
      nextCursor: rows.length > 50 ? page.at(-1)?.createdAt.toISOString() ?? null : null,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const value = error && typeof error === 'object' ? error as { code?: string; cause?: { code?: string } } : null
    const code = value?.code ?? value?.cause?.code
    if (code === '42P01' || code === '42703') {
      return NextResponse.json({ error: 'group_invites_unavailable', unavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(apiFailurePayload('notifications_failed', error, 'GET /api/notifications'), { status: 500 })
  }
}
