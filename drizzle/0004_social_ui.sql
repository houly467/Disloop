ALTER TABLE disloop_users
  ADD COLUMN hide_reposts boolean NOT NULL DEFAULT false;

ALTER TABLE disloop_stories
  ADD COLUMN media_type varchar(16);
