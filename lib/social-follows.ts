import { eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopBlocks, disloopFollows } from '@/lib/db/schema'

export type FollowCounts = {
  followersCount: number
  followingCount: number
}

export async function getFollowCounts(userId: string, viewerId?: string): Promise<FollowCounts> {
  const visibleFollower = viewerId
    ? sql`not exists (select 1 from ${disloopBlocks} where (${disloopBlocks.blockerId} = ${viewerId} and ${disloopBlocks.blockedId} = ${disloopFollows.followerId}) or (${disloopBlocks.blockerId} = ${disloopFollows.followerId} and ${disloopBlocks.blockedId} = ${viewerId}))`
    : sql`true`
  const visibleFollowed = viewerId
    ? sql`not exists (select 1 from ${disloopBlocks} where (${disloopBlocks.blockerId} = ${viewerId} and ${disloopBlocks.blockedId} = ${disloopFollows.followedId}) or (${disloopBlocks.blockerId} = ${disloopFollows.followedId} and ${disloopBlocks.blockedId} = ${viewerId}))`
    : sql`true`
  const [counts] = await db.select({
    followersCount: sql<number>`count(*) filter (where ${disloopFollows.followedId} = ${userId} and ${visibleFollower})`.mapWith(Number),
    followingCount: sql<number>`count(*) filter (where ${disloopFollows.followerId} = ${userId} and ${visibleFollowed})`.mapWith(Number),
  }).from(disloopFollows)
    .where(or(eq(disloopFollows.followedId, userId), eq(disloopFollows.followerId, userId)))

  return counts
}
