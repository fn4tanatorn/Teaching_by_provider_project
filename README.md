# Teaching by Provider Project

Teaching web project containing one combined web app and a mini game prototype:

- `Web/` - main teaching/member experience
- `Web/medquiz/` - MedQuiz experience mounted inside the same web app
- `Web/decks/` - Katzung Pharmacology web slide decks mounted inside the same web app
- `Web_test_Mini_game/` - Medica Mist Quest mini game prototype

## Local Configuration

`Web/js/supabase-config.js` contains only public browser-safe deployment settings. Keep local-only secrets in `Web/js/supabase-config.local.js`, which is intentionally ignored and only loaded on localhost.
