-- LiveQuiz result snapshot storage.
-- Run in Supabase SQL Editor before enabling result persistence on Netlify.
--
-- Writes are performed by the Netlify function with SUPABASE_SERVICE_ROLE_KEY.
-- No public RLS policies are added because classroom results should not be
-- readable or writable directly from the browser.

create table if not exists public.livequiz_results (
  room_code text primary key,
  room_state text not null default 'finished',
  participant_count integer not null default 0,
  question_count integer not null default 0,
  possible_score integer not null default 0,
  summary jsonb not null default '[]'::jsonb,
  responses jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists livequiz_results_finished_at_idx
  on public.livequiz_results(finished_at desc);

alter table public.livequiz_results enable row level security;
