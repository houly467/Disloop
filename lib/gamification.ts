import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopUserBadgeRevocations, disloopUserBadges, disloopUsers, disloopXpEvents } from '@/lib/db/schema'
import { XP_LEVEL_BADGES } from '@/lib/badges'
import { syncDiscordXpRole } from '@/lib/discord-community'

const DAILY_XP_CAPS: Record<string, number> = {
  news_published: 20,
  daily_post: 24,
  story_published: 10,
  reel_published: 20,
  repost_received: 20,
}

export async function awardXp(userId: string, points: number, reason: string, eventKey: string) {
  const dailyCap = DAILY_XP_CAPS[reason]
  if (!dailyCap || !Number.isInteger(points) || points <= 0 || points > dailyCap || eventKey.length > 180) return null

  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const updatedUser = await db.transaction(async (tx) => {
    const [lockedUser] = await tx.select({ id: disloopUsers.id })
      .from(disloopUsers)
      .where(eq(disloopUsers.id, userId))
      .for('update')
    if (!lockedUser) return null

    const [earned] = await tx.select({ points: sql<number>`coalesce(sum(${disloopXpEvents.points}), 0)::int` })
      .from(disloopXpEvents)
      .where(and(eq(disloopXpEvents.userId, userId), eq(disloopXpEvents.reason, reason), gte(disloopXpEvents.createdAt, dayStart)))
    const grantedPoints = Math.min(points, Math.max(0, dailyCap - (earned?.points ?? 0)))
    if (grantedPoints <= 0) return null

    const [event] = await tx
      .insert(disloopXpEvents)
      .values({ userId, points: grantedPoints, reason, eventKey })
      .onConflictDoNothing({ target: disloopXpEvents.eventKey })
      .returning({ id: disloopXpEvents.id })
    if (!event) return null

    const [user] = await tx
      .update(disloopUsers)
      .set({ xp: sql`${disloopUsers.xp} + ${grantedPoints}`, updatedAt: new Date() })
      .where(eq(disloopUsers.id, userId))
      .returning({ discordId: disloopUsers.discordId, xp: disloopUsers.xp })
    if (!user) return null

    const eligibleBadgeIds = XP_LEVEL_BADGES
      .filter((badge) => user.xp >= badge.threshold)
      .map((badge) => badge.id)
    const level50Badge = XP_LEVEL_BADGES.find((badge) => badge.id === 'level-50-legend')
    if (level50Badge && user.xp >= level50Badge.threshold) eligibleBadgeIds.push('top-maker')

    if (eligibleBadgeIds.length > 0) {
      const revokedBadges = await tx.select({ badgeId: disloopUserBadgeRevocations.badgeId })
        .from(disloopUserBadgeRevocations)
        .where(and(
          eq(disloopUserBadgeRevocations.userId, userId),
          inArray(disloopUserBadgeRevocations.badgeId, eligibleBadgeIds),
        ))
      const revokedIds = new Set(revokedBadges.map(({ badgeId }) => badgeId))
      const badgesToGrant = eligibleBadgeIds
        .filter((badgeId) => !revokedIds.has(badgeId))
        .map((badgeId) => ({ userId, badgeId }))
      if (badgesToGrant.length > 0) {
        await tx.insert(disloopUserBadges).values(badgesToGrant).onConflictDoNothing()
      }
    }

    return user
  })

  if (updatedUser) await syncDiscordXpRole(updatedUser.discordId, updatedUser.xp).catch(() => undefined)
  return updatedUser?.xp ?? null
}

export type CommunityBadge = { id: string; label: string; description: string; earned: boolean }

export function getCommunityBadges(xp: number, newsCount: number, reelCount: number): CommunityBadge[] {
  return [
    { id: 'first-post', label: 'First note', description: 'Shared a news post', earned: newsCount > 0 },
    { id: 'first-reel', label: 'On camera', description: 'Published a community Reel', earned: reelCount > 0 },
    { id: 'community-voice', label: 'Community voice', description: 'Earned 100 XP', earned: xp >= 100 },
    { id: 'community-regular', label: 'Community regular', description: 'Earned 500 XP', earned: xp >= 500 },
  ]
}

export function getNextXpMilestone(xp: number) {
  const milestones = [25, 50, 100, 250, 500]
  return milestones.find((milestone) => xp < milestone) ?? null
}
