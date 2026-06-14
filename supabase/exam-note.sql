-- Exam details note setup for Supabase.
-- Run in Supabase SQL Editor before using the Exam details note feature.

alter table public.admin_settings
add column if not exists exam_note text;
