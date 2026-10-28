import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { disloopBlocks, disloopCloseFriends, disloopStoryVisibility } from '@/lib/db/schema'
import { safeApiFailureReason } from '@/lib/api-errors'

export async function visibleStories<T extends { id: string; authorId: string }>(stories: T[], viewerId: string | null) {
  if (!stories.length) return stories.map((story) => ({ ...story, closeFriendsOnly: false }))
  let visibility: { storyId: string; authorId: string; closeFriendsOnly: boolean }[]
  try {
    visibility = await db.select({
      storyId: disloopStoryVisibility.storyId,
      authorId: disloopStoryVisibility.authorId,
      closeFriendsOnly: disloopStoryVisibility.closeFriendsOnly,
    }).from(disloopStoryVisibility)
      .where(inArray(disloopStoryVisibility.storyId, stories.map((story) => story.id)))
  } catch (error) {
    if (safeApiFailureReason(error) === 'missing_table') return stories.map((story) => ({ ...story, closeFriendsOnly: false }))
    console.error('[close-friends] visibility table unavailable; hiding stories', { error })
    return []
  }
  const privateStories = new Map(visibility.filter((item) => item.closeFriendsOnly).map((item) => [item.storyId, item.authorId]))
  if (!viewerId || !privateStories.size) {
    return stories.filter((story) => !privateStories.has(story.id)).map((story) => ({ ...story, closeFriendsOnly: false }))
  }
  try {
    const authorIds = [...new Set([...privateStories.values()].filter((id) => id !== viewerId))]
    const [friendshipRows, blockRows] = authorIds.length ? await Promise.all([db.select({
      ownerId: disloopCloseFriends.ownerId,
      friendId: disloopCloseFriends.friendId,
    }).from(disloopCloseFriends).where(and(
      inArray(disloopCloseFriends.ownerId, authorIds),
      eq(disloopCloseFriends.friendId, viewerId),
    )), db.select({
      blockerId: disloopBlocks.blockerId,
      blockedId: disloopBlocks.blockedId,
    }).from(disloopBlocks).where(or(
      and(eq(disloopBlocks.blockedId, viewerId), inArray(disloopBlocks.blockerId, authorIds)),
      and(eq(disloopBlocks.blockerId, viewerId), inArray(disloopBlocks.blockedId, authorIds)),
    ))]) : [[], []]
    const blockedAuthors = new Set(blockRows.flatMap((row) => [row.blockerId, row.blockedId].filter((id) => id !== viewerId)))
    const allowedAuthors = new Set([viewerId, ...friendshipRows.map((row) => row.ownerId).filter((id) => !blockedAuthors.has(id))])
    return stories.filter((story) => {
      const authorId = privateStories.get(story.id)
      return !authorId || allowedAuthors.has(authorId)
    }).map((story) => ({ ...story, closeFriendsOnly: privateStories.has(story.id) }))
  } catch (error) {
    console.error('[close-friends] friendship lookup failed; hiding private stories', { error })
    return stories.filter((story) => !privateStories.has(story.id)).map((story) => ({ ...story, closeFriendsOnly: false }))
  }
}
