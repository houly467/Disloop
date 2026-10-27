import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopChatReactions, disloopGroupInvites, disloopGroupMembers, disloopGroupMessages, disloopGroups, disloopNotifications, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { getMessageReactionSummaries } from '@/lib/chat'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'

type RouteProps = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })

  try {
    const [group] = await db.select({
      id: disloopGroups.id,
      name: disloopGroups.name,
      description: disloopGroups.description,
      tag: disloopGroups.tag,
      ownerId: disloopGroups.ownerId,
    }).from(disloopGroups).where(eq(disloopGroups.id, id)).limit(1)
    if (!group) return NextResponse.json({ error: 'group_not_found' }, { status: 404 })

    const [membership] = await db.select({ role: disloopGroupMembers.role })
      .from(disloopGroupMembers)
      .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, user.id)))
      .limit(1)
    if (!membership) return NextResponse.json({ error: 'group_membership_required' }, { status: 403 })

    const [members, messages] = await Promise.all([
      db.select({
        id: disloopUsers.id,
        displayName: disloopUsers.displayName,
        username: disloopUsers.usernameDisplay,
        avatarUrl: disloopUsers.avatarUrl,
        nameStyle: disloopUserFlair.nameStyle,
        customTitle: disloopUserFlair.customTitle,
        role: disloopGroupMembers.role,
        joinedAt: disloopGroupMembers.joinedAt,
      }).from(disloopGroupMembers)
        .innerJoin(disloopUsers, eq(disloopGroupMembers.userId, disloopUsers.id))
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(eq(disloopGroupMembers.groupId, id))
        .orderBy(desc(disloopGroupMembers.role), disloopGroupMembers.joinedAt)
        .limit(100),
      db.select({
        id: disloopGroupMessages.id,
        senderId: disloopGroupMessages.senderId,
        body: disloopGroupMessages.body,
        mediaUrl: disloopGroupMessages.mediaUrl,
        mediaType: disloopGroupMessages.mediaType,
        createdAt: disloopGroupMessages.createdAt,
        senderName: disloopUsers.displayName,
        senderAvatar: disloopUsers.avatarUrl,
        senderNameStyle: disloopUserFlair.nameStyle,
        senderCustomTitle: disloopUserFlair.customTitle,
      }).from(disloopGroupMessages)
        .innerJoin(disloopUsers, eq(disloopGroupMessages.senderId, disloopUsers.id))
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(eq(disloopGroupMessages.groupId, id))
        .orderBy(desc(disloopGroupMessages.createdAt), desc(disloopGroupMessages.id))
        .limit(50),
    ])

    const orderedMessages = messages.reverse()
    const reactions = await getMessageReactionSummaries('group', orderedMessages.map(({ id: messageId }) => messageId), user.id)
    return NextResponse.json({
      group,
      role: membership.role,
      members: members.map((member) => ({ ...member, joinedAt: member.joinedAt.toISOString() })),
      messages: orderedMessages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString(), reactions: reactions.get(message.id) ?? [] })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_load_failed', error, 'GET /api/groups/[id]'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`group-delete:${user.id}`, 5, 3600)
  if (rateLimit) return rateLimit

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })

  try {
    const result = await db.transaction(async (tx) => {
      const [group] = await tx.select({ ownerId: disloopGroups.ownerId })
        .from(disloopGroups)
        .where(eq(disloopGroups.id, id))
        .for('update')
      if (!group) return 'group_not_found' as const
      if (group.ownerId !== user.id) return 'group_owner_required' as const

      const invites = await tx.select({ id: disloopGroupInvites.id })
        .from(disloopGroupInvites)
        .where(eq(disloopGroupInvites.groupId, id))
      const inviteIds = invites.map(({ id: inviteId }) => inviteId)
      if (inviteIds.length) {
        await tx.delete(disloopNotifications).where(and(
          eq(disloopNotifications.targetType, 'group_invite'),
          inArray(disloopNotifications.targetId, inviteIds),
        ))
      }
      await tx.delete(disloopGroupInvites).where(eq(disloopGroupInvites.groupId, id))

      const messages = await tx.select({ id: disloopGroupMessages.id })
        .from(disloopGroupMessages)
        .where(eq(disloopGroupMessages.groupId, id))
      const messageIds = messages.map(({ id: messageId }) => messageId)
      if (messageIds.length) {
        await tx.delete(disloopChatReactions).where(and(
          eq(disloopChatReactions.chatType, 'group'),
          inArray(disloopChatReactions.messageId, messageIds),
        ))
      }
      await tx.delete(disloopGroupMessages).where(eq(disloopGroupMessages.groupId, id))
      await tx.delete(disloopGroupMembers).where(eq(disloopGroupMembers.groupId, id))
      await tx.delete(disloopGroups).where(eq(disloopGroups.id, id))
      return 'deleted' as const
    })

    if (result === 'group_not_found') return NextResponse.json({ error: result }, { status: 404 })
    if (result === 'group_owner_required') return NextResponse.json({ error: result }, { status: 403 })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_delete_failed', error, 'DELETE /api/groups/[id]'), { status: 500 })
  }
}
