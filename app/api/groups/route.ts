import { apiFailurePayload, logApiException, safeApiFailureReason } from '@/lib/api-errors'
import { and, asc, eq, ilike, lte, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { db } from '@/lib/db'
import { disloopGroupMembers, disloopGroups, disloopUsers } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

function databaseCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code ?? value.cause?.code ?? null
}

function databaseConstraint(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as { constraint?: string; cause?: { constraint?: string } }
  return value.constraint ?? value.cause?.constraint ?? null
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('q')?.trim().slice(0, 80) ?? ''
  const searchPattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`

  try {
    const user = await getCurrentUser()
    const rankedGroups = db.select({
      id: disloopGroups.id,
      name: disloopGroups.name,
      description: disloopGroups.description,
      tag: disloopGroups.tag,
      createdAt: disloopGroups.createdAt,
      ownerId: disloopGroups.ownerId,
      xp: disloopGroups.xp,
      rank: sql<number>`(row_number() over (order by ${disloopGroups.xp} desc, ${disloopGroups.createdAt} asc, ${disloopGroups.id} asc))::int`.as('rank'),
    }).from(disloopGroups)
      .as('ranked_groups')
    const membershipCondition = user
      ? sql<boolean>`exists (select 1 from ${disloopGroupMembers} where ${disloopGroupMembers.groupId} = ${rankedGroups.id} and ${disloopGroupMembers.userId} = ${user.id})`
      : sql<boolean>`false`

    const groupColumns = {
      id: rankedGroups.id,
      name: rankedGroups.name,
      description: rankedGroups.description,
      tag: rankedGroups.tag,
      createdAt: rankedGroups.createdAt,
      ownerId: rankedGroups.ownerId,
      xp: rankedGroups.xp,
      rank: rankedGroups.rank,
      memberCount: sql<number>`(select count(*)::int from ${disloopGroupMembers} where ${disloopGroupMembers.groupId} = ${rankedGroups.id})`,
      isMember: user
        ? sql<boolean>`exists (select 1 from ${disloopGroupMembers} where ${disloopGroupMembers.groupId} = ${rankedGroups.id} and ${disloopGroupMembers.userId} = ${user.id})`
        : sql<boolean>`false`,
    }
    const searchCondition = search
      ? or(
          ilike(rankedGroups.name, searchPattern),
          ilike(rankedGroups.description, searchPattern),
          ilike(rankedGroups.tag, searchPattern),
        )
      : undefined

    const [groups, topGroups, myGroup, hasCreatedGroup] = await Promise.all([
      db.select(groupColumns).from(rankedGroups).where(and(searchCondition, membershipCondition)).orderBy(asc(rankedGroups.rank)).limit(30),
      db.select(groupColumns).from(rankedGroups).where(and(lte(rankedGroups.rank, 5), membershipCondition)).orderBy(asc(rankedGroups.rank)),
      user
        ? db.select(groupColumns).from(rankedGroups)
          .innerJoin(disloopGroupMembers, eq(disloopGroupMembers.groupId, rankedGroups.id))
          .where(eq(disloopGroupMembers.userId, user.id))
          .orderBy(asc(rankedGroups.rank))
          .limit(1)
          .then(([group]) => group ?? null)
        : Promise.resolve(null),
      user ? db.select({ hasCreatedGroup: disloopUsers.hasCreatedGroup })
        .from(disloopUsers)
        .where(eq(disloopUsers.id, user.id))
        .limit(1)
        .then(([account]) => account?.hasCreatedGroup ?? false) : Promise.resolve(false),
    ])

    const serializeGroup = (group: (typeof groups)[number]) => ({ ...group, createdAt: group.createdAt.toISOString() })
    return NextResponse.json({
      groups: groups.map(serializeGroup),
      topGroups: topGroups.map(serializeGroup),
      myGroup: myGroup ? serializeGroup(myGroup) : null,
      hasCreatedGroup,
    }, {
      headers: { 'Cache-Control': user ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    const code = databaseCode(error)
    if (code === '42P01' || code === '42703') {
      return NextResponse.json({ groups: [], topGroups: [], myGroup: null, hasCreatedGroup: false, unavailable: true }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json(apiFailurePayload('groups_failed', error, 'GET /api/groups'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`groups:${user.id}`, 3, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({
    name: z.string().trim().min(1).max(70),
    description: z.string().trim().max(500).optional(),
    tag: z.string().trim().min(2).max(25),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  const name = data.name.replace(/\s+/g, ' ')
  const description = data.description ?? ''
  const tag = data.tag.toLocaleLowerCase('en-US').replace(/^#/, '')
  if (!name || name.length > 70 || description.length > 500 || !/^[\p{L}\p{N}_-]{2,24}$/u.test(tag)) {
    return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`)
      const [account] = await tx.select({ hasCreatedGroup: disloopUsers.hasCreatedGroup })
        .from(disloopUsers)
        .where(eq(disloopUsers.id, user.id))
        .for('update')
      if (!account) return { error: 'group_create_failed' as const, reason: 'account_missing' as const }
      if (account.hasCreatedGroup) return { error: 'group_limit_reached' as const }
      const [membership] = await tx.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(eq(disloopGroupMembers.userId, user.id))
        .limit(1)
      if (membership) return { error: 'group_membership_exists' as const }

      await tx.update(disloopUsers).set({ hasCreatedGroup: true, updatedAt: new Date() }).where(eq(disloopUsers.id, user.id))
      const [created] = await tx.insert(disloopGroups)
        .values({ ownerId: user.id, name, description, tag, isPrivate: true })
        .returning({ id: disloopGroups.id, name: disloopGroups.name, tag: disloopGroups.tag })
      await tx.insert(disloopGroupMembers).values({ groupId: created.id, userId: user.id, role: 'owner' })
      return { group: created }
    })
    if ('error' in result) {
      const message = result.error === 'group_limit_reached' ? 'group_limit_reached' : result.error
      return NextResponse.json({ error: message, ...(result.error === 'group_create_failed' && 'reason' in result ? { reason: result.reason } : {}) }, { status: result.error === 'group_create_failed' ? 500 : 409 })
    }
    return NextResponse.json({ group: result.group }, { status: 201 })
  } catch (error) {
    logApiException('POST /api/groups', error)
    if (databaseCode(error) === '23505' && databaseConstraint(error) === 'disloop_groups_tag_unique') return NextResponse.json({ error: 'group_tag_taken' }, { status: 409 })
    if (databaseCode(error) === '23505' && databaseConstraint(error) === 'disloop_group_members_user_unique') return NextResponse.json({ error: 'group_membership_exists' }, { status: 409 })
    return NextResponse.json({ error: 'group_create_failed', reason: safeApiFailureReason(error) }, { status: 500 })
  }
}
