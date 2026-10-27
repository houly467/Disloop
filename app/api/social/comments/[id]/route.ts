import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopComments, disloopDailyPosts, disloopNewsPosts, disloopReels } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const contentTypes = new Set(['news', 'reel', 'daily'])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`comment-controls:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const data = await parseJsonBody(request, z.object({ pinned: z.boolean() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_comment_state' }, { status: 400 })

  try {
    const [comment] = await db.select({
      id: disloopComments.id,
      contentType: disloopComments.contentType,
      contentId: disloopComments.contentId,
      threadRootId: disloopComments.threadRootId,
    }).from(disloopComments)
      .where(and(eq(disloopComments.id, id), eq(disloopComments.isHidden, false)))
      .limit(1)
    if (!comment || !contentTypes.has(comment.contentType) || comment.threadRootId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const content = comment.contentType === 'news'
      ? await db.select({ authorId: disloopNewsPosts.authorId }).from(disloopNewsPosts).where(eq(disloopNewsPosts.id, comment.contentId)).limit(1)
      : comment.contentType === 'reel'
        ? await db.select({ authorId: disloopReels.authorId }).from(disloopReels).where(eq(disloopReels.id, comment.contentId)).limit(1)
        : await db.select({ authorId: disloopDailyPosts.authorId }).from(disloopDailyPosts).where(eq(disloopDailyPosts.id, comment.contentId)).limit(1)
    if (content[0]?.authorId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    await db.transaction(async (tx) => {
      if (data.pinned) {
        await tx.update(disloopComments).set({ isPinned: false })
          .where(and(eq(disloopComments.contentType, comment.contentType), eq(disloopComments.contentId, comment.contentId), eq(disloopComments.isHidden, false)))
      }
      await tx.update(disloopComments).set({ isPinned: data.pinned })
        .where(and(eq(disloopComments.id, comment.id), eq(disloopComments.isHidden, false)))
      if (comment.contentType === 'news') {
        await tx.update(disloopNewsPosts).set({ pinnedCommentId: data.pinned ? comment.id : null })
          .where(eq(disloopNewsPosts.id, comment.contentId))
      }
    })

    return NextResponse.json({ pinned: data.pinned })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('comment_update_failed', error, 'PATCH /api/social/comments/[id]'), { status: 500 })
  }
}
