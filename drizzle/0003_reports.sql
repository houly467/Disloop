CREATE TABLE IF NOT EXISTS disloop_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_type varchar(16) NOT NULL,
  target_id uuid NOT NULL,
  category varchar(24) NOT NULL,
  reason varchar(500) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
