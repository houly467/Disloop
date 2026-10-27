import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopDmConversations, disloopDmMessages } from '@/lib/db/schema'
import { isMutualFollow, isUuid } from '@/lib/dm'
import { getMessageReactionSummaries, isAllowedChatMediaUrl } from '@/lib/chat'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { notifyMentions } from '@/lib/social'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

type RouteProps = { params: Promise<{ id: string }> }

async function getAccessibleConversation(id: string, userId: string) {
  if (!isUuid(id)) return null
  const [conversation] = await db.select()
    .from(disloopDmConversations)
    .where(and(
      eq(disloopDmConversations.id, id),
      or(eq(disloopDmConversations.userA, userId), eq(disloopDmConversations.userB, userId)),
    ))
    .limit(1)
  if (!conversation) return null

  const peerId = conversation.userA === userId ? conversation.userB : conversation.userA
  return (await isMutualFollow(userId, peerId)) ? conversation : null
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  try {
    const conversation = await getAccessibleConversation(id, user.id)
    if (!conversation) return NextResponse.json({ error: 'conversation_not_found_or_locked' }, { status: 404 })
    const newestMessages = await db.select({ id: disloopDmMessages.id, senderId: disloopDmMessages.senderId, body: disloopDmMessages.body, mediaUrl: disloopDmMessages.mediaUrl, mediaType: disloopDmMessages.mediaType, createdAt: disloopDmMessages.createdAt })
      .from(disloopDmMessages)
      .where(eq(disloopDmMessages.conversationId, conversation.id))
      .orderBy(desc(disloopDmMessages.createdAt), desc(disloopDmMessages.id))
      .limit(100)
    const orderedMessages = newestMessages.reverse()
    const reactions = await getMessageReactionSummaries('direct', orderedMessages.map(({ id }) => id), user.id)

    return NextResponse.json({ messages: orderedMessages.map((message) => ({ ...message, reactions: reactions.get(message.id) ?? [] })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('messages_failed', error, 'GET /api/dm/conversations/[id]/messages'), { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`direct-messages:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit
  const { id } = await params
  const data = await parseJsonBody(request, z.object({
    body: z.string().max(2000).optional(),
    mediaUrl: z.string().max(2048).nullable().optional(),
    mediaType: z.string().max(32).nullable().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_message' }, { status: 400 })
  const body = (data.body ?? '').trim()
  const mediaUrl = data.mediaUrl ?? null
  const mediaType = data.mediaType ?? null
  const allowedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (body.length > 2000 || (!body && !mediaUrl) || (mediaUrl && (!isAllowedChatMediaUrl(mediaUrl, user.id) || !mediaType || !allowedMediaTypes.has(mediaType))) || (!mediaUrl && mediaType)) {
    return NextResponse.json({ error: 'invalid_message' }, { status: 400 })
  }

  try {
    const conversation = await getAccessibleConversation(id, user.id)
    if (!conversation) return NextResponse.json({ error: 'conversation_not_found_or_locked' }, { status: 404 })
    const peerId = conversation.userA === user.id ? conversation.userB : conversation.userA
    const [message] = await db.insert(disloopDmMessages)
      .values({ conversationId: conversation.id, senderId: user.id, body, mediaUrl, mediaType })
      .returning({ id: disloopDmMessages.id, senderId: disloopDmMessages.senderId, body: disloopDmMessages.body, mediaUrl: disloopDmMessages.mediaUrl, mediaType: disloopDmMessages.mediaType, createdAt: disloopDmMessages.createdAt })
    await db.update(disloopDmConversations)
      .set({ lastMessageAt: message.createdAt })
      .where(eq(disloopDmConversations.id, conversation.id))
    await notifyMentions(body, user.id, 'chat', conversation.id, [peerId]).catch(() => undefined)
    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('message_send_failed', error, 'POST /api/dm/conversations/[id]/messages'), { status: 500 })
  }
}
