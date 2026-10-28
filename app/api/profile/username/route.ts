import { and, eq, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopUserBadges, disloopUsernameHistory, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { normalizeUsernameForLookup } from '@/lib/users'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const username = request.nextUrl.searchParams.get('username')?.slice(0, 32) ?? ''
  const normalizedUsername = normalizeUsernameForLookup(username)
  if (!normalizedUsername) {
    return NextResponse.json({ valid: false, available: false, reason: 'invalid' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const isExistingUsername = normalizedUsername === normalizeUsernameForLookup(user.username)
  if (normalizedUsername.length < 2 && !isExistingUsername) {
    return NextResponse.json({ valid: false, available: false, reason: 'minimum_length', minimumLength: 2 }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  let isVerified = false
  if (normalizedUsername.length <= 2) {
    const [verifiedBadge] = await db.select({ userId: disloopUserBadges.userId })
      .from(disloopUserBadges)
      .where(and(eq(disloopUserBadges.userId, user.id), eq(disloopUserBadges.badgeId, 'verified')))
      .limit(1)
    isVerified = Boolean(verifiedBadge)
  }
  if (normalizedUsername.length === 2 && !isVerified && !isExistingUsername) {
    return NextResponse.json({ valid: false, available: false, reason: 'verified_required', minimumLength: 3 }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const [existing] = await db.select({ id: disloopUsers.id })
    .from(disloopUsers)
    .where(and(eq(disloopUsers.usernameLower, normalizedUsername), ne(disloopUsers.id, user.id)))
    .limit(1)
  const [reserved] = await db.select({ userId: disloopUsernameHistory.userId })
    .from(disloopUsernameHistory)
    .where(eq(disloopUsernameHistory.usernameLower, normalizedUsername))
    .limit(1)

  return NextResponse.json({
    valid: true,
    available: !existing && (!reserved || reserved.userId === user.id),
    minimumLength: isVerified ? 2 : 3,
    existingShortUsername: isExistingUsername && normalizedUsername.length < 2,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
