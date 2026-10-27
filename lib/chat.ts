import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopChatReactions } from '@/lib/db/schema'
import { isPrivateMediaUrlForUser, isPublicBlobUrlForUser } from '@/lib/private-media'

export type MessageReaction = { reaction: string; count: number; reactedByMe: boolean }

export async function getMessageReactionSummaries(chatType: 'direct' | 'group', messageIds: string[], userId: string) {
  if (!messageIds.length) return new Map<string, MessageReaction[]>()
  const rows = await db.select({ messageId: disloopChatReactions.messageId, userId: disloopChatReactions.userId, reaction: disloopChatReactions.reaction })
    .from(disloopChatReactions)
    .where(and(eq(disloopChatReactions.chatType, chatType), inArray(disloopChatReactions.messageId, messageIds)))
  const summaries = new Map<string, Map<string, MessageReaction>>()
  for (const row of rows) {
    const message = summaries.get(row.messageId) ?? new Map<string, MessageReaction>()
    const item = message.get(row.reaction) ?? { reaction: row.reaction, count: 0, reactedByMe: false }
    item.count += 1
    if (row.userId === userId) item.reactedByMe = true
    message.set(row.reaction, item)
    summaries.set(row.messageId, message)
  }
  return new Map([...summaries.entries()].map(([messageId, reactions]) => [messageId, [...reactions.values()]]))
}

export function isAllowedChatMediaUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'chat-media', userId) || isPublicBlobUrlForUser(value, 'chat-media', userId)
}
