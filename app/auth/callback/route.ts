import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopLinkedAccounts } from '@/lib/db/schema'
import {
  checkDiscordMembership,
  discordRedirectUri,
  exchangeDiscordCode,
  getDiscordIdentity,
  OAUTH_STATE_COOKIE,
  verifyOAuthStateToken,
} from '@/lib/discord'
import { refreshNewsMembership } from '@/lib/news'
import { createSessionToken, getCurrentUser, sessionCookieDomain, setSessionCookie } from '@/lib/session'
import { upsertDiscordUser } from '@/lib/users'
import { getClientRateLimitKey } from '@/lib/security'
import { rateLimitResponse } from '@/lib/rate-limit'
import { mergeLinkedAccountRelationships, type LinkedAccountRelationship } from '@/lib/linked-accounts'

function clearStateCookie(response: NextResponse, secure: boolean, hostname: string) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...(sessionCookieDomain(hostname) ? { domain: sessionCookieDomain(hostname) } : {}),
    maxAge: 0,
  })
}

function returnToHome(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(status)}`, request.nextUrl.origin))
}

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitResponse(getClientRateLimitKey(request, 'oauth-callback'), 20, 3600)
  if (rateLimit) return rateLimit

  const secure = request.nextUrl.protocol === 'https:'
  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  const verifiedState = await verifyOAuthStateToken(stateCookie, state ?? '')

  if (!state || !verifiedState || !code) {
    const response = returnToHome(request, 'state-error')
    clearStateCookie(response, secure, request.nextUrl.hostname)
    return response
  }

  try {
    const redirectUri = discordRedirectUri(request)
    if (redirectUri !== verifiedState.redirectUri) throw new Error('OAuth redirect URI changed during sign-in.')

    const accessToken = await exchangeDiscordCode(code, redirectUri)
    const identity = await getDiscordIdentity(accessToken)
    const user = await upsertDiscordUser(identity)
    let isMember = false
    try {
      isMember = await checkDiscordMembership(identity.id)
    } catch {
      console.warn('[auth] Discord membership could not be refreshed during sign-in.')
    }
    await refreshNewsMembership(user.id, isMember)

    if (verifiedState.mode === 'link') {
      const currentUser = await getCurrentUser()
      if (!currentUser || currentUser.id === user.id) throw new Error('A different Discord account is required to link.')
      await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          WITH RECURSIVE linked_accounts(user_id) AS (
            SELECT ${currentUser.id}::uuid
            UNION
            SELECT ${user.id}::uuid
            UNION
            SELECT CASE
              WHEN links.owner_user_id = linked_accounts.user_id THEN links.account_user_id
              ELSE links.owner_user_id
            END
            FROM public.disloop_linked_accounts links
            JOIN linked_accounts
              ON links.owner_user_id = linked_accounts.user_id
              OR links.account_user_id = linked_accounts.user_id
          )
          SELECT links.owner_user_id, links.account_user_id
          FROM public.disloop_linked_accounts links
          WHERE links.owner_user_id IN (SELECT user_id FROM linked_accounts)
             OR links.account_user_id IN (SELECT user_id FROM linked_accounts)
          FOR UPDATE
        `)
        const relationships = result.rows as LinkedAccountRelationship[]
        const merged = mergeLinkedAccountRelationships(currentUser.id, user.id, relationships)
        await tx.insert(disloopLinkedAccounts)
          .values(merged.relationships)
          .onConflictDoUpdate({
            target: disloopLinkedAccounts.accountUserId,
            set: { ownerUserId: merged.ownerUserId },
          })
      })
      const response = NextResponse.redirect(new URL(verifiedState.returnTo, request.nextUrl.origin))
      clearStateCookie(response, secure, request.nextUrl.hostname)
      return response
    }

    const response = NextResponse.redirect(new URL(verifiedState.returnTo, request.nextUrl.origin))
    const token = await createSessionToken(user.id)
    setSessionCookie(response, token, secure, request.nextUrl.hostname)
    clearStateCookie(response, secure, request.nextUrl.hostname)
    return response
  } catch (error) {
    console.error('[v0] Discord sign-in could not be completed.', error instanceof Error ? error.message : 'Unknown error')
    const response = returnToHome(request, 'failed')
    clearStateCookie(response, secure, request.nextUrl.hostname)
    return response
  }
}
