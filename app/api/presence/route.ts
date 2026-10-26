import { apiFailurePayload } from '@/lib/api-errors'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopUsers } from '@/lib/db/schema'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

export async function PATCH(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`presence:${user.id}`, 30, 60)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({ status: z.enum(['online', 'idle', 'dnd', 'invisible']) }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
  const status = data.status

  try {
    await db.update(disloopUsers)
      .set({ presenceStatus: status, presenceUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(disloopUsers.id, user.id))
    return NextResponse.json({ status })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('presence_update_failed', error, '/api/presence'), { status: 500 })
  }
}
