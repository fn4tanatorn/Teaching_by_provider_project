import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  KeyRound,
  Layers3,
  LogOut,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
  Edit3,
  Trash2,
  Search,
  X,
} from 'lucide-react'
import {
  APP_ILLUSTRATION_URL,
  createCard,
  createDeck,
  getDeckStats,
  getDueCards,
  isValidImageUrl,
  loadState,
  saveState,
  scheduleReview,
} from './lib/flashcards'
import type { Deck, Flashcard, FlashcardState, ReviewGrade } from './lib/flashcards'
import { fetchOnlineState, initFlashcardStore, saveOnlineState } from './lib/onlineFlashcards'
import type { FlashcardStore } from './lib/onlineFlashcards'

type View = 'study' | 'staff' | 'add' | 'decks'

const STAFF_PASSWORD = 'admin061'

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

const onlineStore = (store: FlashcardStore | null) => (store?.mode === 'online' ? store : null)

function App() {
  const [state, setState] = useState<FlashcardState>(() => loadState())
  const [activeDeckId, setActiveDeckId] = useState(() => state.decks[0]?.id ?? '')
  const [view, setView] = useState<View>('study')
  const [isAnswerVisible, setIsAnswerVisible] = useState(false)

  const [staffPassword, setStaffPassword] = useState('')
  const [isStaffUnlocked, setIsStaffUnlocked] = useState(false)
  const [toast, setToast] = useState('')
  const [store, setStore] = useState<FlashcardStore | null>(null)
  const [isOnlineReady, setIsOnlineReady] = useState(false)
  const [syncLabel, setSyncLabel] = useState('Checking sync')
  const [syncDetail, setSyncDetail] = useState('Looking for a Supabase session.')

  useEffect(() => {
    saveState(state)
  }, [state])

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
        const onlineState = await fetchOnlineState(nextStore)
        if (!isMounted) return

        const nextState = onlineState.decks.length > 0 ? onlineState : state
        if (onlineState.decks.length === 0) {
          await saveOnlineState(nextStore, nextState)
        }

        setState(nextState)
        setActiveDeckId(nextState.decks[0]?.id ?? '')
        setIsOnlineReady(true)
        setSyncLabel('Synced online')
        setSyncDetail('Flashcards are saved to Supabase for this signed-in user.')
      } catch (error) {
        setIsOnlineReady(false)
        setSyncLabel('Local only')
        setSyncDetail(error instanceof Error ? error.message : 'Run supabase/flashcards.sql first.')
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
    const currentStore = onlineStore(store)
    if (!isOnlineReady || !currentStore) return

    setSyncLabel('Saving')
    const saveTimer = window.setTimeout(() => {
      void saveOnlineState(currentStore, state)
        .then(() => {
          setSyncLabel('Synced online')
          setSyncDetail('Flashcards are saved to Supabase for this signed-in user.')
        })
        .catch((error: unknown) => {
          setSyncLabel('Sync failed')
          setSyncDetail(error instanceof Error ? error.message : 'Could not save flashcards online.')
        })
    }, 500)

    return () => window.clearTimeout(saveTimer)
  }, [isOnlineReady, state, store])

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

  const currentCard = dueCards[0]
  const activeStats = activeDeckId ? getDeckStats(state, activeDeckId) : null
  const cardCount = state.cards.filter((card) => card.deckId === activeDeckId).length

  const updateCard = (card: Flashcard) => {
    setState((current) => ({
      ...current,
      cards: current.cards.map((item) => (item.id === card.id ? card : item)),
    }))
  }

  const handleGrade = (grade: ReviewGrade) => {
    if (!currentCard) return
    updateCard(scheduleReview(currentCard, grade))
    setIsAnswerVisible(false)
    setToast(`Card scheduled: ${gradeLabels[grade]}`)
  }



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

    setState((current) => ({ ...current, cards: [nextCard, ...current.cards] }))
    setToast('Card added')
  }

  const handleUpdateCard = (cardId: string, updatedFront: string, updatedBack: string, updatedImageUrl: string, updatedDeckId: string) => {
    if (!isValidImageUrl(updatedImageUrl)) {
      setToast('Use valid http or https URL.')
      return
    }

    setState((current) => ({
      ...current,
      cards: current.cards.map((card) =>
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
    }))
    setToast('Card updated')
  }

  const handleDeleteCard = (cardId: string) => {
    if (!window.confirm('Are you sure you want to delete this card?')) return
    setState((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
    }))
    setToast('Card deleted')
  }

  const handleCreateDeckInline = (name: string, description: string) => {
    const nextDeck = createDeck(name, description)
    setState((current) => ({ ...current, decks: [...current.decks, nextDeck] }))
    setToast('Deck created')
  }

  const handleUpdateDeck = (deckId: string, updatedName: string, updatedDescription: string) => {
    setState((current) => ({
      ...current,
      decks: current.decks.map((deck) =>
        deck.id === deckId
          ? {
              ...deck,
              name: updatedName.trim(),
              description: updatedDescription.trim(),
            }
          : deck
      ),
    }))
    setToast('Deck updated')
  }

  const handleDeleteDeck = (deckId: string) => {
    const deckCardsCount = state.cards.filter((card) => card.deckId === deckId).length
    const confirmMessage = deckCardsCount > 0
      ? `Are you sure you want to delete this deck? This will also permanently delete all ${deckCardsCount} cards inside it!`
      : 'Are you sure you want to delete this deck?'

    if (!window.confirm(confirmMessage)) return

    setState((current) => ({
      ...current,
      decks: current.decks.filter((deck) => deck.id !== deckId),
      cards: current.cards.filter((card) => card.deckId !== deckId),
    }))

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
    const deckId = 'sample-deck-medicine-review'
    const createdAt = new Date().toISOString()
    const sampleState: FlashcardState = {
      decks: [
        {
          id: deckId,
          name: 'Sample medicine deck',
          description: 'Example JSON for flashcard import.',
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
    const blob = new Blob([JSON.stringify(sampleState, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'flashcards-import-sample.json'
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
      setState(nextState)
      setActiveDeckId(nextState.decks[0]?.id ?? '')
      setToast('Import complete')
    } catch {
      setToast('Import failed')
    } finally {
      event.target.value = ''
    }
  }

  const handleStaffLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (staffPassword !== STAFF_PASSWORD) {
      setToast('Wrong staff code')
      return
    }

    setIsStaffUnlocked(true)
    setStaffPassword('')
    setToast('Staff unlocked')
  }

  const handleStaffLogout = () => {
    setIsStaffUnlocked(false)
    setView('study')
    setToast('Staff locked')
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
          <button className={view === 'study' ? 'active' : ''} onClick={() => setView('study')}>
            <BookOpen size={18} /> Study
          </button>
          <button
            className={view === 'staff' || view === 'add' || view === 'decks' ? 'active' : ''}
            onClick={() => setView('staff')}
          >
            <ShieldCheck size={18} /> Staff
          </button>
        </nav>

        <div className="deck-picker">
          <label htmlFor="deck-select">Active deck</label>
          <select
            id="deck-select"
            value={activeDeckId}
            onChange={(event) => {
              setActiveDeckId(event.target.value)
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

        {view === 'study' && activeStats && activeStats.total > 0 && (
          <button className="reset-progress-button" onClick={handleResetDeckProgress}>
            <RotateCcw size={14} /> Clear progress
          </button>
        )}

        <div className="sync-pill" title={syncDetail}>
          <span className={isOnlineReady ? 'sync-dot online' : 'sync-dot'} />
          {syncLabel}
        </div>

        {isStaffUnlocked && (
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
            onReveal={() => setIsAnswerVisible(true)}
            onReset={() => setIsAnswerVisible(false)}
            onGrade={handleGrade}
          />
        )}

        {view === 'staff' && (
          <StaffView
            isUnlocked={isStaffUnlocked}
            password={staffPassword}
            onPasswordChange={setStaffPassword}
            onLogin={handleStaffLogin}
            state={state}
            activeDeckId={activeDeckId}
            setActiveDeckId={setActiveDeckId}
            onAddCard={handleAddCard}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
            onCreateDeck={handleCreateDeckInline}
            onUpdateDeck={handleUpdateDeck}
            onDeleteDeck={handleDeleteDeck}
            onExport={handleExport}
            onDownloadSample={handleDownloadSample}
            onImport={handleImport}
            syncLabel={syncLabel}
            syncDetail={syncDetail}
            isOnlineReady={isOnlineReady}
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
  password,
  onPasswordChange,
  onLogin,
  state,
  activeDeckId,
  setActiveDeckId,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onCreateDeck,
  onUpdateDeck,
  onDeleteDeck,
  onExport,
  onDownloadSample,
  onImport,
  syncLabel,
  syncDetail,
  isOnlineReady,
}: {
  isUnlocked: boolean
  password: string
  onPasswordChange: (value: string) => void
  onLogin: (event: FormEvent<HTMLFormElement>) => void
  state: FlashcardState
  activeDeckId: string
  setActiveDeckId: (id: string) => void
  onAddCard: (front: string, back: string, imageUrl: string, deckId: string) => void
  onUpdateCard: (cardId: string, front: string, back: string, imageUrl: string, deckId: string) => void
  onDeleteCard: (cardId: string) => void
  onCreateDeck: (name: string, description: string) => void
  onUpdateDeck: (deckId: string, name: string, description: string) => void
  onDeleteDeck: (deckId: string) => void
  onExport: () => void
  onDownloadSample: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  syncLabel: string
  syncDetail: string
  isOnlineReady: boolean
}) {
  const [staffTab, setStaffTab] = useState<'cards' | 'decks' | 'backup'>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDeckId, setFilterDeckId] = useState('all')

  // Add Card Form State
  const [isAddingCard, setIsAddingCard] = useState(false)
  const [newFront, setNewFront] = useState('')
  const [newBack, setNewBack] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newDeckId, setNewDeckId] = useState(activeDeckId || state.decks[0]?.id || '')

  // Edit Card Form State
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editDeckId, setEditDeckId] = useState('')

  // Edit Deck Form State
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null)
  const [editDeckName, setEditDeckName] = useState('')
  const [editDeckDescription, setEditDeckDescription] = useState('')

  // Create Deck Form State
  const [newDeckName, setNewDeckName] = useState('')
  const [newDeckDescription, setNewDeckDescription] = useState('')

  if (!isUnlocked) {
    return (
      <section className="panel staff-panel">
        <div className="staff-intro">
          <KeyRound size={28} />
          <div>
            <p className="label">Staff only</p>
            <h3>Enter staff code</h3>
            <p>Card creation, deck management, import, and export stay behind this screen.</p>
          </div>
        </div>
        <form className="staff-login" onSubmit={onLogin}>
          <label className="field">
            <span>Staff code</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
            <small>Ask staff for access.</small>
          </label>
          <button className="primary-action" type="submit">
            <ShieldCheck size={18} /> Unlock
          </button>
        </form>
      </section>
    )
  }

  const filteredCards = state.cards.filter((card) => {
    const matchesDeck = filterDeckId === 'all' || card.deckId === filterDeckId
    const matchesSearch =
      card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.back.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesDeck && matchesSearch
  })

  return (
    <section className="staff-dashboard">
      <div className="staff-tabs">
        <button
          className={staffTab === 'cards' ? 'active' : ''}
          onClick={() => {
            setStaffTab('cards')
            setEditingCard(null)
            setIsAddingCard(false)
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
            {!isAddingCard && !editingCard && (
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
            )}

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
                    setIsAddingCard(false)
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

            {editingCard && (
              <div className="panel inline-form-panel">
                <div className="form-header">
                  <h4>Edit Card</h4>
                  <button className="close-btn" onClick={() => setEditingCard(null)}>
                    <X size={18} />
                  </button>
                </div>
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
                      rows={3}
                      required
                    />
                  </Field>
                  <Field label="Back Side" helper="Back content (answer/explanation).">
                    <textarea
                      value={editBack}
                      onChange={(e) => setEditBack(e.target.value)}
                      rows={3}
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
                  <div className="form-actions">
                    <button type="submit" className="primary-action">
                      <Check size={16} /> Save Changes
                    </button>
                    <button type="button" className="secondary-action" onClick={() => setEditingCard(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {!isAddingCard && !editingCard && (
              <div className="cards-manager-list">
                {filteredCards.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No cards match the current search or filters.</p>
                  </div>
                ) : (
                  <div className="backend-cards-grid">
                    {filteredCards.map((card) => {
                      const deck = state.decks.find((d) => d.id === card.deckId)
                      return (
                        <div key={card.id} className="backend-card-item">
                          <div className="backend-card-info">
                            <span className="deck-badge">{deck?.name || 'Unknown Deck'}</span>
                            <div className="card-text-preview">
                              <strong>Front:</strong>
                              <p>{card.front}</p>
                            </div>
                            <div className="card-text-preview">
                              <strong>Back:</strong>
                              <p>{card.back}</p>
                            </div>
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
                            <button
                              className="edit-btn"
                              onClick={() => {
                                setEditingCard(card)
                                setEditFront(card.front)
                                setEditBack(card.back)
                                setEditImageUrl(card.imageUrl)
                                setEditDeckId(card.deckId)
                                setIsAddingCard(false)
                              }}
                            >
                              <Edit3 size={14} /> Edit
                            </button>
                            <button className="delete-btn" onClick={() => onDeleteCard(card.id)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                  Backup your entire study state including cards, decks, and intervals. You can import it back at any time.
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
                  Your progress is saved locally. If you configure Supabase credentials, your cards sync to the cloud.
                </p>

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
  onReveal,
  onReset,
  onGrade,
}: {
  card?: Flashcard
  isAnswerVisible: boolean
  onReveal: () => void
  onReset: () => void
  onGrade: (grade: ReviewGrade) => void
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
      </section>
    )
  }

  return (
    <section className="study-grid">
      <article className="study-card">
        <div className="card-face card-face-front">
          <h3>{card.front}</h3>
        </div>

        {card.imageUrl && (
          <figure className="image-frame">
            <img src={card.imageUrl} alt="" />
          </figure>
        )}

        {isAnswerVisible ? (
          <div className="card-face answer">
            <p>{card.back}</p>
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
                  <strong>{gradeLabels[grade]}</strong>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
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
