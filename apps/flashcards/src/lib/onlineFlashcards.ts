import type { Deck, Flashcard, FlashcardState } from './flashcards'

type SupabaseClient = {
  auth: {
    getSession: () => Promise<{ data?: { session?: { user?: { id?: string } } | null }; error?: unknown }>
  }
  from: (table: string) => any
}

export type FlashcardStore =
  | { mode: 'local'; reason: string }
  | { mode: 'online'; userId: string; supabase: SupabaseClient }

type PublicConfig = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

const isConfigured = (value?: string) => Boolean(value && !value.includes('YOUR_') && value.startsWith('http'))
const runtimeImport = new Function('path', 'return import(path)') as <T>(path: string) => Promise<T>

const normalizeDate = (value: string | null | undefined) => value ?? new Date().toISOString()

const deckFromRow = (row: any): Deck => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  description: String(row.description ?? ''),
  createdAt: normalizeDate(row.created_at),
})

const cardFromRow = (row: any): Flashcard => ({
  id: String(row.id),
  deckId: String(row.deck_id),
  front: String(row.front ?? ''),
  back: String(row.back ?? ''),
  imageUrl: String(row.image_url ?? ''),
  createdAt: normalizeDate(row.created_at),
  updatedAt: normalizeDate(row.updated_at),
  dueAt: normalizeDate(row.due_at),
  intervalDays: Number(row.interval_days ?? 0),
  ease: Number(row.ease ?? 2.5),
  reps: Number(row.reps ?? 0),
  lapses: Number(row.lapses ?? 0),
})

const deckToRow = (deck: Deck, userId: string) => ({
  id: deck.id,
  owner_uid: userId,
  name: deck.name,
  description: deck.description,
  created_at: deck.createdAt,
})

const cardToRow = (card: Flashcard, userId: string) => ({
  id: card.id,
  deck_id: card.deckId,
  owner_uid: userId,
  front: card.front,
  back: card.back,
  image_url: card.imageUrl,
  created_at: card.createdAt,
  updated_at: card.updatedAt,
  due_at: card.dueAt,
  interval_days: card.intervalDays,
  ease: card.ease,
  reps: card.reps,
  lapses: card.lapses,
})

export const initFlashcardStore = async (): Promise<FlashcardStore> => {
  try {
    const config = await runtimeImport<PublicConfig>('/js/supabase-config.js')
    if (!isConfigured(config.SUPABASE_URL) || !config.SUPABASE_ANON_KEY) {
      return { mode: 'local', reason: 'Supabase is not configured.' }
    }
    const supabaseUrl = config.SUPABASE_URL as string
    const supabaseAnonKey = config.SUPABASE_ANON_KEY as string

    const { createClient } = await runtimeImport<{
      createClient: (url: string, anonKey: string, options?: unknown) => SupabaseClient
    }>('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })

    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    const userId = data?.session?.user?.id
    if (!userId) {
      return { mode: 'local', reason: 'Log in to sync flashcards online.' }
    }

    return { mode: 'online', userId, supabase }
  } catch (error) {
    return {
      mode: 'local',
      reason: error instanceof Error ? error.message : 'Online flashcards unavailable.',
    }
  }
}

export const fetchOnlineState = async (store: Extract<FlashcardStore, { mode: 'online' }>): Promise<FlashcardState> => {
  const [{ data: deckRows, error: deckError }, { data: cardRows, error: cardError }] = await Promise.all([
    store.supabase
      .from('flashcard_decks')
      .select('id, name, description, created_at')
      .eq('owner_uid', store.userId)
      .order('created_at', { ascending: true }),
    store.supabase
      .from('flashcards')
      .select('id, deck_id, front, back, image_url, created_at, updated_at, due_at, interval_days, ease, reps, lapses')
      .eq('owner_uid', store.userId)
      .order('created_at', { ascending: true }),
  ])

  if (deckError) throw deckError
  if (cardError) throw cardError

  return {
    decks: (deckRows || []).map(deckFromRow),
    cards: (cardRows || []).map(cardFromRow),
  }
}

export const saveOnlineState = async (
  store: Extract<FlashcardStore, { mode: 'online' }>,
  state: FlashcardState,
) => {
  const decks = state.decks.map((deck) => deckToRow(deck, store.userId))
  const cards = state.cards.map((card) => cardToRow(card, store.userId))

  if (decks.length > 0) {
    const { error } = await store.supabase.from('flashcard_decks').upsert(decks, { onConflict: 'id' })
    if (error) throw error
  }

  const deckIds = state.decks.map((deck) => deck.id)
  let deleteDecks = store.supabase.from('flashcard_decks').delete().eq('owner_uid', store.userId)
  if (deckIds.length > 0) {
    deleteDecks = deleteDecks.not('id', 'in', `(${deckIds.join(',')})`)
  }
  const { error: deleteDeckError } = await deleteDecks
  if (deleteDeckError) throw deleteDeckError

  if (cards.length > 0) {
    const { error } = await store.supabase.from('flashcards').upsert(cards, { onConflict: 'id' })
    if (error) throw error
  }

  const cardIds = state.cards.map((card) => card.id)
  let deleteCards = store.supabase.from('flashcards').delete().eq('owner_uid', store.userId)
  if (cardIds.length > 0) {
    deleteCards = deleteCards.not('id', 'in', `(${cardIds.join(',')})`)
  }
  const { error: deleteCardError } = await deleteCards
  if (deleteCardError) throw deleteCardError
}
