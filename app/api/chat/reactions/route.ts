import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopChatReactions, disloopDmConversations, disloopDmMessages, disloopGroupMembers, disloopGroupMessages } from '@/lib/db/schema'
import { isMutualFollow } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

type ReactionRow = { reaction: string; count: number; reactedByMe: boolean }

function summarize(rows: Array<{ reaction: string; userId: string }>, userId: string): ReactionRow[] {
  const counts = new Map<string, ReactionRow>()
  for (const row of rows) {
    const item = counts.get(row.reaction) ?? { reaction: row.reaction, count: 0, reactedByMe: false }
    item.count += 1
    if (row.userId === userId) item.reactedByMe = true
    counts.set(row.reaction, item)
  }
  return [...counts.values()]
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`chat-reactions:${user.id}`, 60, 60)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    chatType: z.enum(['direct', 'group']),
    messageId: z.uuid(),
    reaction: z.enum(['👍', '❤️', '😂', '🎉']),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_reaction' }, { status: 400 })
  const { chatType, messageId, reaction } = data

  try {
    if (chatType === 'direct') {
      const [message] = await db.select({ conversationId: disloopDmMessages.conversationId })
        .from(disloopDmMessages).where(eq(disloopDmMessages.id, messageId)).limit(1)
      if (!message) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
      const [conversation] = await db.select({ userA: disloopDmConversations.userA, userB: disloopDmConversations.userB })
        .from(disloopDmConversations)
        .where(and(eq(disloopDmConversations.id, message.conversationId), or(eq(disloopDmConversations.userA, user.id), eq(disloopDmConversations.userB, user.id))))
        .limit(1)
      if (!conversation) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
      const peerId = conversation.userA === user.id ? conversation.userB : conversation.userA
      if (!(await isMutualFollow(user.id, peerId))) return NextResponse.json({ error: 'conversation_locked' }, { status: 403 })
    } else {
      const [message] = await db.select({ groupId: disloopGroupMessages.groupId })
        .from(disloopGroupMessages).where(eq(disloopGroupMessages.id, messageId)).limit(1)
      if (!message) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
      const [membership] = await db.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(and(eq(disloopGroupMembers.groupId, message.groupId), eq(disloopGroupMembers.userId, user.id)))
        .limit(1)
      if (!membership) return NextResponse.json({ error: 'group_membership_required' }, { status: 403 })
    }

    const [existing] = await db.select({ reaction: disloopChatReactions.reaction })
      .from(disloopChatReactions)
      .where(and(eq(disloopChatReactions.chatType, chatType), eq(disloopChatReactions.messageId, messageId), eq(disloopChatReactions.userId, user.id), eq(disloopChatReactions.reaction, reaction)))
      .limit(1)
    if (existing) {
      await db.delete(disloopChatReactions).where(and(eq(disloopChatReactions.chatType, chatType), eq(disloopChatReactions.messageId, messageId), eq(disloopChatReactions.userId, user.id), eq(disloopChatReactions.reaction, reaction)))
    } else {
      await db.insert(disloopChatReactions).values({ chatType, messageId, userId: user.id, reaction }).onConflictDoNothing()
    }
    const rows = await db.select({ reaction: disloopChatReactions.reaction, userId: disloopChatReactions.userId })
      .from(disloopChatReactions)
      .where(and(eq(disloopChatReactions.chatType, chatType), eq(disloopChatReactions.messageId, messageId)))
    return NextResponse.json({ reactions: summarize(rows, user.id) })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reaction_failed', error, '/api/chat/reactions'), { status: 500 })
  }
}
