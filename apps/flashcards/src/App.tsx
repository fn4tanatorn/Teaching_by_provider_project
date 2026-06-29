import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  CheckSquare,
  Copy,
  Layers3,
  LogOut,
  MoveRight,
  Plus,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Square,
  Upload,
  Edit3,
  Trash2,
  Search,
  X,
  Eye,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import {
  APP_ILLUSTRATION_URL,
  createCard,
  createDeck,
  getDeckStats,
  getDueCards,
  isValidImageUrl,
  loadState,
  mergeSharedBankWithLocalProgress,
  saveState,
  scheduleReview,
} from './lib/flashcards'
import type { Deck, Flashcard, FlashcardState, FlashcardTable, ReviewGrade } from './lib/flashcards'
import { fetchOnlineState, initFlashcardStore, saveOnlineState } from './lib/onlineFlashcards'
import type { FlashcardStore } from './lib/onlineFlashcards'

type View = 'study' | 'staff' | 'add' | 'decks'

type AiInstructionBlock = {
  purpose: string
  requiredOutputShape: string[]
  cardWritingRules: string[]
  medicalAccuracyRules: string[]
  tableRules: string[]
  imageRules: string[]
  validationChecklist: string[]
}

const gradeLabels: Record<ReviewGrade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
}

const gradeIntervals: Record<ReviewGrade, string> = {
  again: '< 10m',
  hard: '< 6h',
  good: '< 1d',
  easy: '4d',
}

const sharedStore = (store: FlashcardStore | null) => (store?.mode === 'shared' ? store : null)
const requestedDeckId = new URLSearchParams(window.location.search).get('deck') ?? ''

const makeImportId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const mergeImportedState = (currentState: FlashcardState, importedState: FlashcardState) => {
  const existingDeckIds = new Set(currentState.decks.map((deck) => deck.id))
  const existingCardIds = new Set(currentState.cards.map((card) => card.id))
  const importDeckIds = new Set(importedState.decks.map((deck) => deck.id))
  const deckIdMap = new Map<string, string>()
  const nextDecks: Deck[] = []

  for (const deck of importedState.decks) {
    const sourceId = String(deck.id || '').trim()
    const name = String(deck.name || '').trim()
    if (!sourceId || !name || deckIdMap.has(sourceId)) continue

    let nextId = sourceId
    if (existingDeckIds.has(nextId)) {
      do {
        nextId = makeImportId('deck')
      } while (existingDeckIds.has(nextId) || deckIdMap.has(nextId))
    }

    deckIdMap.set(sourceId, nextId)
    existingDeckIds.add(nextId)
    nextDecks.push({
      ...deck,
      id: nextId,
      name,
      description: String(deck.description || '').trim(),
      createdAt: typeof deck.createdAt === 'string' && deck.createdAt ? deck.createdAt : new Date().toISOString(),
    })
  }

  const nextCards: Flashcard[] = []
  for (const card of importedState.cards) {
    const sourceDeckId = String(card.deckId || '').trim()
    const mappedDeckId = deckIdMap.get(sourceDeckId)
    if (!mappedDeckId && !importDeckIds.has(sourceDeckId)) continue
    if (!mappedDeckId) continue

    let nextCardId = String(card.id || '').trim()
    if (!nextCardId || existingCardIds.has(nextCardId)) {
      do {
        nextCardId = makeImportId('card')
      } while (existingCardIds.has(nextCardId))
    }

    existingCardIds.add(nextCardId)
    nextCards.push({
      ...card,
      id: nextCardId,
      deckId: mappedDeckId,
      front: String(card.front || '').trim(),
      back: String(card.back || '').trim(),
      imageUrl: String(card.imageUrl || '').trim(),
      createdAt: typeof card.createdAt === 'string' && card.createdAt ? card.createdAt : new Date().toISOString(),
      updatedAt: typeof card.updatedAt === 'string' && card.updatedAt ? card.updatedAt : new Date().toISOString(),
      dueAt: typeof card.dueAt === 'string' && card.dueAt ? card.dueAt : new Date().toISOString(),
      intervalDays: Number.isFinite(Number(card.intervalDays)) ? Number(card.intervalDays) : 0,
      ease: Number.isFinite(Number(card.ease)) ? Number(card.ease) : 2.5,
      reps: Number.isFinite(Number(card.reps)) ? Number(card.reps) : 0,
      lapses: Number.isFinite(Number(card.lapses)) ? Number(card.lapses) : 0,
    })
  }

  return {
    state: {
      decks: [...currentState.decks, ...nextDecks],
      cards: [...nextCards, ...currentState.cards],
    },
    importedDeckCount: nextDecks.length,
    importedCardCount: nextCards.length,
    firstImportedDeckId: nextDecks[0]?.id ?? '',
  }
}

const readSupabaseAccessToken = () => {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || ''
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const parsed = JSON.parse(localStorage.getItem(key) || 'null')
      const token = parsed?.access_token || parsed?.currentSession?.access_token
      if (typeof token === 'string' && token) return token
    }
  } catch {
    /* ignore private mode / malformed storage */
  }
  return ''
}

const sourceLabel = (source?: string) => {
  if (source === 'supabase') return 'Supabase bank'
  if (source === 'blob') return 'Shared bank'
  if (source === 'local') return 'Local fallback'
  return 'Shared bank'
}

const pickRandomCard = (cards: Flashcard[], excludeCardId?: string) => {
  if (cards.length === 0) return undefined

  const candidates = cards.length > 1 && excludeCardId
    ? cards.filter((card) => card.id !== excludeCardId)
    : cards

  return candidates[Math.floor(Math.random() * candidates.length)]
}

function App() {
  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1'
  const [state, setState] = useState<FlashcardState>(() => loadState())
  const [activeDeckId, setActiveDeckId] = useState(() =>
    state.decks.some((deck) => deck.id === requestedDeckId)
      ? requestedDeckId
      : state.decks[0]?.id ?? '',
  )
  const [view, setView] = useState<View>(isAdminMode ? 'staff' : 'study')
  const [isAnswerVisible, setIsAnswerVisible] = useState(false)
  const [randomCardId, setRandomCardId] = useState('')
  const [isRandomMode, setIsRandomMode] = useState(false)

  const [isStaffUnlocked, setIsStaffUnlocked] = useState(false)
  const [staffAccessToken, setStaffAccessToken] = useState('')
  const [staffAuthMessage, setStaffAuthMessage] = useState(
    isAdminMode ? 'Checking your Clinical Study Hub session...' : '',
  )
  const [toast, setToast] = useState('')
  const [store, setStore] = useState<FlashcardStore | null>(null)
  const [isOnlineReady, setIsOnlineReady] = useState(false)
  const [syncLabel, setSyncLabel] = useState('Checking sync')
  const [syncDetail, setSyncDetail] = useState('Looking for the shared flashcard bank.')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isManualSyncing, setIsManualSyncing] = useState(false)

  const readFullscreenState = useCallback(() => {
    const parentDocument = window.parent !== window ? window.parent.document : null
    const hostFrame = window.frameElement

    return Boolean(
      document.fullscreenElement ||
      (parentDocument && hostFrame && parentDocument.fullscreenElement === hostFrame),
    )
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(readFullscreenState())

    document.addEventListener('fullscreenchange', syncFullscreenState)
    if (window.parent !== window) {
      window.parent.document.addEventListener('fullscreenchange', syncFullscreenState)
    }

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      if (window.parent !== window) {
        window.parent.document.removeEventListener('fullscreenchange', syncFullscreenState)
      }
    }
  }, [readFullscreenState])

  useEffect(() => {
    if (!isAdminMode) return
    const token = readSupabaseAccessToken()
    if (!token) {
      setIsStaffUnlocked(false)
      setStaffAuthMessage('Sign in as an admin or teacher from Clinical Study Hub, then reopen Flashcards admin.')
      return
    }
    setStaffAccessToken(token)
    setIsStaffUnlocked(true)
    setStaffAuthMessage('Admin session detected.')
  }, [isAdminMode])

  useEffect(() => {
    let isMounted = true

    const loadOnline = async () => {
      const nextStore = await initFlashcardStore()
      if (!isMounted) return

      setStore(nextStore)

      if (nextStore.mode === 'local') {
        setIsOnlineReady(false)
        setSyncLabel('Local only')
        setSyncDetail(nextStore.reason)
        return
      }

      try {
        const onlineBank = await fetchOnlineState(nextStore)
        if (!isMounted) return

        const nextState = onlineBank.state.decks.length > 0
          ? (isAdminMode ? onlineBank.state : mergeSharedBankWithLocalProgress(onlineBank.state, state))
          : state

        setState(nextState)
        setActiveDeckId(
          nextState.decks.some((deck) => deck.id === requestedDeckId)
            ? requestedDeckId
            : nextState.decks[0]?.id ?? '',
        )
        setIsOnlineReady(true)
        setSyncLabel(onlineBank.state.decks.length > 0 ? sourceLabel(onlineBank.source) : 'Ready to publish')
        setSyncDetail(
          onlineBank.state.decks.length > 0
            ? `Students load this shared card bank from ${sourceLabel(onlineBank.source)}. Study progress stays on each browser.`
            : 'No shared bank is published yet. Use Push to Supabase after preparing decks.',
        )
      } catch (error) {
        setIsOnlineReady(false)
        setSyncLabel('Local only')
        setSyncDetail(error instanceof Error ? error.message : 'Shared flashcard bank unavailable.')
      }
    }

    void loadOnline()

    return () => {
      isMounted = false
    }
    // Initial local state is intentionally used as the first online seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeDeckId && state.decks.length > 0) {
      setActiveDeckId(state.decks[0].id)
    }
  }, [activeDeckId, state.decks])

  const activeDeck = state.decks.find((deck) => deck.id === activeDeckId)

  const dueCards = useMemo(() => {
    if (!activeDeckId) return []
    return getDueCards(state.cards, activeDeckId)
  }, [activeDeckId, state.cards])

  const activeDeckCards = useMemo(() => {
    if (!activeDeckId) return []
    return state.cards.filter((card) => card.deckId === activeDeckId)
  }, [activeDeckId, state.cards])

  const randomCard = randomCardId
    ? activeDeckCards.find((card) => card.id === randomCardId)
    : undefined
  const currentCard = randomCard ?? dueCards[0]
  const activeStats = activeDeckId ? getDeckStats(state, activeDeckId) : null
  const cardCount = state.cards.filter((card) => card.deckId === activeDeckId).length

  const updateCard = useCallback((card: Flashcard) => {
    setState((current) => ({
      ...current,
      cards: current.cards.map((item) => (item.id === card.id ? card : item)),
    }))
  }, [])

  const markLocalChanges = (detail = 'Local changes are saved in this browser. Push to Supabase when ready.') => {
    setIsOnlineReady(false)
    setSyncLabel('Local changes')
    setSyncDetail(detail)
  }

  const pushStateToSupabase = async (nextState: FlashcardState): Promise<boolean> => {
    const currentStore = sharedStore(store)
    if (!currentStore) {
      setSyncLabel('Local only')
      setSyncDetail('Shared flashcard bank unavailable. Changes are saved on this browser only.')
      return false
    }

    setIsManualSyncing(true)
    setSyncLabel('Publishing')
    if (!staffAccessToken) {
      setSyncLabel('Publish blocked')
      setSyncDetail('Sign in with an admin or teacher account before publishing shared flashcards.')
      setIsManualSyncing(false)
      return false
    }

    try {
      const bank = await saveOnlineState(currentStore, nextState, staffAccessToken)
      setState(bank.state)
      setIsOnlineReady(true)
      setSyncLabel(sourceLabel(bank.source))
      setSyncDetail(`Pushed to ${sourceLabel(bank.source)}. Refreshing students will load this shared bank.`)
      return true
    } catch (error: unknown) {
      setSyncLabel('Publish failed')
      setSyncDetail(error instanceof Error ? error.message : 'Could not publish the shared flashcard bank.')
      return false
    } finally {
      setIsManualSyncing(false)
    }
  }

  const handlePushToSupabase = async () => {
    const pushed = await pushStateToSupabase(state)
    setToast(pushed ? 'Pushed to Supabase' : 'Push failed')
  }

  const handlePullFromSupabase = async () => {
    const currentStore = sharedStore(store)
    if (!currentStore) {
      setSyncLabel('Local only')
      setSyncDetail('Shared flashcard bank unavailable.')
      setToast('Pull failed')
      return
    }

    const confirmPull = window.confirm(
      'Pull from Supabase? This will replace the current browser copy with the shared bank.',
    )
    if (!confirmPull) return

    setIsManualSyncing(true)
    setSyncLabel('Pulling')
    try {
      const bank = await fetchOnlineState(currentStore)
      setState(bank.state)
      setActiveDeckId(
        bank.state.decks.some((deck) => deck.id === activeDeckId)
          ? activeDeckId
          : bank.state.decks[0]?.id ?? '',
      )
      setIsOnlineReady(true)
      setSyncLabel(sourceLabel(bank.source))
      setSyncDetail(`Pulled ${bank.state.decks.length} decks and ${bank.state.cards.length} cards from ${sourceLabel(bank.source)}.`)
      setToast('Pulled from Supabase')
    } catch (error) {
      setIsOnlineReady(false)
      setSyncLabel('Pull failed')
      setSyncDetail(error instanceof Error ? error.message : 'Could not pull from Supabase.')
      setToast('Pull failed')
    } finally {
      setIsManualSyncing(false)
    }
  }

  const handleGrade = useCallback((grade: ReviewGrade) => {
    if (!currentCard) return
    updateCard(scheduleReview(currentCard, grade))

    if (isRandomMode) {
      const nextCard = pickRandomCard(activeDeckCards, currentCard.id)
      setRandomCardId(nextCard?.id ?? '')
    } else {
      setRandomCardId('')
    }

    setIsAnswerVisible(false)
    setToast(`Card scheduled: ${gradeLabels[grade]}`)
  }, [activeDeckCards, currentCard, isRandomMode, updateCard])

  const handleRandomCard = useCallback(() => {
    if (activeDeckCards.length === 0) return

    const nextCard = pickRandomCard(activeDeckCards, currentCard?.id)

    setIsRandomMode(true)
    setRandomCardId(nextCard?.id ?? '')
    setIsAnswerVisible(false)
    setToast('Random card loaded')
  }, [activeDeckCards, currentCard])

  const handleCancelRandomMode = useCallback(() => {
    setIsRandomMode(false)
    setRandomCardId('')
    setIsAnswerVisible(false)
    setToast('Random mode off')
  }, [])

  useEffect(() => {
    if (!randomCardId) return
    if (!activeDeckCards.some((card) => card.id === randomCardId)) {
      setIsRandomMode(false)
      setRandomCardId('')
      setIsAnswerVisible(false)
    }
  }, [activeDeckCards, randomCardId])

  useEffect(() => {
    if (view !== 'study') return

    const handleStudyShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLowerCase()

      if (key === 'r') {
        event.preventDefault()
        handleRandomCard()
        return
      }

      if (!currentCard) return

      if (key === ' ' || key === 'enter') {
        event.preventDefault()
        setIsAnswerVisible(true)
        return
      }

      if (key === 'escape') {
        setIsAnswerVisible(false)
        return
      }

      if (!isAnswerVisible) return

      const gradeByKey: Record<string, ReviewGrade> = {
        '1': 'again',
        '2': 'hard',
        '3': 'good',
        '4': 'easy',
      }
      const grade = gradeByKey[key]
      if (grade) {
        event.preventDefault()
        handleGrade(grade)
      }
    }

    window.addEventListener('keydown', handleStudyShortcut)
    return () => window.removeEventListener('keydown', handleStudyShortcut)
  }, [currentCard, handleGrade, handleRandomCard, isAnswerVisible, view])



  const handleAddCard = (frontText: string, backText: string, imgUrl: string, deckId: string) => {
    if (!isValidImageUrl(imgUrl)) {
      setToast('Use valid http or https URL.')
      return
    }

    const nextCard = createCard({
      deckId,
      front: frontText,
      back: backText,
      imageUrl: imgUrl,
    })

    const nextState = { ...state, cards: [nextCard, ...state.cards] }
    setState(nextState)
    markLocalChanges('Card added locally. Push to Supabase when ready.')
    setToast('Card added')
  }

  const handleUpdateCard = (cardId: string, updatedFront: string, updatedBack: string, updatedImageUrl: string, updatedDeckId: string) => {
    if (!isValidImageUrl(updatedImageUrl)) {
      setToast('Use valid http or https URL.')
      return
    }

    const nextState = {
      ...state,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              front: updatedFront.trim(),
              back: updatedBack.trim(),
              imageUrl: updatedImageUrl.trim(),
              deckId: updatedDeckId,
              updatedAt: new Date().toISOString(),
            }
          : card
      ),
    }
    setState(nextState)
    markLocalChanges('Card updated locally. Push to Supabase when ready.')
    setToast('Card updated')
  }

  const handleDeleteCard = (cardId: string) => {
    if (!window.confirm('Are you sure you want to delete this card?')) return
    const nextState = {
      ...state,
      cards: state.cards.filter((card) => card.id !== cardId),
    }
    setState(nextState)
    markLocalChanges('Card deleted locally. Push to Supabase when ready.')
    setToast('Card deleted')
  }

  const handleDuplicateCard = (cardId: string) => {
    const original = state.cards.find((c) => c.id === cardId)
    if (!original) return
    const nextCard = createCard({
      deckId: original.deckId,
      front: original.front,
      back: original.back,
      imageUrl: original.imageUrl,
      frontTable: original.frontTable,
      backTable: original.backTable,
    })
    const nextState = { ...state, cards: [nextCard, ...state.cards] }
    setState(nextState)
    markLocalChanges('Card duplicated locally. Push to Supabase when ready.')
    setToast('Card duplicated')
  }

  const handleBulkDelete = (cardIds: string[]) => {
    if (!window.confirm(`Delete ${cardIds.length} selected cards?`)) return
    const idSet = new Set(cardIds)
    const nextState = { ...state, cards: state.cards.filter((c) => !idSet.has(c.id)) }
    setState(nextState)
    markLocalChanges('Selected cards deleted locally. Push to Supabase when ready.')
    setToast(`${cardIds.length} cards deleted`)
  }

  const handleBulkMoveDeck = (cardIds: string[], targetDeckId: string) => {
    const idSet = new Set(cardIds)
    const nowStr = new Date().toISOString()
    const nextState = {
      ...state,
      cards: state.cards.map((c) =>
        idSet.has(c.id) ? { ...c, deckId: targetDeckId, updatedAt: nowStr } : c
      ),
    }
    setState(nextState)
    markLocalChanges('Cards moved locally. Push to Supabase when ready.')
    const deckName = state.decks.find((d) => d.id === targetDeckId)?.name ?? 'deck'
    setToast(`${cardIds.length} cards moved to ${deckName}`)
  }

  const handleCreateDeckInline = (name: string, description: string) => {
    const nextDeck = createDeck(name, description)
    const nextState = { ...state, decks: [...state.decks, nextDeck] }
    setState(nextState)
    markLocalChanges('Deck created locally. Push to Supabase when ready.')
    setToast('Deck created')
  }

  const handleUpdateDeck = (deckId: string, updatedName: string, updatedDescription: string) => {
    const nextState = {
      ...state,
      decks: state.decks.map((deck) =>
        deck.id === deckId
          ? {
              ...deck,
              name: updatedName.trim(),
              description: updatedDescription.trim(),
            }
          : deck
      ),
    }
    setState(nextState)
    markLocalChanges('Deck updated locally. Push to Supabase when ready.')
    setToast('Deck updated')
  }

  const handleDeleteDeck = (deckId: string) => {
    const deckCardsCount = state.cards.filter((card) => card.deckId === deckId).length
    const confirmMessage = deckCardsCount > 0
      ? `Are you sure you want to delete this deck? This will also permanently delete all ${deckCardsCount} cards inside it!`
      : 'Are you sure you want to delete this deck?'

    if (!window.confirm(confirmMessage)) return

    const nextState = {
      ...state,
      decks: state.decks.filter((deck) => deck.id !== deckId),
      cards: state.cards.filter((card) => card.deckId !== deckId),
    }
    setState(nextState)
    markLocalChanges('Deck deleted locally. Push to Supabase when ready.')

    if (activeDeckId === deckId) {
      const remainingDecks = state.decks.filter((d) => d.id !== deckId)
      setActiveDeckId(remainingDecks[0]?.id ?? '')
    }

    setToast('Deck deleted')
  }

  const handleResetDeckProgress = () => {
    if (!activeDeckId) return
    const deck = state.decks.find((d) => d.id === activeDeckId)
    if (!deck) return

    const confirmMessage = `Reset progress for deck "${deck.name}"? This will set all cards in this deck back to new, resetting your study intervals.`
    if (!window.confirm(confirmMessage)) return

    const nowStr = new Date().toISOString()
    setState((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.deckId === activeDeckId
          ? {
              ...card,
              dueAt: nowStr,
              intervalDays: 0,
              ease: 2.5,
              reps: 0,
              lapses: 0,
              lastGrade: undefined,
              updatedAt: nowStr,
            }
          : card
      ),
    }))
    setIsAnswerVisible(false)
    setToast(`Progress reset for ${deck.name}`)
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'flashcards-web-export.json'
    link.click()
    URL.revokeObjectURL(url)
    setToast('Export ready')
  }

  const handleDownloadSample = () => {
    const deckId = 'sample-lab-diagnosis-infection'
    const createdAt = '2026-06-25T00:00:00.000Z'
    const makeSampleCard = (
      id: string,
      front: string,
      back: string,
      imageUrl = '',
      extra: Partial<Pick<Flashcard, 'frontTable' | 'backTable'>> = {},
    ): Flashcard => ({
      id,
      deckId,
      front,
      back,
      ...extra,
      imageUrl,
      createdAt,
      updatedAt: createdAt,
      dueAt: createdAt,
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
    })
    const sampleState: FlashcardState & { aiInstructions: AiInstructionBlock } = {
      aiInstructions: {
        purpose:
          'Use this file as an example when generating import-ready flashcards from lecture notes, recalled exam questions, or study topics.',
        requiredOutputShape: [
          'Return valid JSON only.',
          'Keep the top-level keys decks and cards.',
          'Every deck must have id, name, description, and createdAt.',
          'Every card must have id, deckId, front, back, imageUrl, createdAt, updatedAt, dueAt, intervalDays, ease, reps, and lapses.',
          'Optional fields include frontTable, backTable, and lastGrade.',
          'Each card deckId must exactly match one existing deck id.',
        ],
        cardWritingRules: [
          'Write one clear testable idea per card.',
          'Use a specific clinical question on the front side, not a broad topic label.',
          'Keep the back side concise: direct answer first, then the key interpretation or limitation.',
          'Prefer clinically useful wording over trivia.',
          'Avoid ambiguous words such as usually or common unless the condition or exception is stated.',
        ],
        medicalAccuracyRules: [
          'Do not invent guidelines, cutoffs, drug doses, organisms, or diagnostic criteria.',
          'If a fact depends on local laboratory policy, state that it may vary by institution.',
          'For diagnostic tests, include major limitations such as false negatives, contamination, or inability to identify species when relevant.',
          'When converting exam questions, preserve the tested concept and correct answer; do not add unsupported distractor logic.',
        ],
        tableRules: [
          'Use frontTable or backTable when a comparison, lab panel, diagnostic pattern, or interpretation matrix is clearer than prose.',
          'A table must have columns as an array of headings and rows as an array of row arrays.',
          'Keep tables compact: usually 2-4 columns and 2-6 rows.',
          'Use table note for caveats such as window period, local laboratory policy, or need for repeat testing.',
          'Do not put HTML or Markdown table syntax in front or back; use structured JSON table fields instead.',
        ],
        imageRules: [
          'imageUrl may be an empty string.',
          'If an image is used, provide a direct image URL ending in .png, .jpg, .jpeg, .gif, .webp, or .svg.',
          'Choose images that directly support the card, such as microscopy, culture plates, algorithms, or tables.',
        ],
        validationChecklist: [
          'JSON parses without comments or trailing commas.',
          'No empty front or back fields.',
          'No duplicate card ids.',
          'All dueAt, createdAt, and updatedAt values are ISO date strings.',
          'New cards start with intervalDays 0, ease 2.5, reps 0, lapses 0, and no lastGrade.',
        ],
      },
      decks: [
        {
          id: deckId,
          name: 'Lab Diagnosis of Infectious Diseases',
          description:
            'Import-ready example for clinical microbiology flashcards. Use direct image URLs ending in .png, .jpg, .jpeg, .gif, .webp, or .svg.',
          createdAt,
        },
      ],
      cards: [
        makeSampleCard(
          'sample-labdx-001',
          'What information can a Gram stain provide before culture results are available?',
          'Gram stain can rapidly show bacterial Gram reaction, morphology, arrangement, and host inflammatory cells. A negative stain does not exclude infection when organism burden is low or sampling is poor.',
          'https://upload.wikimedia.org/wikipedia/commons/5/5d/Gram_positive_coccus_and_gram_negative_rod.png',
        ),
        makeSampleCard(
          'sample-labdx-002',
          'What does an acid-fast stain detect, and what is its main limitation?',
          'Acid-fast staining detects acid-fast bacilli such as Mycobacterium and partially acid-fast organisms such as Nocardia. It does not reliably identify species and a negative smear does not fully exclude tuberculosis.',
          'https://upload.wikimedia.org/wikipedia/commons/7/71/Mycobacterium_tuberculosis_Ziehl-Neelsen_stain_02.jpg',
        ),
        makeSampleCard(
          'sample-labdx-003',
          'How many blood culture sets should usually be collected for initial evaluation of suspected bloodstream infection?',
          'Usually 2-3 blood culture sets are collected from separate venipuncture sites before antibiotics when feasible. Multiple sets improve detection and help distinguish true bacteremia from contamination.',
          'https://upload.wikimedia.org/wikipedia/commons/f/ff/National_Lab_Week_130410-F-TT327-090.jpg',
        ),
        makeSampleCard(
          'sample-labdx-004',
          'What does mixed growth of several organisms in a urine culture usually suggest?',
          'Mixed growth, especially without a predominant uropathogen, usually suggests specimen contamination. Interpretation should still consider symptoms, collection method, colony count, and patient risk factors.',
          'https://upload.wikimedia.org/wikipedia/commons/9/9b/Bacteriuria_pyuria_4.jpg',
        ),
        makeSampleCard(
          'sample-labdx-005',
          'Which antimicrobial susceptibility methods provide a quantitative MIC?',
          'Broth dilution, agar dilution, and gradient diffusion methods such as E-test can provide quantitative MIC values. Disk diffusion mainly reports zone diameters interpreted as susceptible, intermediate, or resistant.',
          'https://upload.wikimedia.org/wikipedia/commons/3/3a/E-test_Ngono.jpg',
        ),
        makeSampleCard(
          'sample-labdx-006',
          'How should common HCV screening and confirmatory test patterns be interpreted?',
          'HCV antibody suggests exposure, while HCV RNA or core antigen supports current infection. Discordant patterns should be interpreted with timing, immune status, and repeat testing when clinically indicated.',
          '',
          {
            backTable: {
              caption: 'HCV lab interpretation',
              columns: ['anti-HCV', 'HCV RNA / core Ag', 'Likely interpretation'],
              rows: [
                ['Negative', 'Negative', 'No evidence of HCV infection; consider window period if recent exposure'],
                ['Positive', 'Positive', 'Current HCV infection'],
                ['Positive', 'Negative', 'Past resolved infection, treated infection, or false-positive antibody'],
                ['Negative', 'Positive', 'Early acute infection or immunocompromised state; repeat/confirm testing'],
              ],
              note: 'Exact algorithms may vary by local laboratory and guideline.',
            },
          },
        ),
      ],
    }
    const blob = new Blob([JSON.stringify(sampleState, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'flashcards-import-sample-lab-diagnosis.json'
    link.click()
    URL.revokeObjectURL(url)
    setToast('Sample ready')
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const nextState = JSON.parse(text) as FlashcardState
      if (!Array.isArray(nextState.decks) || !Array.isArray(nextState.cards)) {
        throw new Error('Invalid flashcard file')
      }

      const mergedImport = mergeImportedState(state, nextState)
      if (mergedImport.importedDeckCount === 0 || mergedImport.importedCardCount === 0) {
        throw new Error('No importable decks or cards')
      }

      setState(mergedImport.state)
      setActiveDeckId(mergedImport.firstImportedDeckId || activeDeckId || (mergedImport.state.decks[0]?.id ?? ''))
      markLocalChanges('Import merged locally. Push to Supabase when ready.')
      setToast(`Imported ${mergedImport.importedDeckCount} decks, ${mergedImport.importedCardCount} cards`)
    } catch {
      setToast('Import failed')
    } finally {
      event.target.value = ''
    }
  }

  const handleStaffLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = readSupabaseAccessToken()
    if (!token) {
      setStaffAuthMessage('No Clinical Study Hub admin session found. Sign in from the main hub first.')
      setToast('Admin sign-in required')
      return
    }

    setStaffAccessToken(token)
    setIsStaffUnlocked(true)
    setStaffAuthMessage('Admin session detected.')
    setToast('Admin unlocked')
  }

  const handleStaffLogout = () => {
    setIsStaffUnlocked(false)
    setStaffAccessToken('')
    setView('study')
    setToast('Admin locked')
  }

  const handleToggleFullscreen = async () => {
    try {
      if (readFullscreenState()) {
        if (window.parent !== window && window.parent.document.fullscreenElement) {
          await window.parent.document.exitFullscreen()
        } else if (document.fullscreenElement) {
          await document.exitFullscreen()
        }
        setIsFullscreen(false)
        return
      }

      if (window.parent !== window && window.frameElement instanceof HTMLElement) {
        await window.frameElement.requestFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
      setIsFullscreen(true)
    } catch {
      window.parent.postMessage({ type: 'toggle-flashcards-fullscreen' }, window.location.origin)
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Deck navigation">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={22} strokeWidth={1.8} />
          </div>
          <div>
            <p className="label">Flashcards-web</p>
            <h1>Anki-style study</h1>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Main views">
          {!isAdminMode && (
            <button className={view === 'study' ? 'active' : ''} onClick={() => setView('study')}>
              <BookOpen size={18} /> Study
            </button>
          )}
          {isAdminMode && (
            <button
              className={view === 'staff' || view === 'add' || view === 'decks' ? 'active' : ''}
              onClick={() => setView('staff')}
            >
              <ShieldCheck size={18} /> Manage
            </button>
          )}
        </nav>

        <div className="deck-picker">
          <label htmlFor="deck-select">Active deck</label>
          <select
            id="deck-select"
            value={activeDeckId}
            onChange={(event) => {
              setActiveDeckId(event.target.value)
              setIsRandomMode(false)
              setRandomCardId('')
              setIsAnswerVisible(false)
            }}
          >
            {state.decks.map((deck) => (
              <option value={deck.id} key={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>

        <div className="stat-grid">
          <Metric label="Due" value={activeStats?.due ?? 0} />
          <Metric label="Cards" value={activeStats?.total ?? 0} />
          <Metric label="Mature" value={activeStats?.mastered ?? 0} />
        </div>

        {activeStats && activeStats.total > 0 && (
          <div className="grade-summary" aria-label="Latest grade counts">
            <p>Latest grading</p>
            <div className="grade-summary-grid">
              <GradeCount label="No grade" value={activeStats.gradeCounts.new} tone="new" />
              <GradeCount label="Again" value={activeStats.gradeCounts.again} tone="again" />
              <GradeCount label="Hard" value={activeStats.gradeCounts.hard} tone="hard" />
              <GradeCount label="Good" value={activeStats.gradeCounts.good} tone="good" />
              <GradeCount label="Easy" value={activeStats.gradeCounts.easy} tone="easy" />
            </div>
          </div>
        )}

        {!isAdminMode && view === 'study' && activeStats && activeStats.total > 0 && (
          <button className="reset-progress-button" onClick={handleResetDeckProgress}>
            <RotateCcw size={14} /> Clear progress
          </button>
        )}

        <div className="sync-pill" title={syncDetail}>
          <span className={isOnlineReady ? 'sync-dot online' : 'sync-dot'} />
          {syncLabel}
        </div>

        {isStaffUnlocked && !isAdminMode && (
          <button className="staff-lock-button" onClick={handleStaffLogout}>
            <LogOut size={17} /> Lock staff
          </button>
        )}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="label">{activeDeck?.name ?? 'No deck'}</p>
            <h2>
              {view === 'study' && 'Review queue'}
              {view === 'staff' && 'Staff'}
              {view === 'add' && 'Add card'}
              {view === 'decks' && 'Manage decks'}
            </h2>
          </div>
          <div className="status-line">
            {cardCount} total cards, {dueCards.length} due now
          </div>
        </header>

        {view === 'study' && (
          <StudyView
            card={currentCard}
            isAnswerVisible={isAnswerVisible}
            hasCards={activeDeckCards.length > 0}
            isRandomCard={Boolean(randomCard)}
            isRandomMode={isRandomMode}
            isFullscreen={isFullscreen}
            onReveal={() => setIsAnswerVisible(true)}
            onReset={() => setIsAnswerVisible(false)}
            onRandom={handleRandomCard}
            onCancelRandom={handleCancelRandomMode}
            onGrade={handleGrade}
            onToggleFullscreen={handleToggleFullscreen}
          />
        )}

        {view === 'staff' && (
          <StaffView
            isUnlocked={isStaffUnlocked}
            authMessage={staffAuthMessage}
            onLogin={handleStaffLogin}
            state={state}
            activeDeckId={activeDeckId}
            setActiveDeckId={setActiveDeckId}
            onAddCard={handleAddCard}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
            onDuplicateCard={handleDuplicateCard}
            onBulkDelete={handleBulkDelete}
            onBulkMoveDeck={handleBulkMoveDeck}
            onCreateDeck={handleCreateDeckInline}
            onUpdateDeck={handleUpdateDeck}
            onDeleteDeck={handleDeleteDeck}
            onExport={handleExport}
            onDownloadSample={handleDownloadSample}
            onImport={handleImport}
            onPushToSupabase={handlePushToSupabase}
            onPullFromSupabase={handlePullFromSupabase}
            syncLabel={syncLabel}
            syncDetail={syncDetail}
            isOnlineReady={isOnlineReady}
            isManualSyncing={isManualSyncing}
          />
        )}
      </section>

      {toast && (
        <button className="toast" onClick={() => setToast('')} aria-label="Dismiss message">
          <Check size={16} /> {toast}
        </button>
      )}
    </main>
  )
}

function StaffView({
  isUnlocked,
  authMessage,
  onLogin,
  state,
  activeDeckId,
  setActiveDeckId,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onDuplicateCard,
  onBulkDelete,
  onBulkMoveDeck,
  onCreateDeck,
  onUpdateDeck,
  onDeleteDeck,
  onExport,
  onDownloadSample,
  onImport,
  onPushToSupabase,
  onPullFromSupabase,
  syncLabel,
  syncDetail,
  isOnlineReady,
  isManualSyncing,
}: {
  isUnlocked: boolean
  authMessage: string
  onLogin: (event: FormEvent<HTMLFormElement>) => void
  state: FlashcardState
  activeDeckId: string
  setActiveDeckId: (id: string) => void
  onAddCard: (front: string, back: string, imageUrl: string, deckId: string) => void
  onUpdateCard: (cardId: string, front: string, back: string, imageUrl: string, deckId: string) => void
  onDeleteCard: (cardId: string) => void
  onDuplicateCard: (cardId: string) => void
  onBulkDelete: (cardIds: string[]) => void
  onBulkMoveDeck: (cardIds: string[], targetDeckId: string) => void
  onCreateDeck: (name: string, description: string) => void
  onUpdateDeck: (deckId: string, name: string, description: string) => void
  onDeleteDeck: (deckId: string) => void
  onExport: () => void
  onDownloadSample: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onPushToSupabase: () => void
  onPullFromSupabase: () => void
  syncLabel: string
  syncDetail: string
  isOnlineReady: boolean
  isManualSyncing: boolean
}) {
  const [staffTab, setStaffTab] = useState<'cards' | 'decks' | 'backup'>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDeckId, setFilterDeckId] = useState('all')
  type SortKey = 'newest' | 'oldest' | 'front-az' | 'front-za' | 'due-soon'
  const [sortBy, setSortBy] = useState<SortKey>('newest')

  // Add Card Form State
  const [isAddingCard, setIsAddingCard] = useState(false)
  const [newFront, setNewFront] = useState('')
  const [newBack, setNewBack] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newDeckId, setNewDeckId] = useState(activeDeckId || state.decks[0]?.id || '')

  // Modal Edit Card State
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editDeckId, setEditDeckId] = useState('')
  const [showEditPreview, setShowEditPreview] = useState(false)

  // Edit Deck Form State
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null)
  const [editDeckName, setEditDeckName] = useState('')
  const [editDeckDescription, setEditDeckDescription] = useState('')

  // Create Deck Form State
  const [newDeckName, setNewDeckName] = useState('')
  const [newDeckDescription, setNewDeckDescription] = useState('')

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMoveDeckId, setBulkMoveDeckId] = useState('')

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  if (!isUnlocked) {
    return (
      <section className="panel staff-panel">
        <div className="staff-intro">
          <ShieldCheck size={28} />
          <div>
            <p className="label">Staff only</p>
            <h3>Admin or teacher role required</h3>
            <p>Card creation, deck management, import, and export use your Clinical Study Hub session.</p>
          </div>
        </div>
        <form className="staff-login" onSubmit={onLogin}>
          <p className="hint">{authMessage || 'Sign in as admin or teacher in the main hub, then check access here.'}</p>
          <button className="primary-action" type="submit">
            <ShieldCheck size={18} /> Check access
          </button>
        </form>
      </section>
    )
  }

  const filteredCards = state.cards
    .filter((card) => {
      const matchesDeck = filterDeckId === 'all' || card.deckId === filterDeckId
      const matchesSearch =
        card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.back.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesDeck && matchesSearch
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'front-az': return a.front.localeCompare(b.front)
        case 'front-za': return b.front.localeCompare(a.front)
        case 'due-soon': return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })

  const allFilteredSelected = filteredCards.length > 0 && filteredCards.every((c) => selectedIds.has(c.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      clearSelection()
    } else {
      setSelectedIds(new Set(filteredCards.map((c) => c.id)))
    }
  }

  const openEditModal = (card: Flashcard) => {
    setEditingCard(card)
    setEditFront(card.front)
    setEditBack(card.back)
    setEditImageUrl(card.imageUrl)
    setEditDeckId(card.deckId)
    setShowEditPreview(false)
  }

  return (
    <section className="staff-dashboard">
      <div className="staff-tabs">
        <button
          className={staffTab === 'cards' ? 'active' : ''}
          onClick={() => {
            setStaffTab('cards')
            setEditingCard(null)
            setIsAddingCard(false)
            clearSelection()
          }}
        >
          <Layers3 size={16} /> Cards ({state.cards.length})
        </button>
        <button
          className={staffTab === 'decks' ? 'active' : ''}
          onClick={() => {
            setStaffTab('decks')
            setEditingDeck(null)
          }}
        >
          <BookOpen size={16} /> Decks ({state.decks.length})
        </button>
        <button
          className={staffTab === 'backup' ? 'active' : ''}
          onClick={() => setStaffTab('backup')}
        >
          <Upload size={16} /> Backup & Sync
        </button>
      </div>

      <div className="staff-tab-content">
        {staffTab === 'cards' && (
          <div className="cards-tab-view">
            {/* -- Bulk Action Bar -- */}
            {selectedIds.size > 0 && (
              <div className="bulk-action-bar">
                <span className="bulk-count">{selectedIds.size} selected</span>
                <select
                  className="bulk-move-select"
                  value={bulkMoveDeckId}
                  onChange={(e) => setBulkMoveDeckId(e.target.value)}
                >
                  <option value="">Move to deck...</option>
                  {state.decks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button
                  className="bulk-move-btn"
                  disabled={!bulkMoveDeckId}
                  onClick={() => {
                    if (!bulkMoveDeckId) return
                    onBulkMoveDeck(Array.from(selectedIds), bulkMoveDeckId)
                    clearSelection()
                    setBulkMoveDeckId('')
                  }}
                >
                  <MoveRight size={14} /> Move
                </button>
                <button
                  className="bulk-delete-btn"
                  onClick={() => {
                    onBulkDelete(Array.from(selectedIds))
                    clearSelection()
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button className="bulk-cancel-btn" onClick={clearSelection}>
                  <X size={14} /> Cancel
                </button>
              </div>
            )}

            {/* -- Filter / Sort / Add Bar -- */}
            <div className="cards-filter-header">
              <div className="search-bar">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="clear-search-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="filter-controls">
                <select
                  value={filterDeckId}
                  onChange={(e) => setFilterDeckId(e.target.value)}
                  className="deck-select-filter"
                >
                  <option value="all">All Decks</option>
                  {state.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="sort-select"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="front-az">Front A-Z</option>
                  <option value="front-za">Front Z-A</option>
                  <option value="due-soon">Due soonest</option>
                </select>

                <button
                  className="primary-action add-card-btn"
                  onClick={() => {
                    setIsAddingCard(true)
                    setEditingCard(null)
                    setNewFront('')
                    setNewBack('')
                    setNewImageUrl('')
                    setNewDeckId(activeDeckId || state.decks[0]?.id || '')
                  }}
                >
                  <Plus size={16} /> Add Card
                </button>
              </div>
            </div>

            {/* -- Add Card Inline Form -- */}
            {isAddingCard && (
              <div className="panel inline-form-panel">
                <div className="form-header">
                  <h4>Add New Card</h4>
                  <button className="close-btn" onClick={() => setIsAddingCard(false)}>
                    <X size={18} />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!newFront.trim() || !newBack.trim()) return
                    onAddCard(newFront, newBack, newImageUrl, newDeckId)
                    setNewFront('')
                    setNewBack('')
                    setNewImageUrl('')
                  }}
                >
                  <Field label="Target Deck" helper="Select which deck this card belongs to.">
                    <select value={newDeckId} onChange={(e) => setNewDeckId(e.target.value)}>
                      {state.decks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                          {deck.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Front Side" helper="Front content (question/cloze prompt).">
                    <textarea
                      value={newFront}
                      onChange={(e) => setNewFront(e.target.value)}
                      rows={3}
                      placeholder="e.g. What is the powerhouse of the cell?"
                      required
                    />
                  </Field>
                  <Field label="Back Side" helper="Back content (answer/explanation).">
                    <textarea
                      value={newBack}
                      onChange={(e) => setNewBack(e.target.value)}
                      rows={3}
                      placeholder="e.g. Mitochondria"
                      required
                    />
                  </Field>
                  <Field label="Image URL (Optional)" helper="Optional web image URL.">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="https://example.com/image.png"
                    />
                  </Field>
                  {newImageUrl && (
                    <div className="image-preview-box">
                      <img src={newImageUrl} alt="preview" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                    </div>
                  )}
                  <div className="form-actions">
                    <button type="submit" className="primary-action">
                      <Plus size={16} /> Save Card
                    </button>
                    <button type="button" className="secondary-action" onClick={() => setIsAddingCard(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* -- Cards Grid with Select All + Bulk -- */}
            <div className="cards-manager-list">
              {filteredCards.length === 0 ? (
                <div className="empty-state-small">
                  <p>No cards match the current search or filters.</p>
                </div>
              ) : (
                <>
                  <div className="cards-list-toolbar">
                    <button className="select-all-btn" onClick={toggleSelectAll}>
                      {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      {allFilteredSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="cards-count-label">{filteredCards.length} cards</span>
                  </div>
                  <div className="backend-cards-grid">
                    {filteredCards.map((card) => {
                      const deck = state.decks.find((d) => d.id === card.deckId)
                      const isSelected = selectedIds.has(card.id)
                      return (
                        <div
                          key={card.id}
                          className={`backend-card-item${isSelected ? ' selected' : ''}`}
                        >
                          <div className="card-select-row">
                            <button
                              className="card-checkbox-btn"
                              onClick={() => toggleSelect(card.id)}
                              aria-label={isSelected ? 'Deselect' : 'Select'}
                            >
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                            <span className="deck-badge">{deck?.name || 'Unknown Deck'}</span>
                          </div>
                          <div className="backend-card-info">
                            <div className="card-text-preview">
                              <strong>Front:</strong>
                              <p>{card.front}</p>
                            </div>
                            <div className="card-text-preview">
                              <strong>Back:</strong>
                              <p>{card.back}</p>
                            </div>
                            {(card.frontTable || card.backTable) && (
                              <div className="card-table-badges">
                                {card.frontTable && <span>Front table</span>}
                                {card.backTable && <span>Back table</span>}
                              </div>
                            )}
                            {card.imageUrl && (
                              <div className="card-image-thumbnail">
                                <img src={card.imageUrl} alt="" />
                              </div>
                            )}
                            <div className="card-meta">
                              <span>Reps: {card.reps}</span>
                              <span>Interval: {card.intervalDays}d</span>
                              <span>Due: {new Date(card.dueAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="backend-card-actions">
                            <button className="edit-btn" onClick={() => openEditModal(card)}>
                              <Edit3 size={14} /> Edit
                            </button>
                            <button className="duplicate-btn" onClick={() => onDuplicateCard(card.id)}>
                              <Copy size={14} /> Duplicate
                            </button>
                            <button className="delete-btn" onClick={() => onDeleteCard(card.id)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* -- Edit Card Modal Overlay -- */}
            {editingCard && (
              <div className="modal-overlay" onClick={() => setEditingCard(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="form-header">
                    <h4>Edit Card</h4>
                    <div className="modal-header-actions">
                      <button
                        className={`preview-toggle-btn${showEditPreview ? ' active' : ''}`}
                        onClick={() => setShowEditPreview(!showEditPreview)}
                        type="button"
                      >
                        <Eye size={16} /> Preview
                      </button>
                      <button className="close-btn" onClick={() => setEditingCard(null)}>
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {showEditPreview ? (
                    <div className="edit-preview-pane">
                      <div className="preview-card">
                        <div className="preview-side">
                          <strong>Front</strong>
                          <p>{editFront || '(empty)'}</p>
                        </div>
                        <div className="preview-side">
                          <strong>Back</strong>
                          <p>{editBack || '(empty)'}</p>
                        </div>
                        {editImageUrl && (
                          <div className="image-preview-box">
                            <img src={editImageUrl} alt="preview" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (!editFront.trim() || !editBack.trim()) return
                        onUpdateCard(editingCard.id, editFront, editBack, editImageUrl, editDeckId)
                        setEditingCard(null)
                      }}
                    >
                      <Field label="Deck" helper="Choose a different deck if moving this card.">
                        <select value={editDeckId} onChange={(e) => setEditDeckId(e.target.value)}>
                          {state.decks.map((deck) => (
                            <option key={deck.id} value={deck.id}>
                              {deck.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Front Side" helper="Front content (question/cloze prompt).">
                        <textarea
                          value={editFront}
                          onChange={(e) => setEditFront(e.target.value)}
                          rows={4}
                          required
                        />
                      </Field>
                      <Field label="Back Side" helper="Back content (answer/explanation).">
                        <textarea
                          value={editBack}
                          onChange={(e) => setEditBack(e.target.value)}
                          rows={4}
                          required
                        />
                      </Field>
                      <Field label="Image URL (Optional)" helper="Optional web image URL.">
                        <input
                          type="text"
                          value={editImageUrl}
                          onChange={(e) => setEditImageUrl(e.target.value)}
                          placeholder="https://example.com/image.png"
                        />
                      </Field>
                      {editImageUrl && (
                        <div className="image-preview-box">
                          <img src={editImageUrl} alt="preview" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                        </div>
                      )}
                      <div className="form-actions">
                        <button type="submit" className="primary-action">
                          <Check size={16} /> Save Changes
                        </button>
                        <button type="button" className="secondary-action" onClick={() => setEditingCard(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {staffTab === 'decks' && (
          <div className="decks-tab-view">
            {editingDeck ? (
              <div className="panel inline-form-panel">
                <div className="form-header">
                  <h4>Edit Deck</h4>
                  <button className="close-btn" onClick={() => setEditingDeck(null)}>
                    <X size={18} />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!editDeckName.trim()) return
                    onUpdateDeck(editingDeck.id, editDeckName, editDeckDescription)
                    setEditingDeck(null)
                  }}
                >
                  <Field label="Deck Name" helper="The main title of the deck.">
                    <input
                      type="text"
                      value={editDeckName}
                      onChange={(e) => setEditDeckName(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Description" helper="Provide some context for what is inside this deck.">
                    <textarea
                      value={editDeckDescription}
                      onChange={(e) => setEditDeckDescription(e.target.value)}
                      rows={3}
                    />
                  </Field>
                  <div className="form-actions">
                    <button type="submit" className="primary-action">
                      <Check size={16} /> Save Deck
                    </button>
                    <button type="button" className="secondary-action" onClick={() => setEditingDeck(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="decks-layout-container">
                <div className="panel add-deck-panel">
                  <h4>Create New Deck</h4>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!newDeckName.trim()) return
                      onCreateDeck(newDeckName, newDeckDescription)
                      setNewDeckName('')
                      setNewDeckDescription('')
                    }}
                    className="card-form"
                  >
                    <Field label="Deck Name" helper="Topic name.">
                      <input
                        type="text"
                        placeholder="e.g. Hematology"
                        value={newDeckName}
                        onChange={(e) => setNewDeckName(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Description" helper="Optional details.">
                      <textarea
                        placeholder="Study of blood cells..."
                        value={newDeckDescription}
                        onChange={(e) => setNewDeckDescription(e.target.value)}
                        rows={2}
                      />
                    </Field>
                    <button type="submit" className="primary-action">
                      <Plus size={16} /> Create Deck
                    </button>
                  </form>
                </div>

                <div className="decks-manager-list">
                  <div className="decks-grid">
                    {state.decks.map((deck) => {
                      const totalCards = state.cards.filter((c) => c.deckId === deck.id).length
                      const dueCards = state.cards.filter(
                        (c) => c.deckId === deck.id && new Date(c.dueAt) <= new Date()
                      ).length
                      const isCurrentActive = activeDeckId === deck.id

                      return (
                        <div
                          key={deck.id}
                          className={`deck-manager-item ${isCurrentActive ? 'active' : ''}`}
                        >
                          <div className="deck-info">
                            <h5>{deck.name}</h5>
                            <p>{deck.description || 'No description provided.'}</p>
                            <div className="deck-stats-badges">
                              <span className="badge-total">{totalCards} cards</span>
                              <span className="badge-due">{dueCards} due now</span>
                            </div>
                          </div>
                          <div className="deck-actions">
                            <button
                              className="select-deck-btn"
                              onClick={() => setActiveDeckId(deck.id)}
                              disabled={isCurrentActive}
                            >
                              {isCurrentActive ? 'Active' : 'Set Active'}
                            </button>
                            <button
                              className="edit-btn"
                              onClick={() => {
                                setEditingDeck(deck)
                                setEditDeckName(deck.name)
                                setEditDeckDescription(deck.description)
                              }}
                            >
                              <Edit3 size={14} /> Edit
                            </button>
                            <button className="delete-btn" onClick={() => onDeleteDeck(deck.id)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {staffTab === 'backup' && (
          <div className="backup-tab-view">
            <div className="backup-manager-grid">
              <div className="panel backup-card">
                <h4>Data Operations</h4>
                <p className="backup-desc">
                  Backup, import, and edit decks in this browser first. Push or pull the shared bank when ready.
                </p>

                <div className="backup-actions">
                  <button onClick={onExport} className="export-action-btn">
                    <ArrowDownToLine size={18} /> Export JSON Backup
                  </button>

                  <label className="file-button import-action-btn">
                    <Upload size={18} /> Import JSON Backup
                    <input type="file" accept="application/json" onChange={onImport} />
                  </label>

                  <button onClick={onDownloadSample} className="sample-action-btn">
                    <ArrowDownToLine size={18} /> Download Sample JSON
                  </button>
                </div>
              </div>

              <div className="panel backup-card sync-status-card">
                <h4>Cloud Sync Status</h4>
                <p className="backup-desc">
                  Push writes this browser copy to Supabase. Pull replaces this browser copy with the latest Supabase bank.
                </p>

                <div className="backup-actions sync-actions">
                  <button onClick={onPullFromSupabase} disabled={isManualSyncing} className="pull-action-btn">
                    <ArrowDownToLine size={18} /> Pull from Supabase
                  </button>

                  <button onClick={onPushToSupabase} disabled={isManualSyncing} className="push-action-btn">
                    <Upload size={18} /> Push to Supabase
                  </button>
                </div>

                <div className="sync-info-box">
                  <div className="sync-indicator-row">
                    <span className={`sync-indicator-dot ${isOnlineReady ? 'active' : ''}`}></span>
                    <strong>Status: {syncLabel}</strong>
                  </div>
                  <p className="sync-detail-text">{syncDetail}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function StudyView({
  card,
  isAnswerVisible,
  hasCards,
  isRandomCard,
  isRandomMode,
  isFullscreen,
  onReveal,
  onReset,
  onRandom,
  onCancelRandom,
  onGrade,
  onToggleFullscreen,
}: {
  card?: Flashcard
  isAnswerVisible: boolean
  hasCards: boolean
  isRandomCard: boolean
  isRandomMode: boolean
  isFullscreen: boolean
  onReveal: () => void
  onReset: () => void
  onRandom: () => void
  onCancelRandom: () => void
  onGrade: (grade: ReviewGrade) => void
  onToggleFullscreen: () => void
}) {
  if (!card) {
    return (
      <section className="empty-state">
        <img
          className="empty-illustration"
          src={APP_ILLUSTRATION_URL}
          alt=""
        />
        <BookOpen size={42} strokeWidth={1.5} />
        <h3>Review queue clear</h3>
        <p>Add cards or come back when scheduled cards are due.</p>
        {hasCards && (
          <button className="secondary-action random-card-action" onClick={onRandom}>
            <Shuffle size={15} /> Random card <kbd>R</kbd>
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="study-grid">
      <article className="study-card">
        <div className="study-card-toolbar" aria-label="Study shortcuts">
          {isRandomMode && <span className="mode-pill">Random on</span>}
          <button className="secondary-action random-card-action" onClick={onRandom}>
            <Shuffle size={15} /> {isRandomMode ? 'Next random' : 'Random'} <kbd>R</kbd>
          </button>
          {(isRandomMode || isRandomCard) && (
            <button className="secondary-action cancel-random-action" onClick={onCancelRandom}>
              <X size={15} /> Cancel
            </button>
          )}
          <button
            className="secondary-action fullscreen-action"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <span className="shortcut-hint"><kbd>Space</kbd> reveal</span>
          <span className="shortcut-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> grade</span>
        </div>

        <div className="card-face card-face-front">
          <h3>{card.front}</h3>
          <FlashcardDataTable table={card.frontTable} />
        </div>

        {card.imageUrl && (
          <figure className="image-frame">
            <img src={card.imageUrl} alt="" />
          </figure>
        )}

        {isAnswerVisible ? (
          <div className="card-face answer">
            <p>{card.back}</p>
            <FlashcardDataTable table={card.backTable} />
          </div>
        ) : (
          <div className="answer-placeholder" aria-hidden="true" />
        )}

        <div className="study-controls">
          {isAnswerVisible ? (
            <div className="grade-grid">
              {(Object.keys(gradeLabels) as ReviewGrade[]).map((grade) => (
                <button key={grade} onClick={() => onGrade(grade)}>
                  <span>{gradeIntervals[grade]}</span>
                  <strong>
                    <kbd>{(Object.keys(gradeLabels) as ReviewGrade[]).indexOf(grade) + 1}</kbd>
                    {gradeLabels[grade]}
                  </strong>
                </button>
              ))}
            </div>
          ) : (
            <button className="reveal-button" onClick={onReveal}>
              Reveal answer
            </button>
          )}
          {isAnswerVisible && (
            <button className="secondary-action hide-answer-action" onClick={onReset}>
              <RotateCcw size={15} /> Hide answer
            </button>
          )}
        </div>
      </article>
    </section>
  )
}

function FlashcardDataTable({ table }: { table?: FlashcardTable }) {
  const columns = Array.isArray(table?.columns) ? table.columns : []
  const rows = Array.isArray(table?.rows) ? table.rows.filter((row) => Array.isArray(row)) : []
  if (!table || columns.length === 0 || rows.length === 0) return null

  return (
    <figure className="flashcard-table-wrap">
      {table.caption && <figcaption>{table.caption}</figcaption>}
      <div className="flashcard-table-scroll">
        <table className="flashcard-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-${index}`} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((_, cellIndex) => (
                  <td key={cellIndex}>{row[cellIndex] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note && <p className="flashcard-table-note">{table.note}</p>}
    </figure>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function GradeCount({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'new' | ReviewGrade
}) {
  return (
    <div className={`grade-count grade-count-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      <small>{helper}</small>
    </label>
  )
}

export default App
