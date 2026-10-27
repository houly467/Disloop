import { and, eq, gte, sql } from 'drizzle-orm'
import { apiFailurePayload } from '@/lib/api-errors'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopProfileVisits } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6))
  const startDate = start.toISOString().slice(0, 10)
  try {
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(disloopProfileVisits)
        .where(eq(disloopProfileVisits.profileId, user.id)),
      db.select({ date: disloopProfileVisits.visitDate, count: sql<number>`count(*)::int` })
        .from(disloopProfileVisits)
        .where(and(eq(disloopProfileVisits.profileId, user.id), gte(disloopProfileVisits.visitDate, startDate)))
        .groupBy(disloopProfileVisits.visitDate),
    ])
    const countByDate = new Map(rows.map((row) => [row.date, row.count]))
    const visits = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
      return { date, count: countByDate.get(date) ?? 0 }
    })
    return NextResponse.json({ total, visits }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('profile_visits_unavailable', error, 'GET /api/profile/visits'), { status: 500 })
  }
}
