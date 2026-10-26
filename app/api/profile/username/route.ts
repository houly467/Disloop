import { and, eq, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopUserBadges, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { normalizeUsername } from '@/lib/users'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const username = request.nextUrl.searchParams.get('username')?.slice(0, 32) ?? ''
  const normalizedUsername = normalizeUsername(username, true)
  if (!normalizedUsername) {
    return NextResponse.json({ valid: false, available: false, reason: 'invalid' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  if (normalizedUsername.length < 3) {
    const [verifiedBadge] = await db.select({ userId: disloopUserBadges.userId })
      .from(disloopUserBadges)
      .where(and(eq(disloopUserBadges.userId, user.id), eq(disloopUserBadges.badgeId, 'verified')))
      .limit(1)
    if (!verifiedBadge) {
      return NextResponse.json({ valid: false, available: false, reason: 'verified_required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
  }

  const [existing] = await db.select({ id: disloopUsers.id })
    .from(disloopUsers)
    .where(and(eq(disloopUsers.usernameLower, normalizedUsername), ne(disloopUsers.id, user.id)))
    .limit(1)

  return NextResponse.json({ valid: true, available: !existing }, { headers: { 'Cache-Control': 'no-store' } })
}
