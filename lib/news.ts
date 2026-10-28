import { and, arrayContains, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopNewsPosts, disloopProfilePins, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { safeApiFailureReason } from '@/lib/api-errors'

export type NewsPost = {
  id: string
  authorId: string
  title: string
  body: string
  category: string
  coverUrl: string | null
  accentColor: string | null
  tags: string[]
  pinned: boolean
  isHidden: boolean
  isSeed: boolean
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  authorCreatedAt: string | null
  authorNameStyle: string | null
  authorCustomTitle: string | null
}

const postFields = {
  id: disloopNewsPosts.id,
  authorId: disloopNewsPosts.authorId,
  title: disloopNewsPosts.title,
  body: disloopNewsPosts.body,
  category: disloopNewsPosts.category,
  coverUrl: disloopNewsPosts.coverUrl,
  // Row JSON keeps previews readable before the accent_color backfill is applied.
  accentColor: sql<string | null>`to_jsonb(${disloopNewsPosts})->>'accent_color'`,
  tags: disloopNewsPosts.tags,
  pinned: disloopNewsPosts.pinned,
  isHidden: disloopNewsPosts.isHidden,
  isSeed: disloopNewsPosts.isSeed,
  createdAt: disloopNewsPosts.createdAt,
  authorName: disloopUsers.displayName,
  authorUsername: disloopUsers.usernameDisplay,
  authorAvatar: disloopUsers.avatarUrl,
  authorCreatedAt: disloopUsers.createdAt,
  authorNameStyle: disloopUserFlair.nameStyle,
  authorCustomTitle: disloopUserFlair.customTitle,
}

function serializePost(post: {
  id: string
  authorId: string
  title: string
  body: string
  category: string
  coverUrl: string | null
  accentColor: string | null
  tags: string[]
  pinned: boolean
  isHidden: boolean
  isSeed: boolean
  createdAt: Date
  authorName: string | null
  authorUsername: string | null
  authorAvatar: string | null
  authorCreatedAt: Date | null
  authorNameStyle: string | null
  authorCustomTitle: string | null
}): NewsPost {
  return {
    ...post,
    createdAt: post.createdAt.toISOString(),
    authorCreatedAt: post.authorCreatedAt?.toISOString() ?? null,
    authorName: post.authorName ?? 'Disloop Community',
    authorUsername: post.authorUsername ?? 'community-team',
  }
}

export async function getNewsPosts() {
  const rows = await db
    .select(postFields)
    .from(disloopNewsPosts)
    .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(eq(disloopNewsPosts.isHidden, false))
    .orderBy(desc(disloopNewsPosts.pinned), desc(disloopNewsPosts.createdAt))
    .limit(30)
  return rows.map(serializePost)
}

export async function getNewsPostById(id: string) {
  const [post] = await db
    .select(postFields)
    .from(disloopNewsPosts)
    .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(eq(disloopNewsPosts.id, id))
    .limit(1)
  return post ? serializePost(post) : null
}

export async function getNewsPostsByAuthor(authorId: string) {
  try {
    const rows = await db
      .select(postFields)
      .from(disloopNewsPosts)
      .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .leftJoin(disloopProfilePins, and(eq(disloopProfilePins.userId, authorId), eq(disloopProfilePins.postId, disloopNewsPosts.id)))
      .where(and(eq(disloopNewsPosts.authorId, authorId), eq(disloopNewsPosts.isHidden, false)))
      .orderBy(desc(sql`(${disloopProfilePins.postId} is not null)`), desc(disloopNewsPosts.createdAt))
      .limit(30)
    return rows.map(serializePost)
  } catch (error) {
    if (safeApiFailureReason(error) !== 'missing_table') throw error
    console.warn('[news] profile pins unavailable; using regular post ordering')
    const rows = await db
      .select(postFields)
      .from(disloopNewsPosts)
      .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
      .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
      .where(and(eq(disloopNewsPosts.authorId, authorId), eq(disloopNewsPosts.isHidden, false)))
      .orderBy(desc(disloopNewsPosts.createdAt))
      .limit(30)
    return rows.map(serializePost)
  }
}

export async function getNewsPostsByTag(tag: string) {
  const rows = await db
    .select(postFields)
    .from(disloopNewsPosts)
    .leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id))
    .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
    .where(and(arrayContains(disloopNewsPosts.tags, [tag]), eq(disloopNewsPosts.isHidden, false)))
    .orderBy(desc(disloopNewsPosts.createdAt))
    .limit(30)
  return rows.map(serializePost)
}

export async function refreshNewsMembership(userId: string, isMember: boolean) {
  await db
    .update(disloopUsers)
    .set({ isMember, updatedAt: new Date() })
    .where(and(eq(disloopUsers.id, userId), eq(disloopUsers.isSeed, false)))
}
