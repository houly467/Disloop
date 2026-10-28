import { and, arrayContains, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopDailyPosts, disloopNewsPosts, disloopReels, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { getDailyPostsByTag } from '@/lib/daily'
import { getNewsPostsByTag } from '@/lib/news'
import { getReels } from '@/lib/reels'
import { filterReelsWithExistingMedia } from '@/lib/reel-media'
import { isNewAccount } from '@/lib/new-account'

export async function searchCommunity(rawQuery: string) {
  const query = rawQuery.trim().slice(0, 100)
  if (!query) return { members: [], posts: [], dailyPosts: [], reels: [], hashtags: [] }
  const term = query.replace(/^[@#]/, '')
  if (!term) return { members: [], posts: [], dailyPosts: [], reels: [], hashtags: [] }
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  const [members, posts, dailyPosts, reels, hashtags] = await Promise.all([
    db.select({ id: disloopUsers.id, username: disloopUsers.usernameDisplay, displayName: disloopUsers.displayName, avatarUrl: disloopUsers.avatarUrl, accountCreatedAt: disloopUsers.createdAt, nameStyle: disloopUserFlair.nameStyle, customTitle: disloopUserFlair.customTitle })
      .from(disloopUsers).leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id)).where(and(eq(disloopUsers.isSeed, false), or(ilike(disloopUsers.usernameDisplay, pattern), ilike(disloopUsers.displayName, pattern), ilike(disloopUsers.discordUsername, pattern))))
      .orderBy(desc(disloopUsers.xp)).limit(12),
    db.select({ id: disloopNewsPosts.id, title: disloopNewsPosts.title, body: disloopNewsPosts.body, tags: disloopNewsPosts.tags, createdAt: disloopNewsPosts.createdAt })
      .from(disloopNewsPosts).where(and(eq(disloopNewsPosts.isHidden, false), or(ilike(disloopNewsPosts.title, pattern), ilike(disloopNewsPosts.body, pattern), arrayContains(disloopNewsPosts.tags, [term.toLowerCase()]))))
      .orderBy(desc(disloopNewsPosts.createdAt)).limit(12),
    db.select({ id: disloopDailyPosts.id, body: disloopDailyPosts.body, tags: disloopDailyPosts.tags, createdAt: disloopDailyPosts.createdAt })
      .from(disloopDailyPosts).where(and(eq(disloopDailyPosts.isHidden, false), or(ilike(disloopDailyPosts.body, pattern), arrayContains(disloopDailyPosts.tags, [term.toLowerCase()]))))
      .orderBy(desc(disloopDailyPosts.createdAt)).limit(12),
    db.select({ id: disloopReels.id, caption: disloopReels.caption, tags: disloopReels.tags, videoUrl: disloopReels.videoUrl, authorId: disloopUsers.id, authorName: disloopUsers.displayName, authorUsername: disloopUsers.usernameDisplay, authorCreatedAt: disloopUsers.createdAt, authorNameStyle: disloopUserFlair.nameStyle, authorCustomTitle: disloopUserFlair.customTitle, createdAt: disloopReels.createdAt })
      .from(disloopReels).leftJoin(disloopUsers, eq(disloopReels.authorId, disloopUsers.id)).leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id)).where(and(eq(disloopReels.isHidden, false), or(ilike(disloopReels.caption, pattern), arrayContains(disloopReels.tags, [term.toLowerCase()]))))
      .orderBy(desc(disloopReels.createdAt)).limit(12),
    db.select({ tag: sql<string>`distinct unnest(tags)` }).from(disloopNewsPosts)
      .where(and(eq(disloopNewsPosts.isHidden, false), sql`exists (select 1 from unnest(${disloopNewsPosts.tags}) t where t ilike ${pattern})`)).limit(12),
  ])
  const availableReels = await filterReelsWithExistingMedia(reels)
  const uniqueTags = [...new Set([...hashtags.map((row) => row.tag), ...posts.flatMap((post) => post.tags), ...dailyPosts.flatMap((post) => post.tags), ...availableReels.flatMap((reel) => reel.tags)])]
    .filter((tag) => tag.toLocaleLowerCase().includes(term.toLocaleLowerCase())).slice(0, 12)

  return {
    members: members.map((member) => ({ ...member, isNewAccount: isNewAccount(member.accountCreatedAt) })),
    posts: posts.map((post) => ({ ...post, createdAt: post.createdAt.toISOString() })),
    dailyPosts: dailyPosts.map((post) => ({ ...post, createdAt: post.createdAt.toISOString() })),
    reels: availableReels.map((reel) => ({ ...reel, authorIsNewAccount: isNewAccount(reel.authorCreatedAt), createdAt: reel.createdAt.toISOString() })),
    hashtags: uniqueTags,
  }
}

export async function getTagContent(tag: string, viewerId?: string) {
  const [posts, reels, dailyPosts] = await Promise.all([getNewsPostsByTag(tag), getReels(viewerId, tag), getDailyPostsByTag(tag)])
  return { posts, reels, dailyPosts }
}
