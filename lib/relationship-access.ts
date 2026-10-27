import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopBlocks } from '@/lib/db/schema'

export async function areUsersBlocked(firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) return false
  const [row] = await db.select({ blockerId: disloopBlocks.blockerId })
    .from(disloopBlocks)
    .where(or(and(eq(disloopBlocks.blockerId, firstUserId), eq(disloopBlocks.blockedId, secondUserId)), and(eq(disloopBlocks.blockerId, secondUserId), eq(disloopBlocks.blockedId, firstUserId))))
    .limit(1)
  return Boolean(row)
}
