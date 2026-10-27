import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createOAuthStateToken, discordRedirectUri, OAUTH_STATE_COOKIE, safeReturnTo } from '@/lib/discord'
import { getCurrentUser, sessionCookieDomain } from '@/lib/session'
import { getClientRateLimitKey } from '@/lib/security'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitResponse(getClientRateLimitKey(request, 'oauth-start'), 10, 300)
  if (rateLimit) return rateLimit

  let redirectUri: string
  try {
    redirectUri = discordRedirectUri(request)
  } catch {
    return NextResponse.json({ error: 'This preview host is not registered for Discord sign-in.' }, { status: 400 })
  }

  const clientId = process.env.DISCORD_CLIENT_ID
  const hasAuthConfiguration = Boolean(
    clientId &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_GUILD_ID &&
    process.env.DISCORD_BOT_TOKEN &&
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32,
  )
  if (!hasAuthConfiguration) {
    return NextResponse.redirect(new URL('/?auth=configuration-error', request.nextUrl.origin))
  }

  const mode = request.nextUrl.searchParams.get('mode') === 'link' ? 'link' : undefined
  if (mode === 'link' && !(await getCurrentUser())) {
    return NextResponse.redirect(new URL('/?auth=failed', request.nextUrl.origin))
  }

  try {
    const state = randomBytes(32).toString('base64url')
    const returnTo = mode === 'link' ? '/?account=linked' : safeReturnTo(request.nextUrl.searchParams.get('returnTo'))
    const stateToken = await createOAuthStateToken(state, returnTo, redirectUri, mode)
    const authorizeUrl = new URL('https://discord.com/oauth2/authorize')
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId!,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      state,
    }).toString()

    const response = NextResponse.redirect(authorizeUrl)
    const secure = request.nextUrl.protocol === 'https:'
    response.cookies.set(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      ...(sessionCookieDomain(request.nextUrl.hostname) ? { domain: sessionCookieDomain(request.nextUrl.hostname) } : {}),
      maxAge: 600,
    })
    return response
  } catch {
    return NextResponse.redirect(new URL('/?auth=configuration-error', request.nextUrl.origin))
  }
}
