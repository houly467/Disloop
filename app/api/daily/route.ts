import { apiFailurePayload } from '@/lib/api-errors'
import { desc, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { awardXp } from '@/lib/gamification'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopStories, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { getDailyPosts } from '@/lib/daily'
import { visibleStories } from '@/lib/close-friends'
import { isSameOriginRequest } from '@/lib/security'
import { getCurrentUser } from '@/lib/session'
import { extractTags } from '@/lib/tags'
import { findMentionUsernames, notifyMentions } from '@/lib/social'
import { isUuid } from '@/lib/dm'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { isPrivateMediaUrlForUser, isPublicBlobUrlForUser } from '@/lib/private-media'

function isAllowedDailyMediaUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'daily', userId) || isPublicBlobUrlForUser(value, 'daily', userId)
}

export async function GET(request: NextRequest) {
  const rawCursor = request.nextUrl.searchParams.get('before')
  let cursor: { createdAt: Date; id: string } | undefined
  if (rawCursor) {
    if (rawCursor.length > 256) return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })
    try {
      const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
      const createdAt = typeof parsed.createdAt === 'string' ? new Date(parsed.createdAt) : null
      if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof parsed.id !== 'string' || !isUuid(parsed.id)) throw new Error('invalid_cursor')
      cursor = { createdAt, id: parsed.id }
    } catch {
      return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })
    }
  }
  try {
    const [feed, stories, viewer] = await Promise.all([
      getDailyPosts(cursor),
      db.select({
        id: disloopStories.id,
        authorId: disloopStories.authorId,
        body: disloopStories.body,
        mediaUrl: disloopStories.mediaUrl,
        mediaType: disloopStories.mediaType,
        createdAt: disloopStories.createdAt,
        expiresAt: disloopStories.expiresAt,
        authorName: disloopUsers.displayName,
        authorUsername: disloopUsers.usernameDisplay,
        authorAvatar: disloopUsers.avatarUrl,
        authorNameStyle: disloopUserFlair.nameStyle,
        authorCustomTitle: disloopUserFlair.customTitle,
      }).from(disloopStories)
        .innerJoin(disloopUsers, eq(disloopStories.authorId, disloopUsers.id))
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(gt(disloopStories.expiresAt, new Date()))
        .orderBy(desc(disloopStories.createdAt))
        .limit(30),
      getCurrentUser(),
    ])
    const visible = await visibleStories(stories, viewer?.id ?? null)
    return NextResponse.json({
      ...feed,
      stories: visible.map((story) => ({ ...story, createdAt: story.createdAt.toISOString(), expiresAt: story.expiresAt.toISOString() })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('daily_feed_failed', error, 'GET /api/daily'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`daily:${user.id}`, 5, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    body: z.string().max(1000).optional(),
    mediaUrl: z.string().max(2048).nullable().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_daily_post' }, { status: 400 })
  const body = (data.body ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e\u001f]/g, '').trim()
  const mediaUrl = data.mediaUrl ?? null
  if (body.length > 1000 || (!body && !mediaUrl) || (mediaUrl && !isAllowedDailyMediaUrl(mediaUrl, user.id)) || findMentionUsernames(body).length > 5) {
    return NextResponse.json({ error: 'invalid_daily_post' }, { status: 400 })
  }
  let tags: string[]
  try {
    tags = extractTags(body)
  } catch {
    return NextResponse.json({ error: 'too_many_tags' }, { status: 400 })
  }

  try {
    const [post] = await db.insert(disloopDailyPosts).values({ authorId: user.id, body, mediaUrl, tags })
      .returning({ id: disloopDailyPosts.id, authorId: disloopDailyPosts.authorId, body: disloopDailyPosts.body, mediaUrl: disloopDailyPosts.mediaUrl, tags: disloopDailyPosts.tags, createdAt: disloopDailyPosts.createdAt })
    await notifyMentions(body, user.id, 'daily', post.id).catch(() => undefined)
    const xp = await awardXp(user.id, 8, 'daily_post', `daily:${post.id}`).catch(() => null)
    return NextResponse.json({ post: { ...post, createdAt: post.createdAt.toISOString(), authorName: user.displayName, authorUsername: user.username, authorAvatar: user.avatarUrl, authorCreatedAt: user.accountCreatedAt }, xp }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('daily_post_failed', error, 'POST /api/daily'), { status: 500 })
  }
}
