import { apiFailurePayload } from '@/lib/api-errors'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { publishDiscordEmbed } from '@/lib/discord-community'
import { awardXp } from '@/lib/gamification'
import { db } from '@/lib/db'
import { disloopReels, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { isSameOriginRequest } from '@/lib/security'
import { extractTags } from '@/lib/tags'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { findMentionUsernames, notifyMentions } from '@/lib/social'
import { isPrivateMediaUrlForUser, isPublicBlobUrlForUser } from '@/lib/private-media'

function isAllowedReelUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'reels', userId) || isPublicBlobUrlForUser(value, 'reels', userId)
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`reels:${user.id}`, 4, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    videoUrl: z.string().max(2048),
    caption: z.string().trim().max(500).optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })
  const videoUrl = data.videoUrl
  const caption = data.caption ?? ''
  if (!isAllowedReelUrl(videoUrl, user.id) || findMentionUsernames(caption).length > 5) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })

  let tags: string[]
  try {
    tags = extractTags(caption)
  } catch {
    return NextResponse.json({ error: 'too_many_tags' }, { status: 400 })
  }

  try {
    await db.update(disloopUsers).set({ isMember: true, updatedAt: new Date() }).where(eq(disloopUsers.id, user.id))
    const [created] = await db.insert(disloopReels).values({ authorId: user.id, videoUrl, caption, tags }).returning({
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
      likeCount: 0,
      likedByMe: false,
    }
    await notifyMentions(caption, user.id, 'reel', created.id).catch(() => undefined)
    const xp = await awardXp(user.id, 20, 'reel_published', `reel:${created.id}`).catch(() => null)
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
