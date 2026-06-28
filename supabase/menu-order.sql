-- Shared sidebar menu order for Clinical Study Hub.
-- Run this in Supabase SQL Editor before saving menu order from the admin panel.

alter table public.admin_settings
add column if not exists menu_order jsonb not null default
  '["home","videos","brainmap","checkin","request","stats","sheets","decks","flashcards","livequiz","medquiz","alevel"]'::jsonb;

