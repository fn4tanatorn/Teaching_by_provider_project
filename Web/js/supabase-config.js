/**
 * Public browser config for the deployed site.
 *
 * Supabase URL + publishable/anon key are expected to be visible in frontend code.
 * Keep service_role keys, admin gate passwords, and third-party API secrets out of
 * this file. Protect real data with Supabase Row Level Security policies.
 */
export const SUPABASE_URL = 'https://ilaqvikdtuuipbjeljio.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_qNNy8huwQIKmYhrWrynXPw_ELHe6ThF';

/** Admin sign-in uses this public email plus the password typed by staff. */
export const ADMIN_AUTH_EMAIL = 'admin@med.local';
export const SYSTEM_ADMIN_AUTH_EMAIL = '';

/** Do not publish gate passwords or upload API keys. */
export const ADMIN_GATE_PASSWORD = '';
export const SYSTEM_ADMIN_GATE_PASSWORD = '';
export const IMGBB_API_KEY = '';

/** Use Supabase Auth for online student accounts across devices. */
export const LOCAL_MEMBER_AUTH = false;

/** Do not publish embedded test accounts. */
export const EMBEDDED_TEST_LOGIN_USERNAME = '';
export const EMBEDDED_TEST_LOGIN_PASSWORD = '';
