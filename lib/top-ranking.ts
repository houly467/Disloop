import { sql } from 'drizzle-orm'

export const topRankedContent = sql`
  WITH content AS (
    SELECT 'news'::varchar AS content_type, id AS content_id, author_id, created_at
    FROM disloop_news_posts WHERE is_hidden = false AND created_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'reel'::varchar, id, author_id, created_at
    FROM disloop_reels WHERE is_hidden = false AND created_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'daily'::varchar, id, author_id, created_at
    FROM disloop_daily_posts WHERE is_hidden = false AND created_at >= now() - interval '24 hours'
  ), actions AS (
    SELECT l.content_type, l.content_id, l.user_id, l.created_at, 'like'::varchar AS action_type
    FROM disloop_likes l JOIN content c USING (content_type, content_id)
    WHERE l.created_at >= now() - interval '24 hours' AND l.user_id <> c.author_id
    UNION ALL
    SELECT 'reel'::varchar, l.reel_id, l.user_id, l.created_at, 'like'::varchar
    FROM disloop_reel_likes l JOIN content c ON c.content_type = 'reel' AND c.content_id = l.reel_id
    WHERE l.created_at >= now() - interval '24 hours' AND l.user_id <> c.author_id
    UNION ALL
    SELECT cm.content_type, cm.content_id, cm.author_id, cm.created_at, 'comment'::varchar
    FROM disloop_comments cm JOIN content c USING (content_type, content_id)
    WHERE cm.created_at >= now() - interval '24 hours' AND cm.is_hidden = false AND cm.author_id <> c.author_id
    UNION ALL
    SELECT rp.content_type, rp.content_id, rp.user_id, rp.created_at, 'repost'::varchar
    FROM disloop_reposts rp JOIN content c USING (content_type, content_id)
    WHERE rp.created_at >= now() - interval '24 hours' AND rp.user_id <> c.author_id
  ), unique_actions AS (
    SELECT a.content_type, a.content_id, a.user_id, a.action_type,
      max(power(0.5, extract(epoch FROM (now() - a.created_at)) / 21600.0)) AS decay
    FROM actions a GROUP BY a.content_type, a.content_id, a.user_id, a.action_type
  ), scored AS (
    SELECT c.content_type, c.content_id, c.author_id,
      coalesce(sum(ua.decay * CASE ua.action_type WHEN 'like' THEN 1 WHEN 'comment' THEN 2 ELSE 3 END), 0)::double precision AS score
    FROM content c LEFT JOIN unique_actions ua USING (content_type, content_id)
    GROUP BY c.content_type, c.content_id, c.author_id
  ), ranked AS (
    SELECT *, row_number() OVER (ORDER BY score DESC, content_type, content_id) AS rank FROM scored
  )
`

export const awardTopMakers = sql`
  WITH new_awards AS (
    INSERT INTO disloop_top_maker_awards (content_type, content_id, award_date, user_id)
    SELECT content_type, content_id, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), author_id
    FROM (
      ${topRankedContent}
      SELECT content_type, content_id, author_id FROM ranked WHERE rank <= 3
    ) daily_top
    ON CONFLICT DO NOTHING
    RETURNING user_id
  ), increments AS (
    SELECT user_id, count(*)::int AS amount FROM new_awards GROUP BY user_id
  )
  INSERT INTO disloop_user_badges (user_id, badge_id, counter)
  SELECT user_id, 'top-maker', amount FROM increments
  ON CONFLICT (user_id, badge_id) DO UPDATE SET counter = disloop_user_badges.counter + excluded.counter
`
