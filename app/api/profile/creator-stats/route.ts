import { and, count, eq, gte, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopComments, disloopFollows, disloopLikes, disloopNewsPosts, disloopProfileVisits, disloopReelViews, disloopReels, disloopReposts } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'

async function statsBetween(userId: string, since: Date, until: Date) {
  const [profileViews, followerGrowth, reelViews, newsLikes, reelLikes, newsReposts, reelReposts, comments] = await Promise.all([
    db.select({ value: count() }).from(disloopProfileVisits).where(and(eq(disloopProfileVisits.profileId, userId), gte(disloopProfileVisits.createdAt, since), lt(disloopProfileVisits.createdAt, until))),
    db.select({ value: count() }).from(disloopFollows).where(and(eq(disloopFollows.followedId, userId), gte(disloopFollows.createdAt, since), lt(disloopFollows.createdAt, until))),
    db.select({ value: count() }).from(disloopReelViews).innerJoin(disloopReels, eq(disloopReelViews.reelId, disloopReels.id))
      .where(and(eq(disloopReels.authorId, userId), gte(disloopReelViews.viewedAt, since), lt(disloopReelViews.viewedAt, until))),
    db.select({ value: count() }).from(disloopLikes).innerJoin(disloopNewsPosts, and(eq(disloopNewsPosts.id, disloopLikes.contentId), eq(disloopLikes.contentType, 'news')))
      .where(and(eq(disloopNewsPosts.authorId, userId), gte(disloopLikes.createdAt, since), lt(disloopLikes.createdAt, until))),
    db.select({ value: count() }).from(disloopLikes).innerJoin(disloopReels, and(eq(disloopReels.id, disloopLikes.contentId), eq(disloopLikes.contentType, 'reel')))
      .where(and(eq(disloopReels.authorId, userId), gte(disloopLikes.createdAt, since), lt(disloopLikes.createdAt, until))),
    db.select({ value: count() }).from(disloopReposts).innerJoin(disloopNewsPosts, and(eq(disloopNewsPosts.id, disloopReposts.contentId), eq(disloopReposts.contentType, 'news')))
      .where(and(eq(disloopNewsPosts.authorId, userId), gte(disloopReposts.createdAt, since), lt(disloopReposts.createdAt, until))),
    db.select({ value: count() }).from(disloopReposts).innerJoin(disloopReels, and(eq(disloopReels.id, disloopReposts.contentId), eq(disloopReposts.contentType, 'reel')))
      .where(and(eq(disloopReels.authorId, userId), gte(disloopReposts.createdAt, since), lt(disloopReposts.createdAt, until))),
    db.select({ value: count() }).from(disloopComments).where(and(eq(disloopComments.authorId, userId), gte(disloopComments.createdAt, since), lt(disloopComments.createdAt, until))),
  ])
  return {
    profileViews: Number(profileViews[0]?.value ?? 0),
    followerGrowth: Number(followerGrowth[0]?.value ?? 0),
    reelViews: Number(reelViews[0]?.value ?? 0),
    likes: Number(newsLikes[0]?.value ?? 0) + Number(reelLikes[0]?.value ?? 0),
    reposts: Number(newsReposts[0]?.value ?? 0) + Number(reelReposts[0]?.value ?? 0),
    comments: Number(comments[0]?.value ?? 0),
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  const now = new Date()
  const sevenDays = new Date(now.getTime() - 7 * 86400000)
  const thirtyDays = new Date(now.getTime() - 30 * 86400000)
  const fourteenDays = new Date(now.getTime() - 14 * 86400000)
  const sixtyDays = new Date(now.getTime() - 60 * 86400000)
  try {
    const [last7Days, previous7Days, last30Days, previous30Days] = await Promise.all([
      statsBetween(user.id, sevenDays, now),
      statsBetween(user.id, fourteenDays, sevenDays),
      statsBetween(user.id, thirtyDays, now),
      statsBetween(user.id, sixtyDays, thirtyDays),
    ])
    return NextResponse.json({ last7Days, previous7Days, last30Days, previous30Days }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[creator-stats] lookup failed', { userId: user.id, error })
    return NextResponse.json({ last7Days: null, previous7Days: null, last30Days: null, previous30Days: null, available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
