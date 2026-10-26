ALTER TABLE disloop_users
  ADD COLUMN IF NOT EXISTS status_line varchar(60),
  ADD COLUMN IF NOT EXISTS name_color varchar(7),
  ADD COLUMN IF NOT EXISTS is_staff_role varchar(16),
  ADD COLUMN IF NOT EXISTS hide_likes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_visit_count boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_name_color boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_badges boolean NOT NULL DEFAULT true;

ALTER TABLE disloop_news_posts
  ADD COLUMN IF NOT EXISTS accent_color varchar(7),
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_comment_id uuid;

ALTER TABLE disloop_reels
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false;

ALTER TABLE disloop_daily_posts
  ADD COLUMN IF NOT EXISTS replies_from_following boolean NOT NULL DEFAULT false;

ALTER TABLE disloop_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE disloop_notifications
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

CREATE TABLE IF NOT EXISTS disloop_likes (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id, user_id)
);
CREATE INDEX IF NOT EXISTS disloop_likes_content_created_idx ON disloop_likes(content_type, content_id, created_at);
CREATE INDEX IF NOT EXISTS disloop_likes_user_created_idx ON disloop_likes(user_id, created_at);

CREATE TABLE IF NOT EXISTS disloop_user_badges (
  user_id uuid NOT NULL,
  badge_id varchar(48) NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  is_equipped boolean NOT NULL DEFAULT false,
  counter integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_active_date varchar(10),
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS disloop_user_badges_equipped_idx ON disloop_user_badges(user_id, is_equipped);

CREATE TABLE IF NOT EXISTS disloop_top_scores (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  author_id uuid NOT NULL,
  score double precision NOT NULL,
  rank integer NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS disloop_top_scores_rank_idx ON disloop_top_scores(rank, score DESC);
CREATE INDEX IF NOT EXISTS disloop_top_scores_author_idx ON disloop_top_scores(author_id);

CREATE TABLE IF NOT EXISTS disloop_top_maker_awards (
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  award_date varchar(10) NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id, award_date)
);
CREATE INDEX IF NOT EXISTS disloop_top_maker_user_idx ON disloop_top_maker_awards(user_id, created_at);

CREATE TABLE IF NOT EXISTS disloop_profile_visits (
  profile_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  visit_date varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, visitor_id, visit_date)
);
CREATE INDEX IF NOT EXISTS disloop_profile_visits_profile_date_idx ON disloop_profile_visits(profile_id, visit_date);

CREATE TABLE IF NOT EXISTS disloop_user_activity (
  user_id uuid NOT NULL,
  activity_date varchar(10) NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);
CREATE INDEX IF NOT EXISTS disloop_user_activity_date_idx ON disloop_user_activity(activity_date);

CREATE TABLE IF NOT EXISTS disloop_rate_limits (
  bucket_key varchar(160) NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS disloop_comments_content_pinned_idx ON disloop_comments(content_type, content_id, is_pinned, created_at) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS disloop_notifications_visible_idx ON disloop_notifications(recipient_id, created_at DESC) WHERE dismissed_at IS NULL;
