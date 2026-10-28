import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopGroupInvites, disloopGroupInviteResponses, disloopGroupMembers, disloopGroups, disloopNotifications } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { GROUP_MEMBER_LIMIT, resolveInviteAction } from '@/lib/group-invites'
import { areUsersBlocked } from '@/lib/relationship-access'
import { cancelGroupInvite } from '@/lib/group-invite-service'
import { z } from 'zod'

type RouteProps = { params?: Promise<{ inviteId: string }> }

function isMissingInviteSchema(error: unknown) {
  const value = error && typeof error === 'object' ? error as { code?: string; cause?: { code?: string } } : null
  const code = value?.code ?? value?.cause?.code
  return code === '42P01' || code === '42703'
}

function unavailableResponse() {
  return NextResponse.json({ error: 'group_invites_unavailable', unavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

const errorStatus: Record<string, number> = {
  invitee_required: 403,
  invite_unavailable: 404,
  group_not_found: 404,
  invite_already_responded: 409,
  group_membership_exists: 409,
  group_full: 409,
}

export async function POST(request: NextRequest | undefined, context?: RouteProps) {
  if (!request || !context || !context.params) {
    return NextResponse.json({ error: 'group_invites_disabled' }, { status: 410 })
  }
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`group-invite-response:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit
  const params = await context.params
  const inviteId = params.inviteId
  if (!isUuid(inviteId)) return NextResponse.json({ error: 'invite_unavailable' }, { status: 404 })
  const data = await parseJsonBody(request, z.object({ action: z.enum(['accept', 'reject']) }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_invite_action' }, { status: 400 })

  try {
    const [existingInvite] = await db.select({
      inviteeId: disloopGroupInvites.inviteeId,
      inviterId: disloopGroupInvites.inviterId,
    }).from(disloopGroupInvites)
      .where(eq(disloopGroupInvites.id, inviteId))
      .limit(1)
    if (existingInvite && existingInvite.inviteeId !== user.id) return NextResponse.json({ error: 'invitee_required' }, { status: 403 })
    if (existingInvite && data.action === 'accept' && await areUsersBlocked(existingInvite.inviterId, user.id)) {
      return NextResponse.json({ error: 'blocked' }, { status: 403 })
    }

    const result = await db.transaction(async (tx) => {
      const [invite] = await tx.select({
        id: disloopGroupInvites.id,
        groupId: disloopGroupInvites.groupId,
        inviterId: disloopGroupInvites.inviterId,
        inviteeId: disloopGroupInvites.inviteeId,
      }).from(disloopGroupInvites)
        .where(eq(disloopGroupInvites.id, inviteId))
        .for('update')
      const [previousResponse] = await tx.select({
        groupId: disloopGroupInviteResponses.groupId,
        inviteeId: disloopGroupInviteResponses.inviteeId,
        status: disloopGroupInviteResponses.status,
      }).from(disloopGroupInviteResponses)
        .where(eq(disloopGroupInviteResponses.inviteId, inviteId))
        .limit(1)

      if (!invite) {
        const decision = resolveInviteAction({
          action: data.action,
          inviteeMatchesSession: previousResponse?.inviteeId === user.id,
          inviteExists: false,
          existingStatus: previousResponse?.status ?? null,
          groupExists: Boolean(previousResponse),
          inviteGroupId: previousResponse?.groupId ?? '',
          memberGroupId: null,
          groupFull: false,
        })
        if ('error' in decision) return decision
        return { ...decision, groupId: previousResponse?.groupId ?? null, groupName: null }
      }

      const inviteeMatchesSession = invite.inviteeId === user.id
      if (!inviteeMatchesSession) return { error: 'invitee_required' as const }

      const [group] = await tx.select({
        id: disloopGroups.id,
        name: disloopGroups.name,
      }).from(disloopGroups)
        .where(eq(disloopGroups.id, invite.groupId))
        .for('update')
      const [membership] = await tx.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(eq(disloopGroupMembers.userId, user.id))
        .for('update')
      const [{ count: memberCount }] = group
        ? await tx.select({ count: sql<number>`count(*)::int` })
          .from(disloopGroupMembers)
          .where(eq(disloopGroupMembers.groupId, invite.groupId))
        : [{ count: 0 }]
      const decision = resolveInviteAction({
        action: data.action,
        inviteeMatchesSession,
        inviteExists: true,
        existingStatus: null,
        groupExists: Boolean(group),
        inviteGroupId: invite.groupId,
        memberGroupId: membership?.groupId ?? null,
        groupFull: Number(memberCount) >= GROUP_MEMBER_LIMIT,
      })
      if ('error' in decision) return decision

      if (decision.status === 'accepted' && membership?.groupId !== invite.groupId) {
        await tx.insert(disloopGroupMembers).values({ groupId: invite.groupId, userId: user.id, role: 'member' })
      }
      await tx.insert(disloopGroupInviteResponses).values({
        inviteId,
        groupId: invite.groupId,
        inviterId: invite.inviterId,
        inviteeId: invite.inviteeId,
        status: decision.status,
      })
      await tx.update(disloopNotifications).set({ readAt: sql`now()`, dismissedAt: sql`now()` })
        .where(and(
          eq(disloopNotifications.type, 'group_invite'),
          eq(disloopNotifications.targetType, 'group_invite'),
          eq(disloopNotifications.targetId, inviteId),
          eq(disloopNotifications.recipientId, user.id),
        ))
      await tx.delete(disloopGroupInvites).where(eq(disloopGroupInvites.id, inviteId))
      return { ...decision, groupId: invite.groupId, groupName: group?.name ?? null }
    })

    if ('error' in result) {
      const errorCode = String(result.error ?? '')
      return NextResponse.json({ error: errorCode }, { status: errorStatus[errorCode] ?? 409 })
    }
    if (result.status === 'accepted') {
      return NextResponse.json({
        status: result.status,
        repeated: result.repeated,
        groupId: 'groupId' in result ? (result.groupId ?? null) : null,
        groupName: 'groupName' in result ? (result.groupName ?? null) : null,
      })
    }
    return NextResponse.json({
      status: result.status,
      repeated: result.repeated,
    })
  } catch (error) {
    if (isMissingInviteSchema(error)) return unavailableResponse()
    return NextResponse.json(apiFailurePayload('group_invite_response_failed', error, 'POST /api/groups/invites/[inviteId]'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest | undefined, context?: RouteProps) {
  if (!request || !context || !context.params) {
    return NextResponse.json({ error: 'group_invites_disabled' }, { status: 410 })
  }
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const params = await context.params
  const inviteId = params.inviteId
  if (!isUuid(inviteId)) return NextResponse.json({ error: 'invite_unavailable' }, { status: 404 })
  const rateLimit = await rateLimitResponse(`group-invite-cancel:${access.user.id}`, 60, 3600)
  if (rateLimit) return rateLimit

  try {
    const result = await cancelGroupInvite(inviteId, access.user.id)
    if (result === 'invite_permission_required') return NextResponse.json({ error: result }, { status: 403 })
    if (result === 'invite_unavailable') return NextResponse.json({ error: result }, { status: 404 })
    return NextResponse.json({ canceled: true })
  } catch (error) {
    if (isMissingInviteSchema(error)) return unavailableResponse()
    return NextResponse.json(apiFailurePayload('group_invite_cancel_failed', error, 'DELETE /api/groups/invites/[inviteId]'), { status: 500 })
  }
}
