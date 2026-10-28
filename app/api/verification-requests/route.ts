import { and, desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopVerificationRequests } from '@/lib/db/schema'
import { safeApiFailureReason } from '@/lib/api-errors'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { sanitizeVerificationReason, selectVerificationWebhook } from '@/lib/verification'
import { z } from 'zod'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  try {
    const requests = await db.select({
      id: disloopVerificationRequests.id,
      reason: disloopVerificationRequests.reason,
      status: disloopVerificationRequests.status,
      createdAt: disloopVerificationRequests.createdAt,
    }).from(disloopVerificationRequests)
      .where(eq(disloopVerificationRequests.userId, user.id))
      .orderBy(desc(disloopVerificationRequests.createdAt))
      .limit(10)
    return NextResponse.json({ requests, available: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (safeApiFailureReason(error) === 'missing_table') return NextResponse.json({ requests: [], available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
    console.error('[verification] request history unavailable', { userId: user.id, reason: safeApiFailureReason(error) })
    return NextResponse.json({ requests: [], available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const limited = await rateLimitResponse(`verification-request:${access.user.id}`, 1, 86400)
  if (limited) return limited
  const data = await parseJsonBody(request, z.object({ reason: z.string().trim().min(20).max(500) }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  const reason = sanitizeVerificationReason(data.reason)
  /*
    .replace(/@(?:everyone|here)\b/gi, '')
    .replace(/<@!?[\d]{17,20}>|<@&\d{17,20}>|<#\d{17,20}>/g, '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 500)
  */
  if (reason.length < 20) return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  const webhook = selectVerificationWebhook()
  if (!webhook) return NextResponse.json({ error: 'verification_unavailable' }, { status: 503 })
  let savedRequestId: string | null = null
  try {
    const [existing] = await db.select({ id: disloopVerificationRequests.id }).from(disloopVerificationRequests)
      .where(and(eq(disloopVerificationRequests.userId, access.user.id), eq(disloopVerificationRequests.status, 'open'))).limit(1)
    if (existing) return NextResponse.json({ error: 'request_already_open' }, { status: 409 })
    const [saved] = await db.insert(disloopVerificationRequests).values({ userId: access.user.id, reason })
      .returning({ id: disloopVerificationRequests.id, createdAt: disloopVerificationRequests.createdAt })
    savedRequestId = saved.id
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: 'Verification request',
          description: reason,
          fields: [
            { name: 'Username', value: `@${access.user.username}` },
            { name: 'User ID', value: access.user.id },
            { name: 'Request ID', value: saved.id },
          ],
          timestamp: saved.createdAt.toISOString(),
          footer: { text: 'Admins can use /verification to approve or reject this request.' },
        }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`verification_webhook_${response.status}`)
    return NextResponse.json({ request: { ...saved, reason, status: 'open' } }, { status: 201 })
  } catch (error) {
    console.error('[verification] submission failed', { userId: access.user.id, reason: safeApiFailureReason(error) })
    if (savedRequestId) {
      try {
        await db.delete(disloopVerificationRequests).where(eq(disloopVerificationRequests.id, savedRequestId))
      } catch (cleanupError) {
        console.error('[verification] failed to clear an unsubmitted request', { requestId: savedRequestId, reason: safeApiFailureReason(cleanupError) })
      }
    }
    return NextResponse.json({ error: 'verification_submission_failed' }, { status: 503 })
  }
}
