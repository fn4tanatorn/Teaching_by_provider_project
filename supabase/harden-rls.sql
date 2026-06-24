-- Supabase RLS Hardening Script
-- Run this in your Supabase SQL Editor to secure unrestricted tables and resolve critical warnings.

-- ==========================================
-- 1. Table: public.video_library
-- ==========================================
alter table public.video_library enable row level security;

drop policy if exists "video_library public read" on public.video_library;
create policy "video_library public read"
  on public.video_library for select
  to anon, authenticated
  using (true);

drop policy if exists "video_library admin write" on public.video_library;
create policy "video_library admin write"
  on public.video_library for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

-- ==========================================
-- 2. Table: public.checkin_questions
-- ==========================================
alter table public.checkin_questions enable row level security;

drop policy if exists "checkin_questions public read" on public.checkin_questions;
create policy "checkin_questions public read"
  on public.checkin_questions for select
  to anon, authenticated
  using (true);

drop policy if exists "checkin_questions admin write" on public.checkin_questions;
create policy "checkin_questions admin write"
  on public.checkin_questions for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

-- ==========================================
-- 3. Table: public.checkin_responses
-- ==========================================
alter table public.checkin_responses enable row level security;

drop policy if exists "checkin_responses public read" on public.checkin_responses;
create policy "checkin_responses public read"
  on public.checkin_responses for select
  to anon, authenticated
  using (true);

drop policy if exists "checkin_responses public insert" on public.checkin_responses;
create policy "checkin_responses public insert"
  on public.checkin_responses for insert
  to anon, authenticated
  with check (true);

drop policy if exists "checkin_responses admin delete" on public.checkin_responses;
create policy "checkin_responses admin delete"
  on public.checkin_responses for delete
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

-- ==========================================
-- 4. Table: public.profiles
-- ==========================================
alter table public.profiles enable row level security;

drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "profiles user/admin insert" on public.profiles;
create policy "profiles user/admin insert"
  on public.profiles for insert
  to anon, authenticated
  with check (
    auth.uid() is null
    or id = auth.uid()
    or exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "profiles user/admin update" on public.profiles;
create policy "profiles user/admin update"
  on public.profiles for update
  to anon, authenticated
  using (
    auth.uid() is null
    or id = auth.uid()
    or exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() is null
    or id = auth.uid()
    or exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete"
  on public.profiles for delete
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

-- ==========================================
-- 5. Table: public.admin_settings
-- ==========================================
alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings public read" on public.admin_settings;
create policy "admin_settings public read"
  on public.admin_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admin_settings admin write" on public.admin_settings;
create policy "admin_settings admin write"
  on public.admin_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );
