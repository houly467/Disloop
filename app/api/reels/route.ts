import { apiFailurePayload } from '@/lib/api-errors'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { publishDiscordEmbed } from '@/lib/discord-community'
import { awardXp, grantAchievementBadge } from '@/lib/gamification'
import { db } from '@/lib/db'
import { disloopReels, disloopUsers } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security'
import { countWords, extractTags } from '@/lib/tags'
import { rateLimitResponse } from '@/lib/rate-limit'
import { isNewAccount } from '@/lib/new-account'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { findMentionUsernames, notifyMentions } from '@/lib/social'
import { isPrivateMediaUrlForUser, isPublicBlobUrlForUser } from '@/lib/private-media'
import { isReelThumbnailConfirmed, isReelUploadConfirmed } from '@/lib/reel-media'
import { getReels } from '@/lib/reels'
import { getCurrentUser } from '@/lib/session'
import { isUuid } from '@/lib/dm'
import { isValidUploadPath } from '@/lib/upload-config'

function isAllowedReelUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'reels', userId) || isPublicBlobUrlForUser(value, 'reels', userId)
}

export async function GET(request: NextRequest) {
  const viewer = await getCurrentUser()
  const likedOnly = request.nextUrl.searchParams.get('liked') === 'true'
  const shuffle = request.nextUrl.searchParams.get('shuffle') === '1'
  const userId = request.nextUrl.searchParams.get('userId')
  const excludeParam = request.nextUrl.searchParams.get('exclude') ?? ''
  const excludeReelIds = excludeParam ? excludeParam.split(',') : []
  if (userId && !isUuid(userId)) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  if (excludeReelIds.length > 200 || excludeReelIds.some((id) => !isUuid(id))) {
    return NextResponse.json({ error: 'invalid_reel_exclusions' }, { status: 400 })
  }
  if (likedOnly && !viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const reels = await getReels(viewer?.id, undefined, userId ?? undefined, {
      likedOnly,
      excludeLiked: !likedOnly,
      shuffle,
      ...(shuffle && excludeReelIds.length ? { excludeReelIds } : {}),
    })
    if (shuffle && excludeReelIds.length && reels.length === 0) {
      const repeatedReels = await getReels(viewer?.id, undefined, userId ?? undefined, { likedOnly, excludeLiked: !likedOnly, shuffle: true })
      return NextResponse.json({ reels: repeatedReels }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json({ reels }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reels_unavailable', error, 'GET /api/reels'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`reels:${user.id}`, 5, 300)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    videoUrl: z.string().max(2048),
    caption: z.string().trim().max(500).optional(),
    thumbnailPath: z.string().max(256).optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })
  const videoUrl = data.videoUrl
  const caption = data.caption ?? ''
  const thumbnailPath = data.thumbnailPath
  if (!isAllowedReelUrl(videoUrl, user.id) || findMentionUsernames(caption).length > 5 || countWords(caption) > 100) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })
  if (thumbnailPath && !isValidUploadPath(thumbnailPath, 'reelThumbnail', user.id)) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })

  let tags: string[]
  try {
    tags = extractTags(caption)
  } catch {
    return NextResponse.json({ error: 'too_many_tags' }, { status: 400 })
  }

  try {
    if (!await isReelUploadConfirmed(videoUrl, user.id)) {
      return NextResponse.json({ error: 'reel_media_unavailable' }, { status: 400 })
    }
    if (thumbnailPath && !await isReelThumbnailConfirmed(thumbnailPath, user.id)) {
      return NextResponse.json({ error: 'reel_thumbnail_unavailable' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reel_media_unavailable', error, 'POST /api/reels:media_verification'), { status: 502 })
  }

  try {
    await db.update(disloopUsers).set({ isMember: true, updatedAt: new Date() }).where(eq(disloopUsers.id, user.id))
    const [created] = await db.insert(disloopReels).values({
      authorId: user.id,
      videoUrl,
      caption,
      tags,
      ...(thumbnailPath ? { coverPath: thumbnailPath } : {}),
    }).returning({
      id: disloopReels.id,
      authorId: disloopReels.authorId,
      videoUrl: disloopReels.videoUrl,
      caption: disloopReels.caption,
      tags: disloopReels.tags,
      createdAt: disloopReels.createdAt,
    })
    const reel = {
      ...created,
      createdAt: created.createdAt.toISOString(),
      authorName: user.displayName,
      authorUsername: user.username,
      authorAvatar: user.avatarUrl,
      authorCreatedAt: user.accountCreatedAt,
      authorIsNewAccount: isNewAccount(user.accountCreatedAt),
      likeCount: 0,
      likedByMe: false,
    }
    await notifyMentions(caption, user.id, 'reel', created.id).catch(() => undefined)
    const xp = await awardXp(user.id, 20, 'reel_published', `reel:${created.id}`).catch(() => null)
    await grantAchievementBadge(user.id, 'creator').catch((error) => console.error('[achievements] creator badge grant failed', { userId: user.id, error }))
    await publishDiscordEmbed({
      title: 'A new community Reel',
      description: caption || 'A new short video has been shared with the community.',
      url: `${process.env.SITE_URL ?? request.nextUrl.origin}/#reel-${created.id}`,
      category: 'Reel',
      tags,
    }).catch(() => undefined)
    return NextResponse.json({ reel, xp }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reel_publish_failed', error, 'POST /api/reels'), { status: 500 })
  }
}
