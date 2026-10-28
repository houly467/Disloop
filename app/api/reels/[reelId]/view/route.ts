import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopReelViews, disloopReels } from '@/lib/db/schema'
import { areUsersBlocked } from '@/lib/relationship-access'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'

export async function POST(request: NextRequest, context: { params: Promise<{ reelId: string }> }) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const { reelId } = await context.params
  if (!isUuid(reelId)) return NextResponse.json({ error: 'invalid_reel' }, { status: 400 })
  try {
    const [reel] = await db.select({ authorId: disloopReels.authorId }).from(disloopReels).where(eq(disloopReels.id, reelId)).limit(1)
    if (!reel || reel.authorId === user.id || await areUsersBlocked(user.id, reel.authorId)) return NextResponse.json({ recorded: false })
    await db.insert(disloopReelViews).values({ reelId, viewerId: user.id }).onConflictDoNothing()
    return NextResponse.json({ recorded: true })
  } catch (error) {
    console.error('[reel-view] event record failed', { userId: user.id, reelId, error })
    return NextResponse.json({ error: 'view_unavailable' }, { status: 503 })
  }
}
