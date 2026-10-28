import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopFollows, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { isNewAccount } from '@/lib/new-account'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  if (query.length < 2) return NextResponse.json({ people: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
  try {
    const people = await db
      .select({
        id: disloopUsers.id,
        username: disloopUsers.usernameDisplay,
        displayName: disloopUsers.displayName,
        avatarUrl: disloopUsers.avatarUrl,
        accountCreatedAt: disloopUsers.createdAt,
        nameStyle: disloopUserFlair.nameStyle,
        customTitle: disloopUserFlair.customTitle,
        following: sql<boolean>`exists (select 1 from ${disloopFollows} where ${disloopFollows.followerId} = ${user.id} and ${disloopFollows.followedId} = ${disloopUsers.id})`.as('following'),
        followsYou: sql<boolean>`exists (select 1 from ${disloopFollows} where ${disloopFollows.followerId} = ${disloopUsers.id} and ${disloopFollows.followedId} = ${user.id})`.as('follows_you'),
      })
      .from(disloopUsers)
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(and(
        eq(disloopUsers.isSeed, false),
        ne(disloopUsers.id, user.id),
        or(
          ilike(disloopUsers.usernameLower, pattern),
          ilike(disloopUsers.displayName, pattern),
          ilike(disloopUsers.discordUsername, pattern),
        ),
      ))
      .orderBy(disloopUsers.displayName)
      .limit(20)

    return NextResponse.json({ people: people.map((person) => ({ ...person, accountCreatedAt: person.accountCreatedAt.toISOString(), isNewAccount: isNewAccount(person.accountCreatedAt) })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('member_search_failed', error, '/api/dm/people'), { status: 500 })
  }
}
