CREATE TABLE disloop_user_flair (
  user_id uuid PRIMARY KEY,
  name_style text,
  custom_title text,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
