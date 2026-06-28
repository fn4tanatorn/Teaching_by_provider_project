import { EMPTY_STATE } from './flashcards'
import type { Deck, Flashcard, FlashcardState } from './flashcards'

export type FlashcardStore =
  | { mode: 'local'; reason: string }
  | { mode: 'shared'; apiUrl: string; source?: string }

export type OnlineFlashcardBank = {
  state: FlashcardState
  source: string
}

const API_URL = '/.netlify/functions/flashcards-api'
const REQUEST_RETRIES = 3
const RETRY_DELAYS_MS = [250, 800, 1600]

const normalizeDate = (value: unknown) => (typeof value === 'string' && value ? value : new Date().toISOString())
const normalizeNumber = (value: unknown, fallback: number) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

const normalizeDeck = (row: Partial<Deck>): Deck => ({
  id: String(row.id ?? ''),
  name: String(row.name ?? '').trim(),
  description: String(row.description ?? '').trim(),
  createdAt: normalizeDate(row.createdAt),
})

const normalizeCard = (row: Partial<Flashcard>): Flashcard => ({
  id: String(row.id ?? ''),
  deckId: String(row.deckId ?? ''),
  front: String(row.front ?? '').trim(),
  back: String(row.back ?? '').trim(),
  imageUrl: String(row.imageUrl ?? '').trim(),
  createdAt: normalizeDate(row.createdAt),
  updatedAt: normalizeDate(row.updatedAt),
  dueAt: normalizeDate(row.dueAt),
  intervalDays: normalizeNumber(row.intervalDays, 0),
  ease: normalizeNumber(row.ease, 2.5),
  reps: normalizeNumber(row.reps, 0),
  lapses: normalizeNumber(row.lapses, 0),
})

const normalizeState = (value: unknown): FlashcardState => {
  if (!value || typeof value !== 'object') return EMPTY_STATE
  const state = value as Partial<FlashcardState>
  const decks = Array.isArray(state.decks)
    ? state.decks.map((deck) => normalizeDeck(deck)).filter((deck) => deck.id && deck.name)
    : []
  const deckIds = new Set(decks.map((deck) => deck.id))
  const cards = Array.isArray(state.cards)
    ? state.cards
        .map((card) => normalizeCard(card))
        .filter((card) => card.id && card.deckId && deckIds.has(card.deckId) && card.front && card.back)
    : []

  return { decks, cards }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const requestJson = async (url: string, init?: RequestInit) => {
  let lastError: unknown

  for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload.error || `Flashcard bank request failed (${response.status})`))
      }
      return payload
    } catch (error) {
      lastError = error
      if (attempt < REQUEST_RETRIES - 1) {
        await wait(RETRY_DELAYS_MS[attempt] ?? 1000)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Shared flashcard bank unavailable.')
}

const normalizeBankPayload = (payload: unknown): OnlineFlashcardBank => {
  const bank = payload && typeof payload === 'object' ? payload as { state?: unknown; source?: unknown } : {}
  return {
    state: normalizeState(bank.state),
    source: typeof bank.source === 'string' && bank.source ? bank.source : 'shared',
  }
}

export const initFlashcardStore = async (): Promise<FlashcardStore> => {
  try {
    const bank = normalizeBankPayload(await requestJson(API_URL))
    return { mode: 'shared', apiUrl: API_URL, source: bank.source }
  } catch (error) {
    return {
      mode: 'local',
      reason: error instanceof Error ? error.message : 'Shared flashcard bank unavailable.',
    }
  }
}

export const fetchOnlineState = async (
  store: Extract<FlashcardStore, { mode: 'shared' }>,
): Promise<OnlineFlashcardBank> => {
  const payload = await requestJson(store.apiUrl)
  return normalizeBankPayload(payload)
}

export const saveOnlineState = async (
  store: Extract<FlashcardStore, { mode: 'shared' }>,
  state: FlashcardState,
  accessToken: string,
) => {
  return normalizeBankPayload(await requestJson(store.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ state: normalizeState(state) }),
  }))
}
