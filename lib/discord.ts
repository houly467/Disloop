import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export const OAUTH_STATE_COOKIE = 'disloop.oauth_state'
const DISCORD_API = 'https://discord.com/api/v10'

export type DiscordIdentity = {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
}

export type OAuthState = {
  state: string
  returnTo: string
  redirectUri: string
  mode?: 'link'
}

function secretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

function originFrom(value: string | undefined) {
  if (!value) return null
  try {
    const parsed = new URL(value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`)
    return parsed.origin
  } catch {
    return null
  }
}

export function discordRedirectUri(request: NextRequest) {
  const currentOrigin = request.nextUrl.origin
  const configuredOrigins = [
    process.env.SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ...(process.env.NODE_ENV === 'development'
      ? [
          process.env.V0_RUNTIME_URL,
          process.env.V0_DEV_APP_URL,
          process.env.V0_BUILD_URL,
          process.env.V0_SANDBOX_URL,
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:3000',
          'https://localhost:3000',
          'https://localhost:5173',
        ]
      : []),
  ]
  const allowedOrigins = new Set(
    configuredOrigins.map(originFrom).filter((origin): origin is string => Boolean(origin)),
  )

  if (!allowedOrigins.has(currentOrigin)) {
    throw new Error('This host is not configured as an approved Discord OAuth origin.')
  }

  return `${currentOrigin}/auth/callback`
}

export async function createOAuthStateToken(state: string, returnTo: string, redirectUri: string, mode?: 'link') {
  return new SignJWT({ state, returnTo, redirectUri, mode })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey())
}

export async function verifyOAuthStateToken(token: string | undefined, expectedState: string): Promise<OAuthState | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (
      payload.state !== expectedState ||
      typeof payload.returnTo !== 'string' ||
      typeof payload.redirectUri !== 'string'
    ) {
      return null
    }

    return {
      state: expectedState,
      returnTo: safeReturnTo(payload.returnTo),
      redirectUri: payload.redirectUri,
      ...(payload.mode === 'link' ? { mode: 'link' as const } : {}),
    }
  } catch {
    return null
  }
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\r\n]/.test(value)) return '/'
  return value
}

export async function exchangeDiscordCode(code: string, redirectUri: string) {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Discord OAuth is not configured.')

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error('Discord token exchange failed.')
  const result = (await response.json()) as { access_token?: string; token_type?: string }
  if (!result.access_token) throw new Error('Discord did not return an access token.')
  return result.access_token
}

export async function getDiscordIdentity(accessToken: string): Promise<DiscordIdentity> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Discord user lookup failed.')
  return (await response.json()) as DiscordIdentity
}

const membershipCache = new Map<string, number>()
const MEMBERSHIP_CACHE_TTL_MS = 3 * 60 * 1000

export async function checkDiscordMembership(discordId: string) {
  const guildId = process.env.DISCORD_GUILD_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!guildId || !botToken) throw new Error('Discord membership checking is not configured.')

  const cacheKey = `${guildId}:${discordId}`
  const cachedUntil = membershipCache.get(cacheKey)
  if (cachedUntil && cachedUntil > Date.now()) return true
  membershipCache.delete(cacheKey)

  let response: Response
  try {
    response = await fetch(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
  } catch (error) {
    throw new Error('Discord membership API request failed.', { cause: error })
  }

  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Discord membership check failed with status ${response.status}.`)
  membershipCache.set(cacheKey, Date.now() + MEMBERSHIP_CACHE_TTL_MS)
  return true
}

export async function checkDiscordGuildHealth() {
  const guildId = process.env.DISCORD_GUILD_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!guildId || !botToken) return { ok: false, reason: 'not_configured' as const }
  try {
    const response = await fetch(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (response.status === 404) return { ok: false, reason: 'guild_not_found' as const }
    if (!response.ok) return { ok: false, reason: `discord_http_${response.status}` as const }
    return { ok: true as const }
  } catch {
    return { ok: false, reason: 'discord_unavailable' as const }
  }
}
