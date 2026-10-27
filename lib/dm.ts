import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopFollows } from '@/lib/db/schema'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

export async function isMutualFollow(firstUserId: string, secondUserId: string) {
  const [firstFollowsSecond, secondFollowsFirst] = await Promise.all([
    db.select({ followerId: disloopFollows.followerId })
      .from(disloopFollows)
      .where(and(eq(disloopFollows.followerId, firstUserId), eq(disloopFollows.followedId, secondUserId)))
      .limit(1),
    db.select({ followerId: disloopFollows.followerId })
      .from(disloopFollows)
      .where(and(eq(disloopFollows.followerId, secondUserId), eq(disloopFollows.followedId, firstUserId)))
      .limit(1),
  ])

  return firstFollowsSecond.length > 0 && secondFollowsFirst.length > 0
}
