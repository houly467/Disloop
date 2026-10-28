import { apiFailurePayload } from '@/lib/api-errors'
import { and, asc, eq, gt, ilike, ne, notExists, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopGroupInvites, disloopGroupInviteResponses, disloopGroupMembers, disloopGroups, disloopNotifications, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { canManageGroupInvites, inviteEligibilityError } from '@/lib/group-invites'
import { cancelGroupInvite } from '@/lib/group-invite-service'
import { areUsersBlocked } from '@/lib/relationship-access'
import { isNewAccount } from '@/lib/new-account'
import { z } from 'zod'

type RouteProps = { params: Promise<{ id: string }> }

function isMissingInviteSchema(error: unknown) {
  const value = error && typeof error === 'object' ? error as { code?: string; cause?: { code?: string } } : null
  const code = value?.code ?? value?.cause?.code
  return code === '42P01' || code === '42703'
}

function unavailableResponse() {
  return NextResponse.json({ error: 'group_invites_unavailable', unavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })

  try {
    const [membership] = await db.select({ role: disloopGroupMembers.role })
      .from(disloopGroupMembers)
      .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, user.id)))
      .limit(1)
    if (!canManageGroupInvites(membership?.role)) return NextResponse.json({ error: 'group_invite_permission_required' }, { status: 403 })

    const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (query) {
      if (query.length < 2) return NextResponse.json({ people: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
      const rateLimit = await rateLimitResponse(`group-invite-search:${user.id}`, 60, 60)
      if (rateLimit) return rateLimit
      const pattern = `%${query.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`
      const people = await db.select({
        id: disloopUsers.id,
        username: disloopUsers.usernameDisplay,
        displayName: disloopUsers.displayName,
        avatarUrl: disloopUsers.avatarUrl,
        accountCreatedAt: disloopUsers.createdAt,
        nameStyle: disloopUserFlair.nameStyle,
        customTitle: disloopUserFlair.customTitle,
        staffRole: disloopUsers.isStaffRole,
        hasPendingInvite: sql<boolean>`exists (
          select 1 from ${disloopGroupInvites}
          where ${disloopGroupInvites.groupId} = ${id}
            and ${disloopGroupInvites.inviteeId} = ${disloopUsers.id}
            and ${disloopGroupInvites.expiresAt} > now()
        )`,
      }).from(disloopUsers)
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(and(
          eq(disloopUsers.isSeed, false),
          ne(disloopUsers.id, user.id),
          or(ilike(disloopUsers.usernameDisplay, pattern), ilike(disloopUsers.displayName, pattern)),
          notExists(db.select({ userId: disloopGroupMembers.userId }).from(disloopGroupMembers)
            .where(eq(disloopGroupMembers.userId, disloopUsers.id))),
          notExists(db.select({ id: disloopGroupInvites.id }).from(disloopGroupInvites)
            .where(and(
              eq(disloopGroupInvites.groupId, id),
              eq(disloopGroupInvites.inviteeId, disloopUsers.id),
              gt(disloopGroupInvites.expiresAt, new Date()),
            ))),
          notExists(db.select({ blockerId: disloopBlocks.blockerId }).from(disloopBlocks)
            .where(or(
              and(eq(disloopBlocks.blockerId, user.id), eq(disloopBlocks.blockedId, disloopUsers.id)),
              and(eq(disloopBlocks.blockerId, disloopUsers.id), eq(disloopBlocks.blockedId, user.id)),
            ))),
        ))
        .orderBy(asc(disloopUsers.displayName))
        .limit(20)
      return NextResponse.json({
        people: people.map(({ accountCreatedAt, ...person }) => ({ ...person, isNewAccount: isNewAccount(accountCreatedAt) })),
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const [invites, history] = await Promise.all([
      db.select({
        id: disloopGroupInvites.id,
        inviteeId: disloopUsers.id,
        displayName: disloopUsers.displayName,
        username: disloopUsers.usernameDisplay,
        avatarUrl: disloopUsers.avatarUrl,
        createdAt: disloopGroupInvites.createdAt,
        expiresAt: disloopGroupInvites.expiresAt,
      }).from(disloopGroupInvites)
        .innerJoin(disloopUsers, eq(disloopUsers.id, disloopGroupInvites.inviteeId))
        .where(and(eq(disloopGroupInvites.groupId, id), gt(disloopGroupInvites.expiresAt, new Date())))
        .orderBy(asc(disloopGroupInvites.createdAt))
        .limit(100),
      db.select({
        inviteeId: disloopGroupInviteResponses.inviteeId,
        displayName: disloopUsers.displayName,
        username: disloopUsers.usernameDisplay,
        status: disloopGroupInviteResponses.status,
        actedAt: disloopGroupInviteResponses.actedAt,
      }).from(disloopGroupInviteResponses)
        .innerJoin(disloopUsers, eq(disloopUsers.id, disloopGroupInviteResponses.inviteeId))
        .where(and(
          eq(disloopGroupInviteResponses.groupId, id),
          eq(disloopGroupInviteResponses.inviterId, user.id),
        ))
        .orderBy(asc(disloopGroupInviteResponses.actedAt))
        .limit(100),
    ])
    return NextResponse.json({
      invites: invites.map((invite) => ({ ...invite, createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt.toISOString() })),
      history: history.map((invite) => ({ ...invite, actedAt: invite.actedAt.toISOString() })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isMissingInviteSchema(error)) return unavailableResponse()
    return NextResponse.json(apiFailurePayload('group_invites_failed', error, 'GET /api/groups/[id]/invites'), { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`group-invites:${user.id}`, 20, 3600)
  if (rateLimit) return rateLimit
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  const data = await parseJsonBody(request, z.object({ userId: z.string().uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })

  try {
    if (await areUsersBlocked(user.id, data.userId)) return NextResponse.json({ error: 'blocked' }, { status: 403 })
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${data.userId}, 0))`)
      const [group] = await tx.select({ id: disloopGroups.id })
        .from(disloopGroups).where(eq(disloopGroups.id, id)).limit(1)
      if (!group) return { error: 'group_not_found' as const }

      const [membership] = await tx.select({ role: disloopGroupMembers.role })
        .from(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, user.id)))
        .limit(1)
      if (!canManageGroupInvites(membership?.role)) return { error: 'group_invite_permission_required' as const }

      const [target] = await tx.select({ id: disloopUsers.id })
        .from(disloopUsers).where(eq(disloopUsers.id, data.userId)).limit(1)
      if (!target) return { error: 'user_not_found' as const }

      const [targetMembership] = await tx.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(eq(disloopGroupMembers.userId, data.userId))
        .limit(1)
      const [existingInvite] = await tx.select({
        id: disloopGroupInvites.id,
        expiresAt: disloopGroupInvites.expiresAt,
      }).from(disloopGroupInvites)
        .where(and(eq(disloopGroupInvites.groupId, id), eq(disloopGroupInvites.inviteeId, data.userId)))
        .limit(1)
      const hasPendingInvite = Boolean(existingInvite && existingInvite.expiresAt > new Date())
      const eligibilityError = inviteEligibilityError({
        blocked: false,
        memberGroupId: targetMembership?.groupId ?? null,
        hasPendingInvite,
      }, id)
      if (eligibilityError) return { error: eligibilityError as 'already_member' | 'group_membership_exists' | 'invite_exists' }

      if (existingInvite) {
        await tx.update(disloopNotifications).set({ dismissedAt: sql`now()`, readAt: sql`coalesce(${disloopNotifications.readAt}, now())` })
          .where(and(eq(disloopNotifications.targetType, 'group_invite'), eq(disloopNotifications.targetId, existingInvite.id)))
        await tx.delete(disloopGroupInvites).where(eq(disloopGroupInvites.id, existingInvite.id))
      }

      const [invite] = await tx.insert(disloopGroupInvites)
        .values({ groupId: id, inviterId: user.id, inviteeId: data.userId })
        .returning({ id: disloopGroupInvites.id, createdAt: disloopGroupInvites.createdAt, expiresAt: disloopGroupInvites.expiresAt })
      await tx.insert(disloopNotifications).values({
        recipientId: data.userId,
        actorId: user.id,
        type: 'group_invite',
        targetType: 'group_invite',
        targetId: invite.id,
      })
      return { invite }
    })

    if ('error' in result) {
      const errorCode = String(result.error ?? '')
      const status = errorCode === 'group_not_found' || errorCode === 'user_not_found'
        ? 404
        : errorCode === 'group_invite_permission_required' || errorCode === 'blocked'
          ? 403
          : 409
      return NextResponse.json({ error: errorCode }, { status })
    }
    return NextResponse.json({
      invite: { ...result.invite, createdAt: result.invite.createdAt.toISOString(), expiresAt: result.invite.expiresAt.toISOString() },
    }, { status: 201 })
  } catch (error) {
    if (isMissingInviteSchema(error)) return unavailableResponse()
    const value = error && typeof error === 'object' ? error as { code?: string; cause?: { code?: string } } : null
    if ((value?.code ?? value?.cause?.code) === '23505') return NextResponse.json({ error: 'invite_exists' }, { status: 409 })
    return NextResponse.json(apiFailurePayload('group_invite_failed', error, 'POST /api/groups/[id]/invites'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  const data = await parseJsonBody(request, z.object({ inviteId: z.string().uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })
  const rateLimit = await rateLimitResponse(`group-invite-cancel:${user.id}`, 60, 3600)
  if (rateLimit) return rateLimit

  try {
    const result = await cancelGroupInvite(data.inviteId, user.id, id)
    if (result === 'invite_permission_required') return NextResponse.json({ error: result }, { status: 403 })
    if (result === 'invite_unavailable') return NextResponse.json({ error: result }, { status: 404 })
    return NextResponse.json({ canceled: true })
  } catch (error) {
    if (isMissingInviteSchema(error)) return unavailableResponse()
    return NextResponse.json(apiFailurePayload('group_invite_cancel_failed', error, 'DELETE /api/groups/[id]/invites'), { status: 500 })
  }
}
