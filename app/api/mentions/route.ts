import { apiFailurePayload } from '@/lib/api-errors'
import { and, asc, ilike, or, ne, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ people: [] }, { status: 401 })
  const rateLimit = await rateLimitResponse(`mentions:${user.id}`, 60, 60)
  if (rateLimit) return rateLimit
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 2 || query.length > 20) return NextResponse.json({ people: [] })
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
  try {
    const people = await db.select({
      id: disloopUsers.id,
      username: disloopUsers.usernameDisplay,
      displayName: disloopUsers.displayName,
      avatarUrl: disloopUsers.avatarUrl,
    }).from(disloopUsers)
      .where(and(eq(disloopUsers.isMember, true), eq(disloopUsers.isSeed, false), ne(disloopUsers.id, user.id), or(ilike(disloopUsers.usernameDisplay, pattern), ilike(disloopUsers.displayName, pattern))))
      .orderBy(asc(disloopUsers.displayName)).limit(8)
    return NextResponse.json({ people }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('mention_search_failed', error, '/api/mentions'), { status: 500 })
  }
}
