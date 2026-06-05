# Teaching by Provider Project

Teaching web project containing one combined web app:

- `Web/` - main teaching/member experience
- `Web/medquiz/` - MedQuiz experience mounted inside the same web app
- `Web/decks/` - Katzung Pharmacology web slide decks mounted inside the same web app
- `Web/mini-game/` - Medica Mist Quest mini game prototype mounted inside the same web app
- `Web/sheets/` - PDF sheets reader with admin upload support

## Local Configuration

`Web/js/supabase-config.js` contains only public browser-safe deployment settings. Keep local-only secrets in `Web/js/supabase-config.local.js`, which is intentionally ignored and only loaded on localhost.

## Supabase Sheets Setup

Run `supabase/sheets.sql` in the Supabase SQL Editor before using PDF upload on Netlify.

The Sheets reader uses:

- Storage bucket: `sheets`
- Metadata table: `public.sheet_files`
- Public read access for students
- Admin-only upload/delete gated by `public.admin_users`

If Supabase is not ready, the local admin page falls back to browser-only IndexedDB storage for testing.
