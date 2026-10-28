import { and, arrayContains, desc, eq, exists, not, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isNewAccount } from '@/lib/new-account'
import { disloopReelLikes, disloopReels, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { shuffleReels } from '@/lib/reel-feed-order'
import { filterReelsWithExistingMedia } from '@/lib/reel-media'

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
  authorIsNewAccount: boolean
  likeCount: number
  likedByMe: boolean
  authorNameStyle: string | null
  authorCustomTitle: string | null
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
  authorNameStyle: disloopUserFlair.nameStyle,
  authorCustomTitle: disloopUserFlair.customTitle,
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
  authorNameStyle: string | null
  authorCustomTitle: string | null
}): CommunityReel {
  return {
    ...reel,
    createdAt: reel.createdAt.toISOString(),
    authorCreatedAt: reel.authorCreatedAt?.toISOString() ?? null,
    authorIsNewAccount: isNewAccount(reel.authorCreatedAt),
    authorName: reel.authorName ?? 'Disloop Community',
    authorUsername: reel.authorUsername ?? 'community-team',
  }
}

export async function getReels(
  viewerId?: string,
  tag?: string,
  authorId?: string,
  options: { likedOnly?: boolean; excludeLiked?: boolean; shuffle?: boolean; excludeReelIds?: string[] } = {},
) {
  const filters = [eq(disloopReels.isHidden, false)]
  if (tag) filters.push(arrayContains(disloopReels.tags, [tag]))
  if (authorId) filters.push(eq(disloopReels.authorId, authorId))
  if (options.excludeReelIds?.length) filters.push(notInArray(disloopReels.id, options.excludeReelIds))
  if (viewerId && options.likedOnly) {
    filters.push(exists(db.select({ one: sql`1` }).from(disloopReelLikes)
      .where(and(eq(disloopReelLikes.reelId, disloopReels.id), eq(disloopReelLikes.userId, viewerId)))))
  } else if (viewerId && options.excludeLiked !== false && !authorId) {
    filters.push(not(exists(db.select({ one: sql`1` }).from(disloopReelLikes)
      .where(and(eq(disloopReelLikes.reelId, disloopReels.id), eq(disloopReelLikes.userId, viewerId))))))
  }

  const rows = await db
    .select(reelFields(viewerId))
    .from(disloopReels)
    .leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id))
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(and(...filters))
    .orderBy(desc(disloopReels.createdAt))
    .limit(100)
  const availableRows = await filterReelsWithExistingMedia(rows)
  const orderedRows = options.shuffle ? shuffleReels(availableRows).slice(0, 30) : availableRows.slice(0, 30)
  return orderedRows.map(serializeReel)
}
