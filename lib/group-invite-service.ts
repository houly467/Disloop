import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopGroupInvites, disloopGroupMembers, disloopGroups, disloopNotifications } from '@/lib/db/schema'
import { canManageGroupInvites } from '@/lib/group-invites'

export async function cancelGroupInvite(inviteId: string, userId: string, groupId?: string) {
  return db.transaction(async (tx) => {
    const [invite] = await tx.select({
      id: disloopGroupInvites.id,
      groupId: disloopGroupInvites.groupId,
      inviterId: disloopGroupInvites.inviterId,
    }).from(disloopGroupInvites)
      .where(and(
        eq(disloopGroupInvites.id, inviteId),
        ...(groupId ? [eq(disloopGroupInvites.groupId, groupId)] : []),
      ))
      .for('update')
    if (!invite) return 'invite_unavailable' as const

    const [membership] = await tx.select({ role: disloopGroupMembers.role })
      .from(disloopGroupMembers)
      .where(and(eq(disloopGroupMembers.groupId, invite.groupId), eq(disloopGroupMembers.userId, userId)))
      .limit(1)
    if (invite.inviterId !== userId && !canManageGroupInvites(membership?.role)) return 'invite_permission_required' as const

    await tx.update(disloopNotifications).set({ dismissedAt: sql`now()`, readAt: sql`coalesce(${disloopNotifications.readAt}, now())` })
      .where(and(
        eq(disloopNotifications.targetType, 'group_invite'),
        eq(disloopNotifications.targetId, invite.id),
        isNull(disloopNotifications.dismissedAt),
      ))
    await tx.delete(disloopGroupInvites).where(eq(disloopGroupInvites.id, invite.id))
    return 'canceled' as const
  })
}
