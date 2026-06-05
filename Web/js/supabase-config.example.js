/**
 * Copy this file to js/supabase-config.js and paste your project URL + anon key.
 * Dashboard: Project Settings → API
 * Do not commit supabase-config.js if the repo is public.
 */
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

/**
 * ล็อกอินแอดมินแบบเต็ม (บันทึก DB): สร้าง user นี้ใน Authentication แล้วใส่ UUID ใน admin_users
 * ค่านี้ไม่แสดงในหน้าเว็บ — ผู้ใช้กรอกแค่รหัสในป๊อปอัป Admin
 */
export const ADMIN_AUTH_EMAIL = 'admin@med.local';

/**
 * บัญชีแยกสำหรับ AI agent / automation (Cursor, Antigravity, Codex, Claude Code ฯลฯ)
 * สร้าง user นี้ใน Supabase Auth แล้ว insert UUID เดียวกับ admin ใน public.admin_users
 * วางว่าง '' = ไม่ใช้ (ล็อกอินแอดมินผ่าน ADMIN_AUTH_EMAIL เท่านั้น)
 */
export const SYSTEM_ADMIN_AUTH_EMAIL = '';

/**
 * กรอกรหัสนี้ในป๊อปอัป Admin อย่างเดียว → เข้า page-admin ได้ทันที (ไม่ต้องมีแถวใน admin_users)
 * โหมดนี้ไม่มี session จริง — การบันทึกที่ต้องใช้สิทธิ์ใน DB อาจล้มเหลว จนกว่าจะตั้ง Supabase + admin_users ครบ
 * วางว่าง '' เพื่อปิดโหมดนี้
 */
export const ADMIN_GATE_PASSWORD = '';

/**
 * รหัสแยกสำหรับ system_admin (เทียบเท่า gate เดียวกับ ADMIN_GATE_PASSWORD แต่ระบุว่าเป็นโหมด agent)
 * วางว่าง '' = ปิด
 */
export const SYSTEM_ADMIN_GATE_PASSWORD = '';

/** Optional: ImgBB API key for admin image uploads (check-in / quiz images). Leave empty to disable uploads. */
export const IMGBB_API_KEY = '';

/**
 * บัญชีทดสอบบนหน้า Log in (ข้าม allow list / ไม่ต้องสมัครก่อน) — วาง username ว่าง '' เพื่อปิด
 */
export const EMBEDDED_TEST_LOGIN_USERNAME = '';
export const EMBEDDED_TEST_LOGIN_PASSWORD = '';

/** true = สมาชิกล็อกอินเก็บใน localStorage ไม่ใช้ Supabase Auth */
export const LOCAL_MEMBER_AUTH = false;

/** Sheets PDF upload/read settings. */
export const SHEETS_USE_SUPABASE = true;
export const SHEETS_STORAGE_BUCKET = 'sheets';
export const SHEETS_TABLE = 'sheet_files';
