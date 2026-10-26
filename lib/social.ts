import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopNotifications, disloopUsers, disloopXpEvents } from '@/lib/db/schema'
import { awardXp } from '@/lib/gamification'

export type SocialContentType = 'news' | 'reel' | 'daily'
export type SocialNotificationType = 'follow' | 'comment_reply' | 'mention' | 'repost' | 'like' | 'message_reaction' | 'group_invite'

export function findMentionUsernames(value: string) {
  return [...new Set([...value.matchAll(/(?:^|\s)@([a-zA-Z0-9._]{2,20})/g)].map((match) => match[1].toLowerCase()))]
}

export async function createNotification(input: {
  recipientId: string
  actorId: string
  type: SocialNotificationType
  targetType: 'profile' | SocialContentType | 'chat' | 'group_invite'
  targetId: string
}) {
  if (input.recipientId === input.actorId) return
  await db.insert(disloopNotifications).values(input)
}

export async function notifyMentions(text: string, actorId: string, targetType: SocialContentType | 'profile' | 'chat', targetId: string, allowedRecipientIds?: string[]) {
  const usernames = findMentionUsernames(text).slice(0, 5)
  if (!usernames.length) return
  const filters = [inArray(disloopUsers.usernameLower, usernames), eq(disloopUsers.isMember, true), eq(disloopUsers.isSeed, false)]
  if (allowedRecipientIds) filters.push(inArray(disloopUsers.id, allowedRecipientIds))
  const users = await db
    .select({ id: disloopUsers.id, usernameLower: disloopUsers.usernameLower })
    .from(disloopUsers)
    .where(and(...filters))
  const recipients = users.filter((user) => user.id !== actorId)
  if (!recipients.length) return
  await db.insert(disloopNotifications).values(recipients.map((user) => ({
    recipientId: user.id,
    actorId,
    type: 'mention' as const,
    targetType,
    targetId,
  })))
}

export async function awardCappedRepostXp(userId: string, contentType: SocialContentType, contentId: string) {
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disloopXpEvents)
    .where(and(eq(disloopXpEvents.userId, userId), eq(disloopXpEvents.reason, 'repost_received'), sql`${disloopXpEvents.createdAt} >= ${dayStart}`))
  if (count >= 10) return null
  return awardXp(userId, 2, 'repost_received', `repost:${contentType}:${contentId}:${dayStart.toISOString()}`)
}
