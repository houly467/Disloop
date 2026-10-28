import { and, count, eq, gte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopComments, disloopDailyPosts, disloopLikes, disloopNewsPosts, disloopReels } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { awardXp } from '@/lib/gamification'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const challengeIds = ['publish-post', 'comment-three', 'five-likes', 'weekly-reel'] as const
type ChallengeId = typeof challengeIds[number]

function getWindows(now: Date) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const weekStart = new Date(dayStart)
  weekStart.setUTCDate(dayStart.getUTCDate() - ((dayStart.getUTCDay() + 6) % 7))
  return { dayStart, weekStart }
}

async function getProgress(userId: string, now = new Date()) {
  const { dayStart, weekStart } = getWindows(now)
  const [news, daily, comments, newsLikes, reelLikes, dailyLikes, reels] = await Promise.all([
    db.select({ value: count() }).from(disloopNewsPosts).where(and(eq(disloopNewsPosts.authorId, userId), gte(disloopNewsPosts.createdAt, dayStart))),
    db.select({ value: count() }).from(disloopDailyPosts).where(and(eq(disloopDailyPosts.authorId, userId), gte(disloopDailyPosts.createdAt, dayStart))),
    db.select({ value: count() }).from(disloopComments).where(and(eq(disloopComments.authorId, userId), gte(disloopComments.createdAt, dayStart), eq(disloopComments.isHidden, false))),
    db.select({ value: count() }).from(disloopLikes).innerJoin(disloopNewsPosts, and(eq(disloopLikes.contentId, disloopNewsPosts.id), eq(disloopLikes.contentType, 'news')))
      .where(and(eq(disloopNewsPosts.authorId, userId), gte(disloopLikes.createdAt, dayStart))),
    db.select({ value: count() }).from(disloopLikes).innerJoin(disloopReels, and(eq(disloopLikes.contentId, disloopReels.id), eq(disloopLikes.contentType, 'reel')))
      .where(and(eq(disloopReels.authorId, userId), gte(disloopLikes.createdAt, dayStart))),
    db.select({ value: count() }).from(disloopLikes).innerJoin(disloopDailyPosts, and(eq(disloopLikes.contentId, disloopDailyPosts.id), eq(disloopLikes.contentType, 'daily')))
      .where(and(eq(disloopDailyPosts.authorId, userId), gte(disloopLikes.createdAt, dayStart))),
    db.select({ value: count() }).from(disloopReels).where(and(eq(disloopReels.authorId, userId), gte(disloopReels.createdAt, weekStart))),
  ])
  return [
    { id: 'publish-post' as const, period: 'daily', count: Math.min(1, Number(news[0]?.value ?? 0) + Number(daily[0]?.value ?? 0)), target: 1, xp: 5 },
    { id: 'comment-three' as const, period: 'daily', count: Number(comments[0]?.value ?? 0), target: 3, xp: 5 },
    { id: 'five-likes' as const, period: 'daily', count: Number(newsLikes[0]?.value ?? 0) + Number(reelLikes[0]?.value ?? 0) + Number(dailyLikes[0]?.value ?? 0), target: 5, xp: 5 },
    { id: 'weekly-reel' as const, period: 'weekly', count: Number(reels[0]?.value ?? 0), target: 1, xp: 10 },
  ]
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  try {
    return NextResponse.json({ challenges: await getProgress(user.id) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[challenges] progress lookup failed', { userId: user.id, error })
    return NextResponse.json({ challenges: [], available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const { user } = access
  const limited = await rateLimitResponse(`challenge-claim:${user.id}`, 20, 3600)
  if (limited) return limited
  const data = await parseJsonBody(request, z.object({ challengeId: z.enum(challengeIds) }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_challenge' }, { status: 400 })
  const now = new Date()
  try {
    const challenge = (await getProgress(user.id, now)).find((item) => item.id === data.challengeId)
    if (!challenge || challenge.count < challenge.target) return NextResponse.json({ error: 'challenge_incomplete' }, { status: 409 })
    const { dayStart, weekStart } = getWindows(now)
    const periodKey = challenge.period === 'daily' ? dayStart.toISOString().slice(0, 10) : weekStart.toISOString().slice(0, 10)
    const xp = await awardXp(user.id, challenge.xp, 'challenge_reward', `challenge:${challenge.id}:${user.id}:${periodKey}`)
    return NextResponse.json({ xp, claimed: xp !== null })
  } catch (error) {
    console.error('[challenges] reward claim failed', { userId: user.id, challengeId: data.challengeId, error })
    return NextResponse.json({ error: 'challenge_unavailable' }, { status: 503 })
  }
}
