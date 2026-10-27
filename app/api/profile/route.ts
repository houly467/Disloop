import { logApiException, safeApiFailureReason } from '@/lib/api-errors'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopUserBadges, disloopUsers } from '@/lib/db/schema'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { isSameOriginRequest } from '@/lib/security'
import { normalizeUsernameForLookup } from '@/lib/users'
import { PROFILE_LINK_FIELDS, type ProfileLinkField, type SocialLinks } from '@/lib/profile'
import { findMentionUsernames, notifyMentions } from '@/lib/social'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { isPrivateMediaUrlForUser } from '@/lib/private-media'

const SOCIAL_HOSTS: Record<ProfileLinkField, string[]> = {
  website: [],
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
  github: ['github.com'],
  twitch: ['twitch.tv'],
}

function parseSocialLinks(value: unknown): SocialLinks | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const links: SocialLinks = {}
  for (const key of PROFILE_LINK_FIELDS) {
    const raw = (value as Record<string, unknown>)[key]
    if (raw === undefined || raw === '') continue
    if (typeof raw !== 'string' || raw.length > 240) return null
    try {
      const url = new URL(raw)
      if (url.protocol !== 'https:' || url.username || url.password) return null
      const host = url.hostname.toLowerCase()
      if (key !== 'website' && !SOCIAL_HOSTS[key].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null
      links[key] = url.toString()
    } catch {
      return null
    }
  }
  return links
}

function databaseCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code ?? value.cause?.code ?? null
}

function isValidDateOfBirth(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10)
}

export async function PATCH(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`profile:${user.id}`, 10, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    username: z.string().trim().min(1).max(20),
    displayName: z.string().trim().min(1).max(30),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    profileAvatarUrl: z.string().max(2048).nullable().optional(),
    profileBannerUrl: z.string().max(2048).nullable().optional(),
    bio: z.string().trim().max(180),
    location: z.string().trim().max(80),
    socialLinks: z.record(z.string(), z.string().max(240)),
    publicVisitCount: z.boolean(),
    hideLikes: z.boolean(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_profile' }, { status: 400 })
  const username = data.username
  const usernameLower = normalizeUsernameForLookup(username)
  const displayName = data.displayName
  const dateOfBirth = data.dateOfBirth
  const profileAvatarUrl = data.profileAvatarUrl
  const profileBannerUrl = data.profileBannerUrl
  const bio = data.bio
  const location = data.location
  const socialLinks = parseSocialLinks(data.socialLinks)
  const publicVisitCount = data.publicVisitCount
  const hideLikes = data.hideLikes

  if (!usernameLower || !socialLinks || findMentionUsernames(bio).length > 5
    || (dateOfBirth !== undefined && !isValidDateOfBirth(dateOfBirth))
    || (profileAvatarUrl !== undefined && profileAvatarUrl !== null && !isPrivateMediaUrlForUser(profileAvatarUrl, 'profile', user.id))
    || (profileBannerUrl !== undefined && profileBannerUrl !== null && !isPrivateMediaUrlForUser(profileBannerUrl, 'profile', user.id))) {
    return NextResponse.json({ error: 'invalid_profile' }, { status: 400 })
  }

  const isExistingUsername = usernameLower === normalizeUsernameForLookup(user.username)
  if (usernameLower.length < 2 && !isExistingUsername) {
    return NextResponse.json({ error: 'username_minimum_length', message: 'Usernames need at least 2 characters' }, { status: 400 })
  }

  if (usernameLower.length === 2 && !isExistingUsername) {
    const [verifiedBadge] = await db.select({ userId: disloopUserBadges.userId })
      .from(disloopUserBadges)
      .where(and(eq(disloopUserBadges.userId, user.id), eq(disloopUserBadges.badgeId, 'verified')))
      .limit(1)
    if (!verifiedBadge) {
      return NextResponse.json({ error: 'username_verification_required', message: 'Usernames need at least 3 characters' }, { status: 400 })
    }
  }

  try {
    const [updated] = await db.update(disloopUsers).set({
      usernameLower,
      usernameDisplay: username,
      displayName,
      bio,
      location: location || null,
      socialLinks,
      publicVisitCount,
      hideLikes,
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(profileAvatarUrl !== undefined ? { profileAvatarUrl } : {}),
      ...(profileBannerUrl !== undefined ? { profileBannerUrl } : {}),
      updatedAt: new Date(),
    }).where(eq(disloopUsers.id, user.id)).returning({
      username: disloopUsers.usernameDisplay,
      displayName: disloopUsers.displayName,
      dateOfBirth: disloopUsers.dateOfBirth,
      avatarUrl: sql<string | null>`coalesce(${disloopUsers.profileAvatarUrl}, ${disloopUsers.avatarUrl})`,
      profileAvatarUrl: disloopUsers.profileAvatarUrl,
      profileBannerUrl: disloopUsers.profileBannerUrl,
      bio: disloopUsers.bio,
      location: disloopUsers.location,
      socialLinks: disloopUsers.socialLinks,
      publicVisitCount: disloopUsers.publicVisitCount,
      hideLikes: disloopUsers.hideLikes,
    })
    await notifyMentions(bio, user.id, 'profile', user.id).catch(() => undefined)
    return NextResponse.json({ profile: updated })
  } catch (error) {
    logApiException('PATCH /api/profile', error)
    if (databaseCode(error) === '23505') return NextResponse.json({ error: 'username_taken' }, { status: 409 })
    return NextResponse.json({ error: 'profile_update_failed', reason: safeApiFailureReason(error) }, { status: 500 })
  }
}
