import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopNotifications } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`notifications:${user.id}`, 60, 60)
  if (rateLimit) return rateLimit
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const [updated] = await db.update(disloopNotifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(disloopNotifications.id, id), eq(disloopNotifications.recipientId, user.id), isNull(disloopNotifications.readAt), isNull(disloopNotifications.dismissedAt)))
      .returning({ id: disloopNotifications.id })
    return NextResponse.json({ read: Boolean(updated) })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('notification_update_failed', error, 'PATCH /api/notifications/[id]'), { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`notifications:${user.id}`, 60, 60)
  if (rateLimit) return rateLimit
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const [dismissed] = await db.update(disloopNotifications)
      .set({ dismissedAt: sql`now()` })
      .where(and(eq(disloopNotifications.id, id), eq(disloopNotifications.recipientId, user.id), isNull(disloopNotifications.dismissedAt)))
      .returning({ id: disloopNotifications.id })
    return NextResponse.json({ dismissed: Boolean(dismissed) })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('notification_dismiss_failed', error, 'DELETE /api/notifications/[id]'), { status: 500 })
  }
}
