import { EMPTY_STATE } from './flashcards'
import type { Deck, Flashcard, FlashcardState, FlashcardTable, ReviewGrade } from './flashcards'

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
const normalizeGrade = (value: unknown): ReviewGrade | undefined =>
  value === 'again' || value === 'hard' || value === 'good' || value === 'easy'
    ? value
    : undefined

const normalizeDeck = (row: Partial<Deck>): Deck => ({
  id: String(row.id ?? ''),
  name: String(row.name ?? '').trim(),
  description: String(row.description ?? '').trim(),
  createdAt: normalizeDate(row.createdAt),
})

const normalizeTable = (value: unknown): FlashcardTable | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const table = value as Partial<FlashcardTable>
  const columns = Array.isArray(table.columns)
    ? table.columns.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  const rows = Array.isArray(table.rows)
    ? table.rows
        .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []))
        .filter((row) => row.some(Boolean))
    : []
  if (!columns.length || !rows.length) return undefined

  return {
    ...(typeof table.caption === 'string' && table.caption.trim() ? { caption: table.caption.trim() } : {}),
    columns,
    rows,
    ...(typeof table.note === 'string' && table.note.trim() ? { note: table.note.trim() } : {}),
  }
}

const normalizeCard = (row: Partial<Flashcard>): Flashcard => {
  const frontTable = normalizeTable(row.frontTable)
  const backTable = normalizeTable(row.backTable)
  const lastGrade = normalizeGrade(row.lastGrade)

  return {
    id: String(row.id ?? ''),
    deckId: String(row.deckId ?? ''),
    front: String(row.front ?? '').trim(),
    back: String(row.back ?? '').trim(),
    ...(frontTable ? { frontTable } : {}),
    ...(backTable ? { backTable } : {}),
    imageUrl: String(row.imageUrl ?? '').trim(),
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
    dueAt: normalizeDate(row.dueAt),
    intervalDays: normalizeNumber(row.intervalDays, 0),
    ease: normalizeNumber(row.ease, 2.5),
    reps: normalizeNumber(row.reps, 0),
    lapses: normalizeNumber(row.lapses, 0),
    ...(lastGrade ? { lastGrade } : {}),
  }
}

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
