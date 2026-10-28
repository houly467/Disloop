import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopGroupMembers, disloopGroupMessages, disloopGroups } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { getMessageReactionSummaries, isAllowedChatMediaUrl } from '@/lib/chat'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { notifyMentions } from '@/lib/social'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { isNewAccount } from '@/lib/new-account'

type RouteProps = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`group-messages:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })

  const data = await parseJsonBody(request, z.object({
    body: z.string().max(2000).optional(),
    mediaUrl: z.string().max(2048).nullable().optional(),
    mediaType: z.string().max(32).nullable().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_message' }, { status: 400 })
  const body = (data.body ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  const mediaUrl = data.mediaUrl ?? null
  const mediaType = data.mediaType ?? null
  const allowedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (body.length > 2000 || (!body && !mediaUrl) || (mediaUrl && (!isAllowedChatMediaUrl(mediaUrl, user.id) || !mediaType || !allowedMediaTypes.has(mediaType))) || (!mediaUrl && mediaType)) {
    return NextResponse.json({ error: 'invalid_message' }, { status: 400 })
  }

  try {
    const message = await db.transaction(async (tx) => {
      const [membership] = await tx.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, user.id)))
        .for('update')
      if (!membership) return null

      const [group] = await tx.update(disloopGroups)
        .set({ xp: sql`${disloopGroups.xp} + 10` })
        .where(eq(disloopGroups.id, id))
        .returning({ id: disloopGroups.id })
      if (!group) return null

      const [createdMessage] = await tx.insert(disloopGroupMessages)
        .values({ groupId: id, senderId: user.id, body, mediaUrl, mediaType })
        .returning({ id: disloopGroupMessages.id, senderId: disloopGroupMessages.senderId, body: disloopGroupMessages.body, mediaUrl: disloopGroupMessages.mediaUrl, mediaType: disloopGroupMessages.mediaType, createdAt: disloopGroupMessages.createdAt })
      return createdMessage ?? null
    })
    if (!message) return NextResponse.json({ error: 'group_membership_required' }, { status: 403 })
    const members = await db.select({ userId: disloopGroupMembers.userId })
      .from(disloopGroupMembers)
      .where(eq(disloopGroupMembers.groupId, id))
    await notifyMentions(body, user.id, 'chat', id, members.map(({ userId }) => userId)).catch(() => undefined)

    return NextResponse.json({ message: { ...message, senderName: user.displayName, senderCreatedAt: user.accountCreatedAt, senderIsNewAccount: isNewAccount(user.accountCreatedAt), senderNameStyle: null, senderCustomTitle: null, createdAt: message.createdAt.toISOString() } }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_message_failed', error, 'POST /api/groups/[id]/messages'), { status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  const [membership] = await db.select({ groupId: disloopGroupMembers.groupId })
    .from(disloopGroupMembers)
    .where(and(eq(disloopGroupMembers.groupId, id), eq(disloopGroupMembers.userId, user.id)))
    .limit(1)
  if (!membership) return NextResponse.json({ error: 'group_membership_required' }, { status: 403 })

  try {
    const messages = await db.select({ id: disloopGroupMessages.id, senderId: disloopGroupMessages.senderId, body: disloopGroupMessages.body, mediaUrl: disloopGroupMessages.mediaUrl, mediaType: disloopGroupMessages.mediaType, createdAt: disloopGroupMessages.createdAt })
      .from(disloopGroupMessages)
      .where(eq(disloopGroupMessages.groupId, id))
      .orderBy(desc(disloopGroupMessages.createdAt), desc(disloopGroupMessages.id))
      .limit(50)
    const orderedMessages = messages.reverse()
    const reactions = await getMessageReactionSummaries('group', orderedMessages.map(({ id }) => id), user.id)
    return NextResponse.json({ messages: orderedMessages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString(), reactions: reactions.get(message.id) ?? [] })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_messages_failed', error, 'GET /api/groups/[id]/messages'), { status: 500 })
  }
}
