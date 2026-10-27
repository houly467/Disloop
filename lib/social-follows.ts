import { eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopBlocks, disloopFollows, disloopUsers } from '@/lib/db/schema'

export type FollowCounts = {
  followersCount: number
  followingCount: number
}

export async function getFollowCounts(userId: string, viewerId?: string): Promise<FollowCounts> {
  const memberFollower = sql`exists (select 1 from ${disloopUsers} where ${disloopUsers.id} = ${disloopFollows.followerId} and ${disloopUsers.isMember} = true)`
  const memberFollowed = sql`exists (select 1 from ${disloopUsers} where ${disloopUsers.id} = ${disloopFollows.followedId} and ${disloopUsers.isMember} = true)`
  const visibleFollower = viewerId
    ? sql`not exists (select 1 from ${disloopBlocks} where (${disloopBlocks.blockerId} = ${viewerId} and ${disloopBlocks.blockedId} = ${disloopFollows.followerId}) or (${disloopBlocks.blockerId} = ${disloopFollows.followerId} and ${disloopBlocks.blockedId} = ${viewerId}))`
    : sql`true`
  const visibleFollowed = viewerId
    ? sql`not exists (select 1 from ${disloopBlocks} where (${disloopBlocks.blockerId} = ${viewerId} and ${disloopBlocks.blockedId} = ${disloopFollows.followedId}) or (${disloopBlocks.blockerId} = ${disloopFollows.followedId} and ${disloopBlocks.blockedId} = ${viewerId}))`
    : sql`true`
  const [counts] = await db.select({
    followersCount: sql<number>`count(*) filter (where ${disloopFollows.followedId} = ${userId} and ${memberFollower} and ${visibleFollower})`.mapWith(Number),
    followingCount: sql<number>`count(*) filter (where ${disloopFollows.followerId} = ${userId} and ${memberFollowed} and ${visibleFollowed})`.mapWith(Number),
  }).from(disloopFollows)
    .where(or(eq(disloopFollows.followedId, userId), eq(disloopFollows.followerId, userId)))

  return counts
}
