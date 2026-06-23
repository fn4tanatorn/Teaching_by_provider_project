-- Admin account repair + hardening.
-- Run this in Supabase SQL Editor after recreating the Auth user for ADMIN_AUTH_EMAIL.
--
-- Current repaired admin:
--   email: admin@med.local
--   user_id: 7ed0c557-acf8-4acb-b566-c5addaa40097
--
-- This keeps the app's admin check working while preventing normal signed-in
-- users from adding themselves to public.admin_users through the browser API.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

insert into public.admin_users (user_id)
values ('7ed0c557-acf8-4acb-b566-c5addaa40097')
on conflict (user_id) do nothing;

alter table public.admin_users enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
  loop
    execute format('drop policy if exists %I on public.admin_users', policy_record.policyname);
  end loop;
end $$;

create policy "admin_users can read own row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());
