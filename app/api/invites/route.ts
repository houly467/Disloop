import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopInvites } from '@/lib/db/schema'
import { safeApiFailureReason } from '@/lib/api-errors'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { awardXp } from '@/lib/gamification'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  try {
    const [invite] = await db.select({ inviteCode: disloopInvites.inviteCode }).from(disloopInvites)
      .where(eq(disloopInvites.inviterId, user.id)).limit(1)
    return NextResponse.json({ inviteCode: invite?.inviteCode ?? null, inviteUrl: invite ? `${process.env.SITE_URL?.replace(/\/+$/, '') || ''}/?section=stories&invite=${encodeURIComponent(invite.inviteCode)}` : null }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[invites] link retrieval failed', { userId: user.id, reason: safeApiFailureReason(error) })
    return NextResponse.json({ error: 'invites_unavailable' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const limited = await rateLimitResponse(`invite-claim:${access.user.id}`, 5, 86400)
  if (limited) return limited
  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'invalid_invite' }, { status: 400 }) }
  const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code.trim() : ''
  const action = payload && typeof payload === 'object' && 'action' in payload && typeof payload.action === 'string' ? payload.action : ''
  if (action === 'create' && !code) {
    try {
      let [invite] = await db.select({ inviteCode: disloopInvites.inviteCode }).from(disloopInvites)
        .where(eq(disloopInvites.inviterId, access.user.id)).limit(1)
      if (!invite) invite = (await db.insert(disloopInvites).values({
        inviterId: access.user.id,
        inviteCode: randomBytes(9).toString('base64url'),
      }).returning({ inviteCode: disloopInvites.inviteCode }))[0]
      return NextResponse.json({ inviteCode: invite.inviteCode, inviteUrl: `${process.env.SITE_URL?.replace(/\/+$/, '') || ''}/?section=stories&invite=${encodeURIComponent(invite.inviteCode)}` })
    } catch (error) {
      console.error('[invites] link creation failed', { userId: access.user.id, reason: safeApiFailureReason(error) })
      return NextResponse.json({ error: 'invites_unavailable' }, { status: 503 })
    }
  }
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(code)) return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })
  const invitee = access.user
  if (!invitee.dateOfBirth) return NextResponse.json({ error: 'onboarding_required' }, { status: 409 })
  try {
    const [invite] = await db.select({
      id: disloopInvites.id,
      inviterId: disloopInvites.inviterId,
      inviteeId: disloopInvites.inviteeId,
      rewardedAt: disloopInvites.rewardedAt,
    })
      .from(disloopInvites).where(eq(disloopInvites.inviteCode, code)).limit(1)
    if (!invite || invite.inviterId === invitee.id) return NextResponse.json({ error: 'invalid_invite' }, { status: 400 })
    if (invite.inviteeId && invite.inviteeId !== invitee.id) return NextResponse.json({ error: 'invite_already_claimed' }, { status: 409 })
    if (!invite.inviteeId) {
      const [claimed] = await db.update(disloopInvites).set({ inviteeId: invitee.id })
        .where(and(eq(disloopInvites.id, invite.id), isNull(disloopInvites.inviteeId))).returning({ id: disloopInvites.id })
      if (!claimed) return NextResponse.json({ error: 'invite_already_claimed' }, { status: 409 })
    }
    if (invite.rewardedAt) return NextResponse.json({ claimed: true, rewardGranted: true })
    const xp = await awardXp(invite.inviterId, 20, 'invite_reward', `invite:${invite.id}`)
    if (xp !== null) await db.update(disloopInvites).set({ rewardedAt: new Date() }).where(eq(disloopInvites.id, invite.id))
    return NextResponse.json({ claimed: true, rewardGranted: xp !== null, rewardPending: xp === null })
  } catch (error) {
    console.error('[invites] claim failed', { userId: invitee.id, reason: safeApiFailureReason(error) })
    return NextResponse.json({ error: 'invites_unavailable' }, { status: 503 })
  }
}
