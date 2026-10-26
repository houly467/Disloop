import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { db } from '@/lib/db'
import { disloopReelLikes, disloopReels } from '@/lib/db/schema'
import { createNotification } from '@/lib/social'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const [reel] = await db.select({ id: disloopReels.id, authorId: disloopReels.authorId }).from(disloopReels).where(and(eq(disloopReels.id, id), eq(disloopReels.isHidden, false))).limit(1)
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [created] = await db.insert(disloopReelLikes).values({ reelId: id, userId: user.id }).onConflictDoNothing().returning({ userId: disloopReelLikes.userId })
  if (created) await createNotification({ recipientId: reel.authorId, actorId: user.id, type: 'like', targetType: 'reel', targetId: id }).catch(() => undefined)
  const liked = Boolean(created) || await db.delete(disloopReelLikes).where(and(eq(disloopReelLikes.reelId, id), eq(disloopReelLikes.userId, user.id))).returning({ userId: disloopReelLikes.userId }).then((rows) => rows.length === 0)
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(disloopReelLikes).where(eq(disloopReelLikes.reelId, id))
  return NextResponse.json({ liked, likeCount: count })
}
