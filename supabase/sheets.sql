-- Sheets PDF setup for Supabase.
-- Run in Supabase SQL Editor before deploying the Sheets upload feature.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheets', 'sheets', true, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.sheet_files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  public_url text not null,
  size_bytes bigint not null default 0,
  mime_type text not null default 'application/pdf',
  created_at timestamptz not null default now()
);

alter table public.sheet_files enable row level security;

drop policy if exists "sheet_files public read" on public.sheet_files;
create policy "sheet_files public read"
on public.sheet_files
for select
to anon, authenticated
using (true);

drop policy if exists "sheet_files admin insert" on public.sheet_files;
create policy "sheet_files admin insert"
on public.sheet_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "sheet_files admin delete" on public.sheet_files;
create policy "sheet_files admin delete"
on public.sheet_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "sheets public read" on storage.objects;
create policy "sheets public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'sheets');

drop policy if exists "sheets admin upload" on storage.objects;
create policy "sheets admin upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sheets'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "sheets admin delete" on storage.objects;
create policy "sheets admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sheets'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);
