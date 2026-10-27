import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, lt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopComments, disloopDailyPosts, disloopFollows, disloopNewsPosts, disloopReels, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { createNotification, findMentionUsernames, notifyMentions, type SocialContentType } from '@/lib/social'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const contentTypes = new Set<SocialContentType>(['news', 'reel', 'daily'])

function getContentType(value: string | null): SocialContentType | null {
  return value && contentTypes.has(value as SocialContentType) ? value as SocialContentType : null
}

export async function GET(request: NextRequest) {
  const type = getContentType(request.nextUrl.searchParams.get('type'))
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const before = request.nextUrl.searchParams.get('before')
  if (!type || !isUuid(id)) return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const cursor = before ? new Date(before) : null
  if (cursor && Number.isNaN(cursor.getTime())) return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 })

  try {
    const conditions = [eq(disloopComments.contentType, type), eq(disloopComments.contentId, id), eq(disloopComments.isHidden, false)]
    if (cursor) conditions.push(lt(disloopComments.createdAt, cursor))
    const rows = await db.select({
      id: disloopComments.id,
      contentType: disloopComments.contentType,
      contentId: disloopComments.contentId,
      authorId: disloopComments.authorId,
      threadRootId: disloopComments.threadRootId,
      isPinned: disloopComments.isPinned,
      body: disloopComments.body,
      createdAt: disloopComments.createdAt,
      authorName: disloopUsers.displayName,
      authorUsername: disloopUsers.usernameDisplay,
      authorAvatar: disloopUsers.avatarUrl,
      authorCreatedAt: disloopUsers.createdAt,
      authorNameStyle: disloopUserFlair.nameStyle,
      authorCustomTitle: disloopUserFlair.customTitle,
    }).from(disloopComments)
      .leftJoin(disloopUsers, eq(disloopComments.authorId, disloopUsers.id))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(and(...conditions))
      .orderBy(desc(disloopComments.createdAt), desc(disloopComments.id))
      .limit(31)
    const page = rows.slice(0, 30)
    return NextResponse.json({
      comments: page.reverse().map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        authorCreatedAt: row.authorCreatedAt?.toISOString() ?? null,
        authorName: row.authorName ?? 'Disloop Community',
        authorUsername: row.authorUsername ?? 'community-team',
      })),
      nextCursor: rows.length > 30 ? page.at(-1)?.createdAt.toISOString() ?? null : null,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('comments_failed', error, 'GET /api/social/comments'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`comments:${user.id}`, 20, 300)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({
    type: z.enum(['news', 'reel', 'daily']),
    contentId: z.uuid(),
    body: z.string().max(1000),
    replyToId: z.uuid().nullable().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_comment' }, { status: 400 })
  const type = getContentType(data.type)
  const contentId = data.contentId
  const body = data.body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  const replyToId = data.replyToId ?? null
  if (!type || !body || findMentionUsernames(body).length > 5) {
    return NextResponse.json({ error: 'invalid_comment' }, { status: 400 })
  }
  try {
    const content = type === 'news'
      ? await db.select({ id: disloopNewsPosts.id, authorId: disloopNewsPosts.authorId, repliesFromFollowing: disloopNewsPosts.repliesFromFollowing }).from(disloopNewsPosts).where(and(eq(disloopNewsPosts.id, contentId), eq(disloopNewsPosts.isHidden, false))).limit(1)
      : type === 'reel'
        ? await db.select({ id: disloopReels.id, authorId: disloopReels.authorId, repliesFromFollowing: disloopReels.repliesFromFollowing }).from(disloopReels).where(and(eq(disloopReels.id, contentId), eq(disloopReels.isHidden, false))).limit(1)
        : await db.select({ id: disloopDailyPosts.id, authorId: disloopDailyPosts.authorId, repliesFromFollowing: disloopDailyPosts.repliesFromFollowing }).from(disloopDailyPosts).where(and(eq(disloopDailyPosts.id, contentId), eq(disloopDailyPosts.isHidden, false))).limit(1)
    const target = content[0]
    if (!target) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    if (target.repliesFromFollowing && target.authorId !== user.id) {
      const [follow] = await db.select({ followerId: disloopFollows.followerId }).from(disloopFollows)
        .where(and(eq(disloopFollows.followerId, target.authorId), eq(disloopFollows.followedId, user.id)))
        .limit(1)
      if (!follow) return NextResponse.json({ error: 'replies_from_following_only' }, { status: 403 })
    }

    let threadRootId: string | null = null
    if (replyToId) {
      if (!isUuid(replyToId)) return NextResponse.json({ error: 'invalid_reply' }, { status: 400 })
      const [parent] = await db.select({ id: disloopComments.id, threadRootId: disloopComments.threadRootId })
        .from(disloopComments)
        .where(and(eq(disloopComments.id, replyToId), eq(disloopComments.contentType, type), eq(disloopComments.contentId, contentId), eq(disloopComments.isHidden, false)))
        .limit(1)
      if (!parent) return NextResponse.json({ error: 'reply_not_found' }, { status: 404 })
      threadRootId = parent.threadRootId ?? parent.id
    }

    const [created] = await db.insert(disloopComments).values({ contentType: type, contentId, authorId: user.id, threadRootId, body }).returning({ id: disloopComments.id, createdAt: disloopComments.createdAt })
    const [author] = await db.select({ displayName: disloopUsers.displayName, username: disloopUsers.usernameDisplay, avatarUrl: disloopUsers.avatarUrl, createdAt: disloopUsers.createdAt, nameStyle: disloopUserFlair.nameStyle, customTitle: disloopUserFlair.customTitle })
      .from(disloopUsers).leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id)).where(eq(disloopUsers.id, user.id)).limit(1)
    if (threadRootId) {
      const [root] = await db.select({ authorId: disloopComments.authorId }).from(disloopComments).where(eq(disloopComments.id, threadRootId)).limit(1)
      if (root) await createNotification({ recipientId: root.authorId, actorId: user.id, type: 'comment_reply', targetType: type, targetId: contentId })
    }
    await notifyMentions(body, user.id, type, contentId)
    return NextResponse.json({ comment: {
      id: created.id,
      contentType: type,
      contentId,
      authorId: user.id,
      threadRootId,
      isPinned: false,
      body,
      createdAt: created.createdAt.toISOString(),
      authorName: author?.displayName ?? user.displayName,
      authorUsername: author?.username ?? user.username,
      authorAvatar: author?.avatarUrl ?? user.avatarUrl,
      authorCreatedAt: author?.createdAt.toISOString() ?? null,
      authorNameStyle: author?.nameStyle ?? null,
      authorCustomTitle: author?.customTitle ?? null,
    } }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('comment_failed', error, 'POST /api/social/comments'), { status: 500 })
  }
}
