import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopUsers } from '@/lib/db/schema'
import type { PresenceStatus, ProfileDetails } from '@/lib/profile'
import { SESSION_COOKIE, SESSION_DURATION_SECONDS } from '@/lib/session-cookie'

export { clearSessionCookie, SESSION_COOKIE, sessionCookieDomain, setSessionCookie } from '@/lib/session-cookie'

export type CurrentUser = ProfileDetails & {
  id: string
  discordId: string
  discordUsername: string
  displayName: string
  avatarUrl: string | null
  profileAvatarUrl: string | null
  profileBannerUrl: string | null
  dateOfBirth: string | null
  username: string
  isMember: boolean
  presenceStatus: PresenceStatus
  accountCreatedAt: string
}

function secretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(userId: string) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey())
}

type CurrentUserResult =
  | { status: 'ok'; user: CurrentUser }
  | { status: 'not_logged_in' | 'banned' }
  | { status: 'unavailable'; error: unknown }

export async function getUserSessionResult(token: string | undefined): Promise<CurrentUserResult> {
  if (!token) return { status: 'not_logged_in' }

  let key: Uint8Array
  try {
    key = secretKey()
  } catch (error) {
    return { status: 'unavailable', error }
  }

  let userId: string
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (typeof payload.uid !== 'string') return { status: 'not_logged_in' }
    userId = payload.uid
  } catch {
    return { status: 'not_logged_in' }
  }

  try {
    const [record] = await db
      .select({
        id: disloopUsers.id,
        discordId: disloopUsers.discordId,
        discordUsername: disloopUsers.discordUsername,
        displayName: disloopUsers.displayName,
        avatarUrl: sql<string | null>`coalesce(${disloopUsers.profileAvatarUrl}, ${disloopUsers.avatarUrl})`,
        profileAvatarUrl: disloopUsers.profileAvatarUrl,
        profileBannerUrl: disloopUsers.profileBannerUrl,
        dateOfBirth: disloopUsers.dateOfBirth,
        username: disloopUsers.usernameDisplay,
        bio: disloopUsers.bio,
        location: disloopUsers.location,
        socialLinks: disloopUsers.socialLinks,
        publicVisitCount: disloopUsers.publicVisitCount,
        hideLikes: disloopUsers.hideLikes,
        isStaffRole: disloopUsers.isStaffRole,
        isBanned: disloopUsers.isBanned,
        xp: disloopUsers.xp,
        isMember: disloopUsers.isMember,
        presenceStatus: disloopUsers.presenceStatus,
        accountCreatedAt: disloopUsers.createdAt,
      })
      .from(disloopUsers)
      .where(eq(disloopUsers.id, userId))
      .limit(1)

    if (!record) return { status: 'not_logged_in' }
    if (record.isBanned) return { status: 'banned' }
    const { isBanned: _isBanned, ...user } = record
    return { status: 'ok', user: { ...user, accountCreatedAt: user.accountCreatedAt.toISOString() } }
  } catch (error) {
    return { status: 'unavailable', error }
  }
}

export async function getUserFromSessionToken(token: string | undefined): Promise<CurrentUser | null> {
  const result = await getUserSessionResult(token)
  if (result.status === 'unavailable') {
    console.error('[session] Session lookup unavailable.', result.error)
    return null
  }
  return result.status === 'ok' ? result.user : null
}

export async function getCurrentUserResult(): Promise<CurrentUserResult> {
  const cookieStore = await cookies()
  const result = await getUserSessionResult(cookieStore.get(SESSION_COOKIE)?.value)
  if (result.status === 'unavailable') console.error('[session] Session lookup unavailable.', result.error)
  return result
}

export async function getCurrentUser() {
  const result = await getCurrentUserResult()
  return result.status === 'ok' ? result.user : null
}
