CREATE TABLE IF NOT EXISTS disloop_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  author_id uuid NOT NULL,
  options jsonb NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS disloop_polls_content_unique
  ON disloop_polls (content_type, content_id);
CREATE INDEX IF NOT EXISTS disloop_polls_author_created_idx
  ON disloop_polls (author_id, created_at);

CREATE TABLE IF NOT EXISTS disloop_poll_votes (
  poll_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS disloop_poll_votes_poll_idx
  ON disloop_poll_votes (poll_id);

CREATE TABLE IF NOT EXISTS disloop_bookmarks (
  user_id uuid NOT NULL,
  content_type varchar(16) NOT NULL,
  content_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS disloop_bookmarks_user_created_idx
  ON disloop_bookmarks (user_id, created_at);

CREATE TABLE IF NOT EXISTS disloop_profile_pins (
  user_id uuid PRIMARY KEY,
  post_id uuid NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
