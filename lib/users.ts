import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopUserBadges, disloopUsers } from '@/lib/db/schema'
import type { DiscordIdentity } from '@/lib/discord'
import type { ProfileDetails } from '@/lib/profile'

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'support', 'help', 'news', 'reels', 'search',
  'profile', 'settings', 'login', 'logout', 'api', 'auth', 'home', 'explore', 'tag', 'tags', 'moderation', 'disloop',
  'discord', 'staff', 'system',
])

function baseUsername(identity: DiscordIdentity) {
  const source = (identity.global_name || identity.username).toLowerCase()
  let base = source
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 20)

  if (base.length < 4 || RESERVED_USERNAMES.has(base)) {
    base = `member${identity.id.slice(-4)}`
  }
  return base
}

export type PublicProfile = ProfileDetails & {
  id: string
  discordId: string
  discordUsername: string
  displayName: string
  avatarUrl: string | null
  profileAvatarUrl: string | null
  profileBannerUrl: string | null
  username: string
  isMember: boolean
  accountCreatedAt: string
}

export type CommunityMember = {
  id: string
  discordId: string
  discordUsername: string
  displayName: string
  avatarUrl: string | null
  username: string
}

export async function getMemberDirectory(): Promise<CommunityMember[]> {
  return db
    .select({
      id: disloopUsers.id,
      discordId: disloopUsers.discordId,
      discordUsername: disloopUsers.discordUsername,
      displayName: disloopUsers.displayName,
      avatarUrl: disloopUsers.avatarUrl,
      username: disloopUsers.usernameDisplay,
    })
    .from(disloopUsers)
    .where(and(eq(disloopUsers.isMember, true), eq(disloopUsers.isSeed, false)))
    .orderBy(asc(disloopUsers.displayName))
    .limit(50)
}

export function normalizeUsername(value: string, allowShort = false) {
  const username = value.trim().toLocaleLowerCase('en-US')
  const minimumLength = allowShort ? 1 : 3
  if (username.length < minimumLength || username.length > 20
    || !/^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9._]*[a-z0-9]))$/.test(username)
    || /[._]{2}/.test(username)
    || RESERVED_USERNAMES.has(username)) return null
  return username
}

export async function getPublicUserByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username, true)
  if (!normalizedUsername) return null

  const [user] = await db
    .select({
      id: disloopUsers.id,
      discordId: disloopUsers.discordId,
      discordUsername: disloopUsers.discordUsername,
      displayName: disloopUsers.displayName,
      avatarUrl: sql<string | null>`coalesce(${disloopUsers.profileAvatarUrl}, ${disloopUsers.avatarUrl})`,
      profileAvatarUrl: disloopUsers.profileAvatarUrl,
      profileBannerUrl: disloopUsers.profileBannerUrl,
      username: disloopUsers.usernameDisplay,
      bio: disloopUsers.bio,
      location: disloopUsers.location,
      socialLinks: disloopUsers.socialLinks,
      publicVisitCount: disloopUsers.publicVisitCount,
      hideLikes: disloopUsers.hideLikes,
      isStaffRole: disloopUsers.isStaffRole,
      xp: disloopUsers.xp,
      isMember: disloopUsers.isMember,
      accountCreatedAt: disloopUsers.createdAt,
    })
    .from(disloopUsers)
    .where(eq(disloopUsers.usernameLower, normalizedUsername))
    .limit(1)

  if (user && normalizedUsername.length < 3) {
    const [verifiedBadge] = await db.select({ userId: disloopUserBadges.userId })
      .from(disloopUserBadges)
      .where(and(eq(disloopUserBadges.userId, user.id), eq(disloopUserBadges.badgeId, 'verified')))
      .limit(1)
    if (!verifiedBadge) return null
  }

  return user ? { ...user, accountCreatedAt: user.accountCreatedAt.toISOString() } : null
}

export async function upsertDiscordUser(identity: DiscordIdentity) {
  const avatarUrl = identity.avatar
    ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number(identity.id.slice(-1)) % 6}.png`
  const displayName = (identity.global_name || identity.username).slice(0, 30)

  const [existing] = await db.select().from(disloopUsers).where(eq(disloopUsers.discordId, identity.id)).limit(1)
  if (existing) {
    const [updated] = await db
      .update(disloopUsers)
      .set({ discordUsername: identity.username, ...(!existing.dateOfBirth ? { displayName } : {}), avatarUrl, updatedAt: new Date() })
      .where(eq(disloopUsers.id, existing.id))
      .returning()
    return updated
  }

  const base = baseUsername(identity)
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const suffixText = suffix === 0 ? '' : String(suffix)
    const candidate = `${base.slice(0, 20 - suffixText.length)}${suffixText}`
    if (RESERVED_USERNAMES.has(candidate)) continue

    const [taken] = await db
      .select({ id: disloopUsers.id })
      .from(disloopUsers)
      .where(and(eq(disloopUsers.usernameLower, candidate), eq(disloopUsers.isSeed, false)))
      .limit(1)
    if (taken) continue

    try {
      const [created] = await db
        .insert(disloopUsers)
        .values({
          discordId: identity.id,
          discordUsername: identity.username,
          displayName,
          avatarUrl,
          usernameLower: candidate,
          usernameDisplay: candidate,
        })
        .onConflictDoNothing()
        .returning()
      if (created) return created

      const [concurrentLogin] = await db.select().from(disloopUsers).where(eq(disloopUsers.discordId, identity.id)).limit(1)
      if (concurrentLogin) return concurrentLogin
    } catch (error) {
      const databaseError = error as { code?: string; cause?: { code?: string } }
      if (databaseError.code !== '23505' && databaseError.cause?.code !== '23505') throw error
    }
  }

  throw new Error('A unique Disloop username could not be generated.')
}
