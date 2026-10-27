import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopNotifications } from '@/lib/db/schema'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`notifications:${user.id}`, 10, 60)
  if (rateLimit) return rateLimit
  try {
    await db.update(disloopNotifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(disloopNotifications.recipientId, user.id), isNull(disloopNotifications.dismissedAt)))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('notifications_update_failed', error, 'POST /api/notifications/read'), { status: 500 })
  }
}
