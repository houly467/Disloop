import { and, arrayContains, desc, eq, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopUsers } from '@/lib/db/schema'

export type DailyPost = {
  id: string
  authorId: string
  body: string
  mediaUrl: string | null
  tags: string[]
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  authorCreatedAt: string | null
}

export async function getDailyPostsByTag(tag: string) {
  const rows = await db.select({
    id: disloopDailyPosts.id,
    authorId: disloopDailyPosts.authorId,
    body: disloopDailyPosts.body,
    mediaUrl: disloopDailyPosts.mediaUrl,
    tags: disloopDailyPosts.tags,
    createdAt: disloopDailyPosts.createdAt,
    authorName: disloopUsers.displayName,
    authorUsername: disloopUsers.usernameDisplay,
    authorAvatar: disloopUsers.avatarUrl,
    authorCreatedAt: disloopUsers.createdAt,
  }).from(disloopDailyPosts)
    .leftJoin(disloopUsers, eq(disloopDailyPosts.authorId, disloopUsers.id))
    .where(and(arrayContains(disloopDailyPosts.tags, [tag]), eq(disloopDailyPosts.isHidden, false)))
    .orderBy(desc(disloopDailyPosts.createdAt), desc(disloopDailyPosts.id))
    .limit(30)
  return rows.map((post) => ({
    ...post,
    createdAt: post.createdAt.toISOString(),
    authorCreatedAt: post.authorCreatedAt?.toISOString() ?? null,
    authorName: post.authorName ?? 'Community member',
    authorUsername: post.authorUsername ?? 'community-member',
  }))
}

export async function getDailyPosts(before?: { createdAt: Date; id: string }) {
  const conditions = [eq(disloopDailyPosts.isHidden, false)]
  if (before) conditions.push(or(lt(disloopDailyPosts.createdAt, before.createdAt), and(eq(disloopDailyPosts.createdAt, before.createdAt), lt(disloopDailyPosts.id, before.id)))!)
  const rows = await db.select({
    id: disloopDailyPosts.id,
    authorId: disloopDailyPosts.authorId,
    body: disloopDailyPosts.body,
    mediaUrl: disloopDailyPosts.mediaUrl,
    tags: disloopDailyPosts.tags,
    createdAt: disloopDailyPosts.createdAt,
    authorName: disloopUsers.displayName,
    authorUsername: disloopUsers.usernameDisplay,
    authorAvatar: disloopUsers.avatarUrl,
    authorCreatedAt: disloopUsers.createdAt,
  }).from(disloopDailyPosts)
    .leftJoin(disloopUsers, eq(disloopDailyPosts.authorId, disloopUsers.id))
    .where(and(...conditions))
    .orderBy(desc(disloopDailyPosts.createdAt), desc(disloopDailyPosts.id))
    .limit(31)
  const page = rows.slice(0, 30)
  return {
    posts: page.map((post) => ({
      ...post,
      createdAt: post.createdAt.toISOString(),
      authorCreatedAt: post.authorCreatedAt?.toISOString() ?? null,
      authorName: post.authorName ?? 'Community member',
      authorUsername: post.authorUsername ?? 'community-member',
    } satisfies DailyPost)),
    nextCursor: rows.length > 30 && page.at(-1)
      ? Buffer.from(JSON.stringify({ createdAt: page.at(-1)!.createdAt.toISOString(), id: page.at(-1)!.id })).toString('base64url')
      : null,
  }
}
