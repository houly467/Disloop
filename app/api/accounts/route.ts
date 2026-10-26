import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopLinkedAccounts, disloopUsers } from '@/lib/db/schema'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { createSessionToken, getCurrentUser, setSessionCookie } from '@/lib/session'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const [currentMapping] = await db.select({ ownerUserId: disloopLinkedAccounts.ownerUserId })
      .from(disloopLinkedAccounts)
      .where(eq(disloopLinkedAccounts.accountUserId, user.id))
      .limit(1)
    const ownerUserId = currentMapping?.ownerUserId ?? user.id
    const links = await db.select({ accountUserId: disloopLinkedAccounts.accountUserId })
      .from(disloopLinkedAccounts)
      .where(eq(disloopLinkedAccounts.ownerUserId, ownerUserId))
    const accountIds = [...new Set([ownerUserId, ...links.map(({ accountUserId }) => accountUserId)])]
    const accounts = await db.select({
      id: disloopUsers.id,
      displayName: disloopUsers.displayName,
      username: disloopUsers.usernameDisplay,
      avatarUrl: disloopUsers.avatarUrl,
      presenceStatus: disloopUsers.presenceStatus,
    }).from(disloopUsers).where(inArray(disloopUsers.id, accountIds))

    return NextResponse.json({ activeAccountId: user.id, accounts }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('accounts_failed', error, 'GET /api/accounts'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`account-switch:${user.id}`, 20, 60)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({ accountId: z.uuid() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_account' }, { status: 400 })
  const accountId = data.accountId
  if (accountId === user.id) return NextResponse.json({ switched: false })

  try {
    const [currentMapping] = await db.select({ ownerUserId: disloopLinkedAccounts.ownerUserId })
      .from(disloopLinkedAccounts)
      .where(eq(disloopLinkedAccounts.accountUserId, user.id))
      .limit(1)
    const ownerUserId = currentMapping?.ownerUserId ?? user.id
    const [link] = await db.select({ accountUserId: disloopLinkedAccounts.accountUserId })
      .from(disloopLinkedAccounts)
      .where(and(eq(disloopLinkedAccounts.ownerUserId, ownerUserId), eq(disloopLinkedAccounts.accountUserId, accountId)))
      .limit(1)
    const [account] = await db.select({ id: disloopUsers.id })
      .from(disloopUsers)
      .where(eq(disloopUsers.id, accountId))
      .limit(1)
    if ((!link && accountId !== ownerUserId) || !account) {
      return NextResponse.json({ error: 'account_not_linked' }, { status: 403 })
    }

    const response = NextResponse.json({ switched: true })
    setSessionCookie(response, await createSessionToken(accountId), request.nextUrl.protocol === 'https:', request.nextUrl.hostname)
    return response
  } catch (error) {
    return NextResponse.json(apiFailurePayload('account_switch_failed', error, 'POST /api/accounts'), { status: 500 })
  }
}
