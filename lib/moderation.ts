import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopNewsPosts, disloopReels, disloopUsers } from '@/lib/db/schema'
import type { ModerationItem } from '@/components/community-sections'

export async function getModerationQueue(): Promise<ModerationItem[]> {
  const [posts, reels, dailyPosts] = await Promise.all([
    db.select({ id: disloopNewsPosts.id, title: disloopNewsPosts.title, body: disloopNewsPosts.body, authorName: disloopUsers.displayName, createdAt: disloopNewsPosts.createdAt, isHidden: disloopNewsPosts.isHidden })
      .from(disloopNewsPosts).leftJoin(disloopUsers, eq(disloopNewsPosts.authorId, disloopUsers.id)).orderBy(desc(disloopNewsPosts.createdAt)).limit(30),
    db.select({ id: disloopReels.id, title: disloopReels.caption, videoUrl: disloopReels.videoUrl, authorName: disloopUsers.displayName, createdAt: disloopReels.createdAt, isHidden: disloopReels.isHidden })
      .from(disloopReels).leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id)).orderBy(desc(disloopReels.createdAt)).limit(30),
    db.select({ id: disloopDailyPosts.id, title: disloopDailyPosts.body, body: disloopDailyPosts.body, authorName: disloopUsers.displayName, createdAt: disloopDailyPosts.createdAt, isHidden: disloopDailyPosts.isHidden })
      .from(disloopDailyPosts).leftJoin(disloopUsers, eq(disloopDailyPosts.authorId, disloopUsers.id)).orderBy(desc(disloopDailyPosts.createdAt)).limit(30),
  ])

  return [
    ...posts.map((post) => ({ ...post, kind: 'news' as const, authorName: post.authorName ?? 'Community member', body: post.body, createdAt: post.createdAt.toISOString() })),
    ...reels.map((reel) => ({ ...reel, kind: 'reel' as const, authorName: reel.authorName ?? 'Community member', body: reel.videoUrl, createdAt: reel.createdAt.toISOString() })),
    ...dailyPosts.map((post) => ({ ...post, kind: 'daily' as const, authorName: post.authorName ?? 'Community member', createdAt: post.createdAt.toISOString() })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 40)
}
