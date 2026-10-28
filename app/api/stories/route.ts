import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { awardXp } from '@/lib/gamification'
import { db } from '@/lib/db'
import { disloopStories, disloopStoryVisibility, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { visibleStories } from '@/lib/close-friends'
import { isSameOriginRequest } from '@/lib/security'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { isPrivateMediaUrlForUser, isPublicBlobUrlForUser } from '@/lib/private-media'
import { isNewAccount } from '@/lib/new-account'

function isAllowedStoryMediaUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'daily', userId) || isPublicBlobUrlForUser(value, 'daily', userId)
}

export async function GET() {
  try {
    const viewer = await getCurrentUser()
    const stories = await db.select({
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
      authorCreatedAt: disloopUsers.createdAt,
      authorNameStyle: disloopUserFlair.nameStyle,
      authorCustomTitle: disloopUserFlair.customTitle,
    }).from(disloopStories)
      .innerJoin(disloopUsers, eq(disloopStories.authorId, disloopUsers.id))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(gt(disloopStories.expiresAt, new Date()))
      .orderBy(desc(disloopStories.createdAt))
      .limit(30)
    const visible = await visibleStories(stories, viewer?.id ?? null)
    return NextResponse.json({ stories: visible.map((story) => ({ ...story, authorCreatedAt: story.authorCreatedAt.toISOString(), authorIsNewAccount: isNewAccount(story.authorCreatedAt), createdAt: story.createdAt.toISOString(), expiresAt: story.expiresAt.toISOString() })) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('stories_failed', error, 'GET /api/stories'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`stories:${user.id}`, 5, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    body: z.string().max(500).optional(),
    mediaUrl: z.string().max(2048).nullable().optional(),
    closeFriendsOnly: z.boolean().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_story' }, { status: 400 })
  const body = (data.body ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e\u001f]/g, '').trim()
  const mediaUrl = data.mediaUrl ?? null
  const mediaType = mediaUrl && /\.(mp4|webm)(?:$|[?#])/i.test(mediaUrl) ? 'video' : mediaUrl ? 'image' : null
  if (body.length > 500 || (!body && !mediaUrl) || (mediaUrl && !isAllowedStoryMediaUrl(mediaUrl, user.id))) {
    return NextResponse.json({ error: 'invalid_story' }, { status: 400 })
  }

  try {
    const [story] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(disloopStories).values({ authorId: user.id, body, mediaUrl, mediaType })
        .returning({ id: disloopStories.id, authorId: disloopStories.authorId, body: disloopStories.body, mediaUrl: disloopStories.mediaUrl, mediaType: disloopStories.mediaType, createdAt: disloopStories.createdAt, expiresAt: disloopStories.expiresAt })
      if (data.closeFriendsOnly) await tx.insert(disloopStoryVisibility).values({ storyId: created.id, authorId: user.id, closeFriendsOnly: true })
      return [created]
    })
    const xp = await awardXp(user.id, 2, 'story_published', `story:${story.id}`).catch(() => null)
    return NextResponse.json({ story: { ...story, closeFriendsOnly: data.closeFriendsOnly ?? false, createdAt: story.createdAt.toISOString(), expiresAt: story.expiresAt.toISOString(), authorName: user.displayName, authorUsername: user.username, authorAvatar: user.avatarUrl, authorCreatedAt: user.accountCreatedAt, authorIsNewAccount: isNewAccount(user.accountCreatedAt) }, xp }, { status: 201 })
  } catch (error) {
    if (data.closeFriendsOnly) {
      console.error('[stories] close-friends story creation unavailable', { userId: user.id, error })
      return NextResponse.json({ error: 'close_friends_unavailable' }, { status: 503 })
    }
    return NextResponse.json(apiFailurePayload('story_publish_failed', error, 'POST /api/stories'), { status: 500 })
  }
}
