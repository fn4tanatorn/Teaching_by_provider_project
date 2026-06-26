export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export type Flashcard = {
  id: string
  deckId: string
  front: string
  back: string
  imageUrl: string
  createdAt: string
  updatedAt: string
  dueAt: string
  intervalDays: number
  ease: number
  reps: number
  lapses: number
}

export type Deck = {
  id: string
  name: string
  description: string
  createdAt: string
}

export type FlashcardState = {
  decks: Deck[]
  cards: Flashcard[]
}

export const STORAGE_KEY = 'flashcards-web:v1'
export const APP_ILLUSTRATION_URL = `${import.meta.env.BASE_URL}assets/medical-flashcards-line-art.png`
const OLD_STARTER_IMAGE_URL = 'https://picsum.photos/seed/flashcard-diagram/900/600'

const nowIso = () => new Date().toISOString()

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const createSeedState = (): FlashcardState => {
  const createdAt = nowIso()
  const deckId = makeId()

  return {
    decks: [
      {
        id: deckId,
        name: 'Medicine review',
        description: 'Starter deck. Replace with your own topic.',
        createdAt,
      },
    ],
    cards: [
      createCard({
        deckId,
        front: 'What is spaced repetition?',
        back: 'A review method that shows harder cards sooner and easier cards later.',
        imageUrl: '',
      }),
      createCard({
        deckId,
        front: 'What can image links be used for?',
        back: 'Diagrams, pathology photos, radiology, tables, or any reference image hosted online.',
        imageUrl: APP_ILLUSTRATION_URL,
      }),
    ],
  }
}

export const EMPTY_STATE: FlashcardState = {
  decks: [],
  cards: [],
}

export const createDeck = (name: string, description = ''): Deck => ({
  id: makeId(),
  name: name.trim(),
  description: description.trim(),
  createdAt: nowIso(),
})

export const createCard = ({
  deckId,
  front,
  back,
  imageUrl,
}: {
  deckId: string
  front: string
  back: string
  imageUrl: string
}): Flashcard => {
  const createdAt = nowIso()

  return {
    id: makeId(),
    deckId,
    front: front.trim(),
    back: back.trim(),
    imageUrl: imageUrl.trim(),
    createdAt,
    updatedAt: createdAt,
    dueAt: createdAt,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  }
}

export const getDueCards = (cards: Flashcard[], deckId: string, date = new Date()) =>
  cards
    .filter((card) => card.deckId === deckId && new Date(card.dueAt) <= date)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

export const getDeckStats = (state: FlashcardState, deckId: string) => {
  const deckCards = state.cards.filter((card) => card.deckId === deckId)
  const due = getDueCards(state.cards, deckId).length
  const mastered = deckCards.filter((card) => card.intervalDays >= 21).length

  return {
    total: deckCards.length,
    due,
    mastered,
  }
}

export const scheduleReview = (card: Flashcard, grade: ReviewGrade): Flashcard => {
  const currentEase = card.ease || 2.5
  let ease = currentEase
  let intervalDays = card.intervalDays
  let lapses = card.lapses

  if (grade === 'again') {
    ease = Math.max(1.3, currentEase - 0.2)
    intervalDays = 0
    lapses += 1
  }

  if (grade === 'hard') {
    ease = Math.max(1.3, currentEase - 0.15)
    intervalDays = Math.max(1, Math.ceil(intervalDays * 1.2))
  }

  if (grade === 'good') {
    intervalDays = card.reps === 0 ? 1 : Math.max(2, Math.ceil(intervalDays * ease))
  }

  if (grade === 'easy') {
    ease = currentEase + 0.15
    intervalDays = card.reps === 0 ? 4 : Math.max(4, Math.ceil(intervalDays * ease * 1.3))
  }

  const nextDue = new Date()
  if (grade === 'again') {
    nextDue.setMinutes(nextDue.getMinutes() + 10)
  } else {
    nextDue.setDate(nextDue.getDate() + intervalDays)
  }

  return {
    ...card,
    dueAt: nextDue.toISOString(),
    ease,
    intervalDays,
    lapses,
    reps: card.reps + 1,
    updatedAt: nowIso(),
  }
}

export const loadState = (): FlashcardState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createSeedState()

    const parsed = JSON.parse(raw) as FlashcardState
    if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
      return createSeedState()
    }

    return {
      ...parsed,
      cards: parsed.cards.map((card) =>
        card.imageUrl === OLD_STARTER_IMAGE_URL
          ? { ...card, imageUrl: APP_ILLUSTRATION_URL }
          : card,
      ),
    }
  } catch {
    return createSeedState()
  }
}

export const saveState = (state: FlashcardState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const mergeSharedBankWithLocalProgress = (
  sharedState: FlashcardState,
  localState: FlashcardState,
): FlashcardState => {
  const localCardsById = new Map(localState.cards.map((card) => [card.id, card]))

  return {
    decks: sharedState.decks,
    cards: sharedState.cards.map((sharedCard) => {
      const localCard = localCardsById.get(sharedCard.id)
      if (!localCard) return sharedCard

      return {
        ...sharedCard,
        dueAt: localCard.dueAt,
        intervalDays: localCard.intervalDays,
        ease: localCard.ease,
        reps: localCard.reps,
        lapses: localCard.lapses,
        updatedAt: localCard.updatedAt,
      }
    }),
  }
}

export const isValidImageUrl = (value: string) => {
  if (!value.trim()) return true

  if (value.startsWith('/')) return true

  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      /\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}
