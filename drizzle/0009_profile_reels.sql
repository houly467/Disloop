ALTER TABLE public.disloop_reels
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS disloop_reels_profile_created_idx
  ON public.disloop_reels (author_id, created_at DESC, id DESC)
  WHERE is_hidden = false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS disloop_news_author_created_idx
  ON public.disloop_news_posts (author_id, created_at DESC, id DESC)
  WHERE is_hidden = false;
