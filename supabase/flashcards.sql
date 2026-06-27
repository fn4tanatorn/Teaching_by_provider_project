-- Flashcards online storage.
-- Run in Supabase SQL Editor before enabling online flashcards.

-- Shared flashcard bank used by the Netlify flashcards-api function.
-- The browser can read the shared bank, but writes should go through the
-- function with FLASHCARDS_STAFF_CODE + SUPABASE_SERVICE_ROLE_KEY.
create table if not exists public.flashcard_shared_bank (
  id text primary key default 'shared',
  state jsonb not null default '{"decks":[],"cards":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint flashcard_shared_bank_singleton check (id = 'shared')
);

insert into public.flashcard_shared_bank (id, state)
values ('shared', '{"decks":[],"cards":[]}'::jsonb)
on conflict (id) do nothing;

alter table public.flashcard_shared_bank enable row level security;

drop policy if exists "flashcard_shared_bank public read" on public.flashcard_shared_bank;
create policy "flashcard_shared_bank public read"
on public.flashcard_shared_bank
for select
to anon, authenticated
using (true);

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  owner_uid uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text not null,
  image_url text not null default '',
  due_at timestamptz not null default now(),
  interval_days integer not null default 0,
  ease numeric not null default 2.5,
  reps integer not null default 0,
  lapses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flashcard_decks_owner_idx
  on public.flashcard_decks(owner_uid, created_at);

create index if not exists flashcards_owner_deck_due_idx
  on public.flashcards(owner_uid, deck_id, due_at);

alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;

drop policy if exists "flashcard_decks owner read" on public.flashcard_decks;
create policy "flashcard_decks owner read"
on public.flashcard_decks
for select
to authenticated
using (owner_uid = auth.uid());

drop policy if exists "flashcard_decks owner insert" on public.flashcard_decks;
create policy "flashcard_decks owner insert"
on public.flashcard_decks
for insert
to authenticated
with check (owner_uid = auth.uid());

drop policy if exists "flashcard_decks owner update" on public.flashcard_decks;
create policy "flashcard_decks owner update"
on public.flashcard_decks
for update
to authenticated
using (owner_uid = auth.uid())
with check (owner_uid = auth.uid());

drop policy if exists "flashcard_decks owner delete" on public.flashcard_decks;
create policy "flashcard_decks owner delete"
on public.flashcard_decks
for delete
to authenticated
using (owner_uid = auth.uid());

drop policy if exists "flashcards owner read" on public.flashcards;
create policy "flashcards owner read"
on public.flashcards
for select
to authenticated
using (owner_uid = auth.uid());

drop policy if exists "flashcards owner insert" on public.flashcards;
create policy "flashcards owner insert"
on public.flashcards
for insert
to authenticated
with check (
  owner_uid = auth.uid()
  and exists (
    select 1
    from public.flashcard_decks d
    where d.id = deck_id
      and d.owner_uid = auth.uid()
  )
);

drop policy if exists "flashcards owner update" on public.flashcards;
create policy "flashcards owner update"
on public.flashcards
for update
to authenticated
using (owner_uid = auth.uid())
with check (
  owner_uid = auth.uid()
  and exists (
    select 1
    from public.flashcard_decks d
    where d.id = deck_id
      and d.owner_uid = auth.uid()
  )
);

drop policy if exists "flashcards owner delete" on public.flashcards;
create policy "flashcards owner delete"
on public.flashcards
for delete
to authenticated
using (owner_uid = auth.uid());
