import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { isDiscordModerator } from '@/lib/discord-community'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopNewsPosts, disloopReels } from '@/lib/db/schema'
import { getModerationQueue } from '@/lib/moderation'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

async function authorizedModerator() {
  const user = await getCurrentUser()
  if (!user || !(await isDiscordModerator(user.discordId))) return null
  return user
}

export async function GET() {
  const moderator = await authorizedModerator()
  if (!moderator) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return NextResponse.json({ items: await getModerationQueue() }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const moderator = await authorizedModerator()
  if (!moderator) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const rateLimit = await rateLimitResponse(`moderation:${moderator.id}`, 60, 60)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({
    id: z.uuid(),
    isHidden: z.boolean(),
    kind: z.enum(['news', 'reel', 'daily']),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_moderation_action' }, { status: 400 })

  if (data.kind === 'news') {
    const [updated] = await db.update(disloopNewsPosts).set({ isHidden: data.isHidden, updatedAt: new Date() }).where(eq(disloopNewsPosts.id, data.id)).returning({ id: disloopNewsPosts.id })
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  } else if (data.kind === 'reel') {
    const [updated] = await db.update(disloopReels).set({ isHidden: data.isHidden, moderatedAt: data.isHidden ? new Date() : null, moderatedBy: data.isHidden ? moderator.id : null, updatedAt: new Date() }).where(eq(disloopReels.id, data.id)).returning({ id: disloopReels.id })
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  } else {
    const [updated] = await db.update(disloopDailyPosts).set({ isHidden: data.isHidden }).where(eq(disloopDailyPosts.id, data.id)).returning({ id: disloopDailyPosts.id })
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
