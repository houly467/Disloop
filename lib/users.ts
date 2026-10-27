import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import type { DiscordIdentity } from '@/lib/discord'
import type { ProfileDetails } from '@/lib/profile'
import { getFollowCounts } from '@/lib/social-follows'

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
  followerCount: number
  followingCount: number
  nameStyle: string | null
  customTitle: string | null
}

export type CommunityMember = {
  id: string
  discordId: string
  discordUsername: string
  displayName: string
  avatarUrl: string | null
  username: string
  nameStyle?: string | null
  customTitle?: string | null
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
      nameStyle: disloopUserFlair.nameStyle,
      customTitle: disloopUserFlair.customTitle,
    })
    .from(disloopUsers)
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(eq(disloopUsers.isSeed, false))
    .orderBy(asc(disloopUsers.displayName))
    .limit(50)
}

function normalizeUsernameWithMinimum(value: string, minimumLength: number) {
  const username = value.trim().toLocaleLowerCase('en-US')
  if (username.length < minimumLength || username.length > 20
    || !/^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9._]*[a-z0-9]))$/.test(username)
    || /[._]{2}/.test(username)
    || RESERVED_USERNAMES.has(username)) return null
  return username
}

export function normalizeUsername(value: string, isVerified = false) {
  return normalizeUsernameWithMinimum(value, isVerified ? 2 : 3)
}

export function normalizeUsernameForLookup(value: string) {
  return normalizeUsernameWithMinimum(value, 1)
}

export function generateInitialUsernameBase(identity: DiscordIdentity) {
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

export async function getPublicUserByUsername(username: string) {
  const normalizedUsername = normalizeUsernameForLookup(username)
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
      nameStyle: disloopUserFlair.nameStyle,
      customTitle: disloopUserFlair.customTitle,
    })
    .from(disloopUsers)
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(eq(disloopUsers.usernameLower, normalizedUsername))
    .limit(1)

  if (!user) return null
  const followCounts = await getFollowCounts(user.id)
  return {
    ...user,
    followerCount: followCounts.followersCount,
    followingCount: followCounts.followingCount,
    accountCreatedAt: user.accountCreatedAt.toISOString(),
  }
}

export async function getUserNameFlair(userId: string) {
  const [flair] = await db.select({
    nameStyle: disloopUserFlair.nameStyle,
    customTitle: disloopUserFlair.customTitle,
  }).from(disloopUsers)
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(eq(disloopUsers.id, userId))
    .limit(1)
  return flair ?? { nameStyle: null, customTitle: null }
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

  const base = generateInitialUsernameBase(identity)
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
