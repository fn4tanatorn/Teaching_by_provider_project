# Teaching by Provider Project

Teaching web project containing one combined web app:

- `Web/` - main teaching/member experience
- `Web/medquiz/` - MedQuiz experience mounted inside the same web app
- `Web/decks/` - Katzung Pharmacology web slide decks mounted inside the same web app
- `Web/sheets/` - PDF sheets reader with admin upload support

## Local Configuration

`Web/js/supabase-config.js` contains only public browser-safe deployment settings. Keep local-only secrets in `Web/js/supabase-config.local.js`, which is intentionally ignored and only loaded on localhost.

## Local Web Server

Run the combined web app, including the LiveQuiz prototype:

```bash
node Web/server.js
```

Open `http://localhost:3000`. LiveQuiz is available from the main learning shell and directly at `http://localhost:3000/livequiz/`.

On Netlify, `/livequiz/api/*` is served by a Netlify Function backed by Netlify Blobs. The local Node server keeps using its ignored local JSON data file for quick development.

LiveQuiz host flow:

1. Create a room.
2. Add, import, edit, delete, or reorder questions while the room is in draft.
3. Click `Open lobby` when participants should be allowed to join.
4. Click `Start quiz` to begin the host-paced quiz.

## Supabase Sheets Setup

Run `supabase/sheets.sql` in the Supabase SQL Editor before using PDF upload on Netlify.

The Sheets reader uses:

- Storage bucket: `sheets`
- Metadata table: `public.sheet_files`
- Public read access for students
- Admin-only upload/delete gated by `public.admin_users`

If Supabase is not ready, the local admin page falls back to browser-only IndexedDB storage for testing.
