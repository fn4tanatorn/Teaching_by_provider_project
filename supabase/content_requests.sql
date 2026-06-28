-- Content Request table migration.
-- Run in Supabase SQL Editor to allow students to suggest ideas or content they want to learn.

create table if not exists public.content_requests (
  id uuid default gen_random_uuid() primary key,
  username text not null,
  title text not null,
  subject text,
  details text,
  status text not null default 'pending', -- 'pending', 'approved', 'rejected', 'in-progress', 'completed'
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.content_requests enable row level security;

-- Drop existing policies if any
drop policy if exists "content_requests public read" on public.content_requests;
drop policy if exists "content_requests public insert" on public.content_requests;
drop policy if exists "content_requests admin update" on public.content_requests;
drop policy if exists "content_requests admin delete" on public.content_requests;

-- Allow all users (anon or authenticated) to read content requests
create policy "content_requests public read"
  on public.content_requests
  for select
  to anon, authenticated
  using (true);

-- Allow all users to insert new requests
create policy "content_requests public insert"
  on public.content_requests
  for insert
  to anon, authenticated
  with check (true);

-- Allow admins to update request status
create policy "content_requests admin update"
  on public.content_requests
  for update
  to authenticated
  using (
    public.current_user_has_role(array['admin','teacher'])
  )
  with check (
    public.current_user_has_role(array['admin','teacher'])
  );

-- Allow admins to delete requests
create policy "content_requests admin delete"
  on public.content_requests
  for delete
  to authenticated
  using (
    public.current_user_has_role(array['admin','teacher'])
  );
