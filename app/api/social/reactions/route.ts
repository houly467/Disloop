import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopFollows, disloopLikes, disloopReelLikes, disloopReposts, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { isUuid } from '@/lib/dm'
import { getClientRateLimitKey } from '@/lib/security'
import { rateLimitResponse } from '@/lib/rate-limit'
import { isNewAccount } from '@/lib/new-account'

const contentTypes = new Set(['news', 'reel', 'daily'])

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitResponse(getClientRateLimitKey(request, 'social-reactions'), 120, 60)
  if (rateLimit) return rateLimit

  const type = request.nextUrl.searchParams.get('type')
  const contentId = request.nextUrl.searchParams.get('id')
  const kind = request.nextUrl.searchParams.get('kind')
  if (!type || !contentTypes.has(type) || !contentId || !isUuid(contentId) || !['likes', 'reposts'].includes(kind ?? '')) return NextResponse.json({ error: 'invalid_reaction_query' }, { status: 400 })
  const viewer = await getCurrentUser()
  try {
    const common = {
      userId: disloopUsers.id,
      name: disloopUsers.displayName,
      username: disloopUsers.usernameDisplay,
      avatarUrl: disloopUsers.avatarUrl,
      accountCreatedAt: disloopUsers.createdAt,
      nameStyle: disloopUserFlair.nameStyle,
      customTitle: disloopUserFlair.customTitle,
      hideLikes: disloopUsers.hideLikes,
      followsViewer: sql<boolean>`exists (select 1 from ${disloopFollows} f where f.follower_id = ${viewer?.id ?? null} and f.followed_id = ${disloopUsers.id})`,
    }
    const rows = kind === 'reposts'
      ? await db.select({ ...common, createdAt: disloopReposts.createdAt }).from(disloopReposts)
          .innerJoin(disloopUsers, eq(disloopReposts.userId, disloopUsers.id))
          .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
          .where(and(eq(disloopReposts.contentType, type), eq(disloopReposts.contentId, contentId)))
          .orderBy(desc(sql`exists (select 1 from ${disloopFollows} f where f.follower_id = ${viewer?.id ?? null} and f.followed_id = ${disloopUsers.id})`), desc(disloopReposts.createdAt)).limit(100)
      : type === 'reel'
        ? await db.select({ ...common, createdAt: disloopReelLikes.createdAt }).from(disloopReelLikes)
            .innerJoin(disloopUsers, eq(disloopReelLikes.userId, disloopUsers.id))
            .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
            .where(and(eq(disloopReelLikes.reelId, contentId), sql`${disloopUsers.hideLikes} = false OR ${disloopUsers.id} = ${viewer?.id ?? null}`))
            .orderBy(desc(sql`exists (select 1 from ${disloopFollows} f where f.follower_id = ${viewer?.id ?? null} and f.followed_id = ${disloopUsers.id})`), desc(disloopReelLikes.createdAt)).limit(100)
        : await db.select({ ...common, createdAt: disloopLikes.createdAt }).from(disloopLikes)
            .innerJoin(disloopUsers, eq(disloopLikes.userId, disloopUsers.id))
            .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
            .where(and(eq(disloopLikes.contentType, type), eq(disloopLikes.contentId, contentId), sql`${disloopUsers.hideLikes} = false OR ${disloopUsers.id} = ${viewer?.id ?? null}`))
            .orderBy(desc(sql`exists (select 1 from ${disloopFollows} f where f.follower_id = ${viewer?.id ?? null} and f.followed_id = ${disloopUsers.id})`), desc(disloopLikes.createdAt)).limit(100)
    return NextResponse.json({ reactions: rows.map((row) => ({ ...row, isNewAccount: isNewAccount(row.accountCreatedAt), createdAt: row.createdAt.toISOString() })) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('reaction_list_failed', error, 'GET /api/social/reactions'), { status: 500 })
  }
}
