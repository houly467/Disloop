ALTER TABLE public.disloop_users
  ADD COLUMN IF NOT EXISTS status_line varchar(60),
  ADD COLUMN IF NOT EXISTS name_color varchar(7),
  ADD COLUMN IF NOT EXISTS is_staff_role varchar(16),
  ADD COLUMN IF NOT EXISTS hide_likes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_visit_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_name_color boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_badges boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE public.disloop_news_posts
  ADD COLUMN IF NOT EXISTS accent_color varchar(7),
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_comment_id uuid;
--> statement-breakpoint

ALTER TABLE public.disloop_reels
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE public.disloop_daily_posts
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE public.disloop_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE public.disloop_notifications
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_user_badges (
  user_id uuid NOT NULL,
  badge_id varchar(48) NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  is_equipped boolean NOT NULL DEFAULT false,
  counter integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_active_date varchar(10),
  PRIMARY KEY (user_id, badge_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_top_scores (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  author_id uuid NOT NULL,
  score double precision NOT NULL,
  rank integer NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_top_maker_awards (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  award_date varchar(10) NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id, award_date)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_profile_visits (
  profile_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  visit_date varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, visitor_id, visit_date)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_user_activity (
  user_id uuid NOT NULL,
  activity_date varchar(10) NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.disloop_rate_limits (
  bucket_key varchar(160) NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS disloop_users_username_lower_unique
  ON public.disloop_users (lower(username_lower));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_news_created_at_idx
  ON public.disloop_news_posts (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_news_visible_created_idx
  ON public.disloop_news_posts (pinned DESC, created_at DESC)
  WHERE is_hidden = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_news_tags_gin_idx
  ON public.disloop_news_posts USING gin (tags);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_reels_visible_created_idx
  ON public.disloop_reels (created_at)
  WHERE is_hidden = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_reels_visible_created_id_idx
  ON public.disloop_reels (created_at DESC, id DESC)
  WHERE is_hidden = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_reels_tags_gin_idx
  ON public.disloop_reels USING gin (tags);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_stories_expiry_idx
  ON public.disloop_stories (expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_daily_posts_visible_created_idx
  ON public.disloop_daily_posts (created_at, id)
  WHERE is_hidden = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_daily_posts_tags_gin_idx
  ON public.disloop_daily_posts USING gin (tags);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_xp_events_user_created_idx
  ON public.disloop_xp_events (user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS disloop_dm_conversations_unique_pair
  ON public.disloop_dm_conversations (user_a, user_b);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_dm_messages_conversation_created_idx
  ON public.disloop_dm_messages (conversation_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_comments_content_created_idx
  ON public.disloop_comments (content_type, content_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_comments_thread_created_idx
  ON public.disloop_comments (thread_root_id, created_at, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS disloop_reposts_unique
  ON public.disloop_reposts (user_id, content_type, content_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_reposts_user_created_idx
  ON public.disloop_reposts (user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS disloop_groups_tag_unique
  ON public.disloop_groups (tag);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS disloop_group_invites_group_invitee_unique
  ON public.disloop_group_invites (group_id, invitee_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_group_messages_group_created_idx
  ON public.disloop_group_messages (group_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_chat_reactions_message_idx
  ON public.disloop_chat_reactions (chat_type, message_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_notifications_recipient_created_idx
  ON public.disloop_notifications (recipient_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_notifications_unread_idx
  ON public.disloop_notifications (recipient_id, created_at)
  WHERE read_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.disloop_likes (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_likes_content_created_idx
  ON public.disloop_likes (content_type, content_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_likes_user_created_idx
  ON public.disloop_likes (user_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_user_badges_equipped_idx
  ON public.disloop_user_badges (user_id, is_equipped);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_top_scores_rank_idx
  ON public.disloop_top_scores (rank, score);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_top_scores_author_idx
  ON public.disloop_top_scores (author_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_top_maker_user_idx
  ON public.disloop_top_maker_awards (user_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_profile_visits_profile_date_idx
  ON public.disloop_profile_visits (profile_id, visit_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disloop_user_activity_date_idx
  ON public.disloop_user_activity (activity_date);
