# Teaching by Provider Project

Teaching web project containing one combined web app:

- `Web/` - main teaching/member experience
- `Web/medquiz/` - MedQuiz experience mounted inside the same web app
- `Web/decks/` - Katzung Pharmacology web slide decks mounted inside the same web app
- `Web/sheets/` - PDF sheets reader with admin upload support

## Local Configuration

`Web/js/supabase-config.js` contains only public browser-safe deployment settings. Keep local-only secrets in `Web/js/supabase-config.local.js`, which is intentionally ignored and only loaded on localhost.

## Netlify Environment Variables

Set private keys in Netlify, not in browser JavaScript files:

- `IMGBB_API_KEY` - required for admin image uploads through `/.netlify/functions/image-upload`
- `IMAGE_UPLOAD_MAX_BYTES` - optional upload size limit; defaults to 5 MB
- `SUPABASE_URL` - Supabase project URL for server-side functions
- `SUPABASE_ANON_KEY` - public anon key used by server-side read helpers
- `SUPABASE_SERVICE_ROLE_KEY` - private key for server-side admin writes only

## Local Web Server

Run the combined web app, including the LiveQuiz prototype:

```bash
node Web/server.js
```

Open `http://localhost:3000`. LiveQuiz is available from the main learning shell and directly at `http://localhost:3000/livequiz/`.

On Netlify, `/livequiz/api/*` is served by a Netlify Function backed by Netlify Blobs. The local Node server keeps using its ignored local JSON data file for quick development.

Run `supabase/livequiz-results.sql` in the Supabase SQL Editor before enabling LiveQuiz result persistence on Netlify. The result snapshot write uses `SUPABASE_SERVICE_ROLE_KEY`; without it, rooms still run and exports still work, but finished results are not saved to Supabase.

LiveQuiz host flow:

1. Create a room.
2. Add, import, edit, delete, or reorder questions while the room is in draft.
3. Click `Open lobby` when participants should be allowed to join.
4. Click `Start quiz` to begin the host-paced quiz.

After a quiz is finished, the host console offers:

- `Export CSV` for username and total score.
- `Export details CSV` for one row per participant per question.
- `Export XLSX` with Summary, Responses, and Questions sheets.

## Supabase Sheets Setup

Run `supabase/auth-roles.sql` first to create `public.user_roles` and the role helper functions used by RLS policies.

Run `supabase/sheets.sql` in the Supabase SQL Editor before using PDF upload on Netlify.

The Sheets reader uses:

- Storage bucket: `sheets`
- Metadata table: `public.sheet_files`
- Public read access for students
- Admin-only upload/delete gated by `public.user_roles`

If Supabase is not ready, the local admin page falls back to browser-only IndexedDB storage for testing.
