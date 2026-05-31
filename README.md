# Teaching by Provider Project

Teaching web project containing one combined web app:

- `Web/` - main teaching/member experience
- `Web/medquiz/` - MedQuiz experience mounted inside the same web app
- `Web/decks/` - Katzung Pharmacology web slide decks mounted inside the same web app

## Local Configuration

`Web/js/supabase-config.js` contains only public browser-safe deployment settings. Keep local-only secrets in `Web/js/supabase-config.local.js`, which is intentionally ignored and only loaded on localhost.
