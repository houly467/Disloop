import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopReels, disloopUsers } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'reel_not_found' }, { status: 404 })

  const limit = await rateLimitResponse(`reel-pin:${user.id}`, 30, 3600)
  if (limit) return limit
  const data = await parseJsonBody(request, z.object({ pinned: z.boolean() }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_pin_action' }, { status: 400 })

  try {
    const result = await db.transaction(async (tx) => {
      const [reel] = await tx.select({ authorId: disloopReels.authorId, isPinned: disloopReels.isPinned })
        .from(disloopReels)
        .where(and(eq(disloopReels.id, id), eq(disloopReels.isHidden, false)))
        .for('update')
      if (!reel) return { error: 'reel_not_found' as const }
      if (reel.authorId !== user.id) return { error: 'reel_pin_permission_required' as const }

      const [owner] = await tx.select({ id: disloopUsers.id })
        .from(disloopUsers)
        .where(eq(disloopUsers.id, user.id))
        .for('update')
      if (!owner) return { error: 'reel_not_found' as const }

      if (data.pinned && !reel.isPinned) {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(disloopReels)
          .where(and(eq(disloopReels.authorId, user.id), eq(disloopReels.isPinned, true), eq(disloopReels.isHidden, false)))
        if (count >= 3) return { error: 'reel_pin_limit_reached' as const }
      }

      await tx.update(disloopReels).set({ isPinned: data.pinned, updatedAt: new Date() })
        .where(eq(disloopReels.id, id))
      return { pinned: data.pinned }
    })
    if ('error' in result) {
      const status = result.error === 'reel_not_found' ? 404 : result.error === 'reel_pin_permission_required' ? 403 : 409
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[reels] pin update failed', { reelId: id, userId: user.id, error })
    return NextResponse.json({ error: 'reel_pin_failed' }, { status: 500 })
  }
}
