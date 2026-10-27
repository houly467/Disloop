import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopNewsPosts, disloopReels, disloopUserBadges, disloopUserBadgeRevocations, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { BADGES, XP_LEVEL_BADGES } from '@/lib/badges'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

async function getBadgeData(userId: string) {
  const [user] = await db.select({ id: disloopUsers.id, xp: disloopUsers.xp, isStaffRole: disloopUsers.isStaffRole })
    .from(disloopUsers).where(eq(disloopUsers.id, userId)).limit(1)
  if (!user) return null
  const [owned, revoked, [{ totalMembers }], [{ posts }], [{ reels }], [{ dailyPosts }]] = await Promise.all([
    db.select().from(disloopUserBadges).where(eq(disloopUserBadges.userId, userId)),
    db.select({ badgeId: disloopUserBadgeRevocations.badgeId }).from(disloopUserBadgeRevocations).where(eq(disloopUserBadgeRevocations.userId, userId)),
    db.select({ totalMembers: sql<number>`count(*)::int` }).from(disloopUsers).where(and(eq(disloopUsers.isMember, true), eq(disloopUsers.isSeed, false))),
    db.select({ posts: sql<number>`count(*)::int` }).from(disloopNewsPosts).where(and(eq(disloopNewsPosts.authorId, userId), eq(disloopNewsPosts.isHidden, false))),
    db.select({ reels: sql<number>`count(*)::int` }).from(disloopReels).where(and(eq(disloopReels.authorId, userId), eq(disloopReels.isHidden, false))),
    db.select({ dailyPosts: sql<number>`count(*)::int` }).from(disloopDailyPosts).where(and(eq(disloopDailyPosts.authorId, userId), eq(disloopDailyPosts.isHidden, false))),
  ])
  const ownedMap = new Map(owned.map((badge) => [badge.badgeId, badge]))
  const revokedBadges = new Set(revoked.map((badge) => badge.badgeId))
  const automaticEarned = new Set<string>()
  if (posts > 0 || reels > 0 || dailyPosts > 0) automaticEarned.add('creator')
  XP_LEVEL_BADGES.forEach((badge) => {
    if (user.xp >= badge.threshold) automaticEarned.add(badge.id)
  })
  const level50Badge = XP_LEVEL_BADGES.find((badge) => badge.id === 'level-50-legend')
  if (level50Badge && user.xp >= level50Badge.threshold) automaticEarned.add('top-maker')
  if (user.isStaffRole === 'moderator') automaticEarned.add('moderator')
  if (user.isStaffRole) automaticEarned.add('staff')
  const memberBadges = await db.select({ badgeId: disloopUserBadges.badgeId, count: sql<number>`count(*)::int` })
    .from(disloopUserBadges).groupBy(disloopUserBadges.badgeId)
  const countMap = new Map(memberBadges.map((item) => [item.badgeId, item.count]))
  return BADGES.map((badge) => {
    const record = ownedMap.get(badge.id)
    const isRevoked = revokedBadges.has(badge.id)
    const earned = !isRevoked && (automaticEarned.has(badge.id) || Boolean(record))
    const progress = badge.threshold
      ? { current: Math.min(user.xp, badge.threshold), target: badge.threshold }
      : badge.id === 'creator' ? { current: Math.min(posts + reels + dailyPosts, 1), target: 1 } : null
    const population = countMap.get(badge.id) ?? 0
    return {
      ...badge,
      earned,
      earnedAt: record?.earnedAt.toISOString() ?? null,
      equipped: !isRevoked && Boolean(record?.isEquipped),
      count: record?.counter ?? 0,
      streak: record?.streak ?? 0,
      progress,
      percentage: totalMembers ? Math.round((population / totalMembers) * 1000) / 10 : 0,
    }
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  if (!isUuid(userId)) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  try {
    const badges = await getBadgeData(userId)
    return badges ? NextResponse.json({ badges }, { headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('badges_unavailable', error, 'GET /api/badges/[userId]'), { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const viewer = access.user
  if (viewer.id !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const rateLimit = await rateLimitResponse(`badges:${viewer.id}`, 30, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ equipped: z.array(z.string().min(1).max(48)).max(3) }).strict())
  if (!data || data.equipped.some((id) => !BADGES.some((badge) => badge.id === id))) {
    return NextResponse.json({ error: 'invalid_badges' }, { status: 400 })
  }
  try {
    const badges = await getBadgeData(userId)
    const earnedIds = new Set(badges?.filter((badge) => badge.earned).map((badge) => badge.id) ?? [])
    const equipped = [...new Set(data.equipped as string[])]
    if (equipped.some((id) => !earnedIds.has(id))) return NextResponse.json({ error: 'badge_not_earned' }, { status: 403 })
    await db.transaction(async (tx) => {
      await tx.update(disloopUserBadges).set({ isEquipped: false }).where(eq(disloopUserBadges.userId, userId))
      for (const badgeId of equipped) {
        await tx.insert(disloopUserBadges).values({ userId, badgeId, isEquipped: true })
          .onConflictDoUpdate({ target: [disloopUserBadges.userId, disloopUserBadges.badgeId], set: { isEquipped: true } })
      }
    })
    return NextResponse.json({ equipped })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('badge_update_failed', error, '/api/badges/[userId]'), { status: 500 })
  }
}
