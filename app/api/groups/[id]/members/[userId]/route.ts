import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { apiFailurePayload } from '@/lib/api-errors'
import { db } from '@/lib/db'
import { disloopGroupMembers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { canManageGroupInvites } from '@/lib/group-invites'
import { rateLimitResponse } from '@/lib/rate-limit'
import { requireLoggedInServerMember } from '@/lib/server-member'

type RouteProps = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const { id, userId: targetUserId } = await params
  if (!isUuid(id) || !isUuid(targetUserId)) return NextResponse.json({ error: 'invalid_member' }, { status: 400 })
  const rateLimit = await rateLimitResponse(`group-kick:${access.user.id}`, 30, 3600)
  if (rateLimit) return rateLimit

  try {
    const result = await db.transaction(async (tx) => {
      const [actor] = await tx.select({ role: disloopGroupMembers.role })
        .from(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, access.user.id)))
        .for('update')
      if (!canManageGroupInvites(actor?.role)) return 'group_member_permission_required' as const

      const [target] = await tx.select({ role: disloopGroupMembers.role })
        .from(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, targetUserId)))
        .for('update')
      if (!target) return 'group_member_not_found' as const
      if (target.role === 'owner') return 'group_owner_cannot_be_removed' as const
      if (access.user.id === targetUserId) return 'cannot_remove_self' as const
      if (actor?.role === 'admin' && target.role === 'admin') return 'group_admin_permission_required' as const

      await tx.delete(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, targetUserId)))
      return 'removed' as const
    })

    if (result === 'group_member_permission_required' || result === 'group_admin_permission_required') {
      return NextResponse.json({ error: result }, { status: 403 })
    }
    if (result === 'group_member_not_found') return NextResponse.json({ error: result }, { status: 404 })
    if (result === 'group_owner_cannot_be_removed' || result === 'cannot_remove_self') {
      return NextResponse.json({ error: result }, { status: 409 })
    }
    return NextResponse.json({ removed: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_member_remove_failed', error, 'DELETE /api/groups/[id]/members/[userId]'), { status: 500 })
  }
}
