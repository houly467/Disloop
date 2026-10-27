import { apiFailurePayload } from '@/lib/api-errors'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopGroupMembers, disloopGroups } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'

type RouteProps = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`)
      const [group] = await tx.select({ id: disloopGroups.id, isPrivate: disloopGroups.isPrivate })
        .from(disloopGroups)
        .where(eq(disloopGroups.id, id))
        .limit(1)
      if (!group) return { error: 'group_not_found' as const }
      if (group.isPrivate) return { error: 'invite_required' as const }
      const [membership] = await tx.select({ groupId: disloopGroupMembers.groupId })
        .from(disloopGroupMembers)
        .where(eq(disloopGroupMembers.userId, user.id))
        .limit(1)
      if (membership) return membership.groupId === id ? { joined: true as const } : { error: 'group_membership_exists' as const }
      await tx.insert(disloopGroupMembers).values({ groupId: id, userId: user.id, role: 'member' })
      return { joined: true as const }
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.error === 'group_not_found' ? 404 : result.error === 'invite_required' ? 403 : 409 })
    return NextResponse.json({ joined: true })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('group_join_failed', error, 'POST /api/groups/[id]/join'), { status: 500 })
  }
}
