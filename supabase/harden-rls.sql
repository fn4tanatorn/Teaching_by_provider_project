-- Supabase RLS Hardening Script
-- Run this in your Supabase SQL Editor to secure unrestricted tables and resolve critical warnings.

-- ==========================================
-- 1. Table: public.video_library
-- ==========================================
alter table public.video_library
  alter column videos type jsonb using videos::jsonb;

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
    public.current_user_has_role(array['admin','teacher'])
  )
  with check (
    public.current_user_has_role(array['admin','teacher'])
  );

create or replace function public.increment_video_view(target_video_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_views integer;
begin
  update public.video_library as vl
     set videos = (
       select jsonb_agg(
         case
           when (item.video ->> 'id')::bigint = target_video_id then
             jsonb_set(
               item.video,
               '{views}',
               to_jsonb(coalesce((item.video ->> 'views')::integer, 0) + 1),
               true
             )
           else item.video
         end
         order by item.ordinality
       )
       from jsonb_array_elements(vl.videos::jsonb) with ordinality as item(video, ordinality)
     )
   where vl.id = 1
     and exists (
       select 1
       from jsonb_array_elements(vl.videos::jsonb) as item(video)
       where (item.video ->> 'id')::bigint = target_video_id
     );

  select (item.video ->> 'views')::integer
    into next_views
    from public.video_library as vl,
         jsonb_array_elements(vl.videos::jsonb) as item(video)
   where vl.id = 1
     and (item.video ->> 'id')::bigint = target_video_id
   limit 1;

  return next_views;
end;
$$;

revoke all on function public.increment_video_view(bigint) from public;
grant execute on function public.increment_video_view(bigint) to anon, authenticated;

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
    public.current_user_has_role(array['admin','teacher'])
  )
  with check (
    public.current_user_has_role(array['admin','teacher'])
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
    public.current_user_has_role(array['admin','teacher'])
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
    or public.current_user_has_role(array['admin','teacher'])
  );

drop policy if exists "profiles user/admin update" on public.profiles;
create policy "profiles user/admin update"
  on public.profiles for update
  to anon, authenticated
  using (
    auth.uid() is null
    or id = auth.uid()
    or public.current_user_has_role(array['admin','teacher'])
  )
  with check (
    auth.uid() is null
    or id = auth.uid()
    or public.current_user_has_role(array['admin','teacher'])
  );

drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete"
  on public.profiles for delete
  to authenticated
  using (
    public.current_user_has_role(array['admin','teacher'])
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
    public.current_user_has_role(array['admin','teacher'])
  )
  with check (
    public.current_user_has_role(array['admin','teacher'])
  );
