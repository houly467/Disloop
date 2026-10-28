CREATE TABLE IF NOT EXISTS public.disloop_username_history (
  username_lower varchar(20) PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
