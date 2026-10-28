import { apiFailurePayload } from '@/lib/api-errors'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { topRankedContent } from '@/lib/top-ranking'
import { isNewAccount } from '@/lib/new-account'
import { filterReelsWithExistingMedia } from '@/lib/reel-media'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await db.execute(sql`
      ${topRankedContent}
      SELECT r.content_type AS type, r.content_id AS id, r.rank, r.score,
        coalesce(n.title, reel.caption, daily.body, '') AS title,
        coalesce(n.body, daily.body, reel.caption, '') AS body,
        coalesce(n.cover_url, reel.video_url, daily.media_url) AS media_url,
        coalesce(n.created_at, reel.created_at, daily.created_at) AS created_at,
        coalesce(u.display_name, 'Disloop Community') AS author_name,
        coalesce(u.username_display, 'community-team') AS author_username,
        u.avatar_url AS author_avatar,
        u.id AS author_id,
        u.created_at AS author_created_at,
        f.name_style AS author_name_style,
        f.custom_title AS author_custom_title
      FROM ranked r
      LEFT JOIN disloop_news_posts n ON r.content_type = 'news' AND n.id = r.content_id AND n.is_hidden = false
      LEFT JOIN disloop_reels reel ON r.content_type = 'reel' AND reel.id = r.content_id AND reel.is_hidden = false
      LEFT JOIN disloop_daily_posts daily ON r.content_type = 'daily' AND daily.id = r.content_id AND daily.is_hidden = false
      LEFT JOIN disloop_users u ON u.id = r.author_id
      LEFT JOIN disloop_user_flair f ON f.user_id = u.id
      WHERE r.rank <= 100 AND (n.id IS NOT NULL OR reel.id IS NOT NULL OR daily.id IS NOT NULL)
      ORDER BY r.rank ASC LIMIT 100
    `)
    const posts = result.rows.map((row) => {
      const item = row as Record<string, unknown>
      return {
        type: item.type,
        id: item.id,
        rank: Number(item.rank),
        score: Number(item.score),
        title: String(item.title ?? ''),
        body: String(item.body ?? ''),
        mediaUrl: item.media_url ? String(item.media_url) : null,
        createdAt: item.created_at instanceof Date ? item.created_at.toISOString() : String(item.created_at ?? ''),
        authorName: String(item.author_name),
        authorUsername: String(item.author_username),
        authorAvatar: item.author_avatar ? String(item.author_avatar) : null,
        authorId: item.author_id ? String(item.author_id) : null,
        authorIsNewAccount: isNewAccount(item.author_created_at instanceof Date ? item.author_created_at : String(item.author_created_at ?? '')),
        authorNameStyle: item.author_name_style ? String(item.author_name_style) : null,
        authorCustomTitle: item.author_custom_title ? String(item.author_custom_title) : null,
      }
    })
    const topReels = posts
      .filter((post) => post.type === 'reel' && post.mediaUrl)
      .map((post) => ({ id: String(post.id), videoUrl: String(post.mediaUrl) }))
    const availableTopReelIds = new Set((await filterReelsWithExistingMedia(topReels)).map((reel) => reel.id))
    const availablePosts = posts.filter((post) => post.type !== 'reel' || availableTopReelIds.has(String(post.id)))
    return NextResponse.json({ posts: availablePosts }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('top_unavailable', error, 'GET /api/top'), { status: 500 })
  }
}
