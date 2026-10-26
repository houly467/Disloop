import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopProfileVisits } from '@/lib/db/schema'

export async function recordProfileVisit(profileId: string, visitorId: string) {
  if (profileId === visitorId) return

  await db.insert(disloopProfileVisits)
    .values({ profileId, visitorId, visitDate: new Date().toISOString().slice(0, 10) })
    .onConflictDoNothing()
}

export async function getProfileVisitCount(profileId: string) {
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(disloopProfileVisits)
    .where(eq(disloopProfileVisits.profileId, profileId))
  return result?.count ?? 0
}
