import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  Image,
  KeyRound,
  Layers3,
  LogOut,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
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
import type { Flashcard, FlashcardState, ReviewGrade } from './lib/flashcards'
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
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [deckName, setDeckName] = useState('')
  const [deckDescription, setDeckDescription] = useState('')
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

  const handleCreateCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeDeckId || !front.trim() || !back.trim() || !isValidImageUrl(imageUrl)) return

    const nextCard = createCard({
      deckId: activeDeckId,
      front,
      back,
      imageUrl,
    })

    setState((current) => ({ ...current, cards: [nextCard, ...current.cards] }))
    setFront('')
    setBack('')
    setImageUrl('')
    setToast('Card added')
    setView('study')
  }

  const handleCreateDeck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deckName.trim()) return

    const nextDeck = createDeck(deckName, deckDescription)
    setState((current) => ({ ...current, decks: [...current.decks, nextDeck] }))
    setActiveDeckId(nextDeck.id)
    setDeckName('')
    setDeckDescription('')
    setToast('Deck created')
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
            onAdd={() => setView('add')}
            onDecks={() => setView('decks')}
            onExport={handleExport}
            onDownloadSample={handleDownloadSample}
            onImport={handleImport}
          />
        )}

        {view === 'add' && isStaffUnlocked && (
          <section className="panel">
            <form className="card-form" onSubmit={handleCreateCard}>
              <Field label="Front" helper="Question, prompt, or cloze cue.">
                <textarea value={front} onChange={(event) => setFront(event.target.value)} rows={5} />
              </Field>
              <Field label="Back" helper="Answer, explanation, or key fact.">
                <textarea value={back} onChange={(event) => setBack(event.target.value)} rows={6} />
              </Field>
              <Field label="Image link" helper="Optional. Use http or https image URL.">
                <div className="input-with-icon">
                  <Image size={18} />
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="https://example.com/image.png"
                  />
                </div>
                {!isValidImageUrl(imageUrl) && <p className="error-text">Use valid http or https URL.</p>}
              </Field>
              <button className="primary-action" type="submit">
                <Plus size={18} /> Add card
              </button>
            </form>
          </section>
        )}

        {view === 'decks' && isStaffUnlocked && (
          <section className="deck-layout">
            <form className="panel card-form" onSubmit={handleCreateDeck}>
              <Field label="Deck name" helper="Topic or exam set.">
                <input value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </Field>
              <Field label="Description" helper="Optional context for this deck.">
                <textarea
                  value={deckDescription}
                  onChange={(event) => setDeckDescription(event.target.value)}
                  rows={4}
                />
              </Field>
              <button className="primary-action" type="submit">
                <Plus size={18} /> Create deck
              </button>
            </form>

            <div className="deck-list">
              {state.decks.map((deck) => {
                const stats = getDeckStats(state, deck.id)
                return (
                  <button
                    key={deck.id}
                    className={deck.id === activeDeckId ? 'deck-card active' : 'deck-card'}
                    onClick={() => {
                      setActiveDeckId(deck.id)
                      setView('study')
                    }}
                  >
                    <span>{deck.name}</span>
                    <small>{deck.description || 'No description'}</small>
                    <strong>
                      {stats.due} due / {stats.total} cards
                    </strong>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {(view === 'add' || view === 'decks') && !isStaffUnlocked && (
          <StaffView
            isUnlocked={false}
            password={staffPassword}
            onPasswordChange={setStaffPassword}
            onLogin={handleStaffLogin}
            onAdd={() => setView('add')}
            onDecks={() => setView('decks')}
            onExport={handleExport}
            onDownloadSample={handleDownloadSample}
            onImport={handleImport}
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
  onAdd,
  onDecks,
  onExport,
  onDownloadSample,
  onImport,
}: {
  isUnlocked: boolean
  password: string
  onPasswordChange: (value: string) => void
  onLogin: (event: FormEvent<HTMLFormElement>) => void
  onAdd: () => void
  onDecks: () => void
  onExport: () => void
  onDownloadSample: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
}) {
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

  return (
    <section className="panel staff-panel">
      <div className="staff-intro">
        <ShieldCheck size={28} />
        <div>
          <p className="label">Staff tools</p>
          <h3>Manage study content</h3>
          <p>Add cards, organize decks, or move data with JSON import and export.</p>
        </div>
      </div>

      <div className="staff-action-grid">
        <button onClick={onAdd}>
          <Plus size={18} /> Add card
        </button>
        <button onClick={onDecks}>
          <Layers3 size={18} /> Manage decks
        </button>
        <button onClick={onExport}>
          <ArrowDownToLine size={18} /> Export JSON
        </button>
        <button className="staff-action-small" onClick={onDownloadSample}>
          <ArrowDownToLine size={16} /> Sample JSON
        </button>
        <label className="file-button">
          <Upload size={18} /> Import JSON
          <input type="file" accept="application/json" onChange={onImport} />
        </label>
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
