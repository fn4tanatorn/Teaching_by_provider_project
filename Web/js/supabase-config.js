/**
 * Public browser config for the deployed site.
 *
 * Supabase URL + publishable/anon key are expected to be visible in frontend code.
 * Keep service_role keys, admin gate passwords, and third-party API secrets out of
 * this file. Protect real data with Supabase Row Level Security policies.
 */
export const SUPABASE_URL = 'https://vzbvmswohjhjmotrhyvk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6YnZtc3dvaGpoam1vdHJoeXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTM3NjEsImV4cCI6MjA5NTg2OTc2MX0.4L_2DlIc5HsogloMh2-6HBFFDIMfY2-eoQ2TFOHaFlE';

/** Admin sign-in uses this public email plus the password typed by staff. */
export const ADMIN_AUTH_EMAIL = 'admin@med.local';
export const SYSTEM_ADMIN_AUTH_EMAIL = '';

/** Do not publish gate passwords or upload API keys. */
export const ADMIN_GATE_PASSWORD = '';
export const SYSTEM_ADMIN_GATE_PASSWORD = '';

/** Use Supabase Auth for online student accounts across devices. */
export const LOCAL_MEMBER_AUTH = false;

/** Sheets PDF upload/read settings. */
export const SHEETS_USE_SUPABASE = true;
export const SHEETS_STORAGE_BUCKET = 'sheets';
export const SHEETS_TABLE = 'sheet_files';

/** Do not publish embedded test accounts. */
export const EMBEDDED_TEST_LOGIN_USERNAME = '';
export const EMBEDDED_TEST_LOGIN_PASSWORD = '';
