import { and, arrayContains, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopReelLikes, disloopReels, disloopUsers } from '@/lib/db/schema'

export type CommunityReel = {
  id: string
  authorId: string
  videoUrl: string
  caption: string
  tags: string[]
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  authorCreatedAt: string | null
  likeCount: number
  likedByMe: boolean
}

const reelFields = (viewerId?: string) => ({
  id: disloopReels.id,
  authorId: disloopReels.authorId,
  videoUrl: disloopReels.videoUrl,
  caption: disloopReels.caption,
  tags: disloopReels.tags,
  createdAt: disloopReels.createdAt,
  authorName: disloopUsers.displayName,
  authorUsername: disloopUsers.usernameDisplay,
  authorAvatar: disloopUsers.avatarUrl,
  authorCreatedAt: disloopUsers.createdAt,
  likeCount: sql<number>`(select count(*)::int from ${disloopReelLikes} where ${disloopReelLikes.reelId} = ${disloopReels.id})`,
  likedByMe: viewerId
    ? sql<boolean>`exists (select 1 from ${disloopReelLikes} where ${disloopReelLikes.reelId} = ${disloopReels.id} and ${disloopReelLikes.userId} = ${viewerId})`
    : sql<boolean>`false`,
})

function serializeReel(reel: ReturnType<typeof reelFields> extends never ? never : {
  id: string
  authorId: string
  videoUrl: string
  caption: string
  tags: string[]
  createdAt: Date
  authorName: string | null
  authorUsername: string | null
  authorAvatar: string | null
  authorCreatedAt: Date | null
  likeCount: number
  likedByMe: boolean
}): CommunityReel {
  return {
    ...reel,
    createdAt: reel.createdAt.toISOString(),
    authorCreatedAt: reel.authorCreatedAt?.toISOString() ?? null,
    authorName: reel.authorName ?? 'Disloop Community',
    authorUsername: reel.authorUsername ?? 'community-team',
  }
}

export async function getReels(viewerId?: string, tag?: string, authorId?: string) {
  const filters = [eq(disloopReels.isHidden, false)]
  if (tag) filters.push(arrayContains(disloopReels.tags, [tag]))
  if (authorId) filters.push(eq(disloopReels.authorId, authorId))

  const rows = await db
    .select(reelFields(viewerId))
    .from(disloopReels)
    .leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id))
    .where(and(...filters))
    .orderBy(desc(disloopReels.createdAt))
    .limit(30)
  return rows.map(serializeReel)
}
