import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopXpEvents, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') ?? 'weekly'
  if (period !== 'weekly' && period !== 'monthly') return NextResponse.json({ error: 'invalid_period' }, { status: 400 })
  const now = new Date()
  const start = new Date(now)
  if (period === 'weekly') start.setUTCDate(start.getUTCDate() - 7)
  else start.setUTCDate(start.getUTCDate() - 30)
  try {
    const rankings = await db.select({
      userId: disloopUsers.id,
      displayName: disloopUsers.displayName,
      username: disloopUsers.usernameDisplay,
      avatarUrl: disloopUsers.avatarUrl,
      xp: sql<number>`sum(${disloopXpEvents.points})::int`,
    }).from(disloopXpEvents)
      .innerJoin(disloopUsers, eq(disloopUsers.id, disloopXpEvents.userId))
      .where(and(gte(disloopXpEvents.createdAt, start), eq(disloopUsers.isSeed, false)))
      .groupBy(disloopUsers.id)
      .orderBy(desc(sql`sum(${disloopXpEvents.points})`))
      .limit(50)
    const viewer = await getCurrentUser()
    if (!viewer || !rankings.length) return NextResponse.json({ rankings }, { headers: { 'Cache-Control': 'private, no-store' } })
    const ids = rankings.map((row) => row.userId)
    const blocks = await db.select({ blockerId: disloopBlocks.blockerId, blockedId: disloopBlocks.blockedId })
      .from(disloopBlocks).where(or(
        and(eq(disloopBlocks.blockerId, viewer.id), inArray(disloopBlocks.blockedId, ids)),
        and(eq(disloopBlocks.blockedId, viewer.id), inArray(disloopBlocks.blockerId, ids)),
      ))
    const blockedIds = new Set(blocks.flatMap((row) => [row.blockerId, row.blockedId].filter((id) => id !== viewer.id)))
    return NextResponse.json({ rankings: rankings.filter((row) => !blockedIds.has(row.userId)) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[leaderboard] lookup failed', { error })
    return NextResponse.json({ rankings: [], available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
