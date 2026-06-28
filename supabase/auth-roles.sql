-- Unified role foundation for Supabase Auth.
-- Run before the RLS hardening scripts that call public.current_user_has_role().

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('admin', 'teacher', 'student'))
);

create index if not exists user_roles_role_idx
  on public.user_roles(role);

-- Backfill admins from the legacy admin_users table when it exists.
do $$
begin
  if to_regclass('public.admin_users') is not null then
    insert into public.user_roles (user_id, role)
    select user_id, 'admin'
    from public.admin_users
    on conflict (user_id) do update
      set role = 'admin',
          updated_at = now()
      where public.user_roles.role <> 'admin';
  end if;
end $$;

create or replace function public.user_has_role(target_user_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = target_user_id
      and role = any(allowed_roles)
  );
$$;

create or replace function public.current_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_role(auth.uid(), allowed_roles);
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.user_has_role(uuid, text[]) from public;
revoke all on function public.current_user_has_role(text[]) from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.user_has_role(uuid, text[]) to authenticated;
grant execute on function public.current_user_has_role(text[]) to authenticated;
grant execute on function public.current_user_role() to authenticated;

alter table public.user_roles enable row level security;

drop policy if exists "user_roles read own role" on public.user_roles;
create policy "user_roles read own role"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_role(array['admin'])
);

drop policy if exists "user_roles admin insert" on public.user_roles;
create policy "user_roles admin insert"
on public.user_roles
for insert
to authenticated
with check (public.current_user_has_role(array['admin']));

drop policy if exists "user_roles admin update" on public.user_roles;
create policy "user_roles admin update"
on public.user_roles
for update
to authenticated
using (public.current_user_has_role(array['admin']))
with check (public.current_user_has_role(array['admin']));

drop policy if exists "user_roles admin delete" on public.user_roles;
create policy "user_roles admin delete"
on public.user_roles
for delete
to authenticated
using (public.current_user_has_role(array['admin']));
