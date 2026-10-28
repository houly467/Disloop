CREATE TABLE IF NOT EXISTS disloop_close_friends (
  owner_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id),
  CHECK (owner_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS disloop_close_friends_friend_idx
  ON disloop_close_friends (friend_id);

CREATE TABLE IF NOT EXISTS disloop_story_visibility (
  story_id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  close_friends_only boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS disloop_story_visibility_author_idx
  ON disloop_story_visibility (author_id);

CREATE TABLE IF NOT EXISTS disloop_profile_preferences (
  user_id uuid PRIMARY KEY,
  theme varchar(24) NOT NULL DEFAULT 'default',
  profile_link text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (theme IN ('default', 'ocean', 'sunset', 'forest', 'violet'))
);

CREATE TABLE IF NOT EXISTS disloop_reel_views (
  reel_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS disloop_reel_views_viewed_idx
  ON disloop_reel_views (viewed_at);

CREATE TABLE IF NOT EXISTS disloop_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  invite_code varchar(24) NOT NULL UNIQUE,
  invitee_id uuid,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disloop_invites_inviter_idx
  ON disloop_invites (inviter_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS disloop_invites_invitee_unique
  ON disloop_invites (invitee_id)
  WHERE invitee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS disloop_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason varchar(500) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (status IN ('open', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS disloop_verification_requests_user_idx
  ON disloop_verification_requests (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS disloop_verification_requests_open_unique
  ON disloop_verification_requests (user_id)
  WHERE status = 'open';
