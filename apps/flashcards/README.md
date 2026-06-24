# Flashcards-web

Anki-style flashcard MVP built with React, TypeScript, and Vite.

## Features

- Decks and cards
- Optional image URL per card
- Local-first storage with `localStorage`
- Anki-like spaced repetition scheduler
- Review grades: Again, Hard, Good, Easy
- JSON import and export for migration or backup

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Main-web integration

Core model and scheduler live in `src/lib/flashcards.ts`.

Use these exports from main-web when ready:

- `FlashcardState`
- `Deck`
- `Flashcard`
- `createDeck`
- `createCard`
- `getDueCards`
- `getDeckStats`
- `scheduleReview`
- `isValidImageUrl`

Current persistence uses `localStorage` through `loadState` and `saveState`. To connect main-web, replace those two functions with API calls while keeping the scheduler and UI state shape.
