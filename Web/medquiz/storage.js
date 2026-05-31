const MedQuizStorage = {
  SESSION_COMPLETED: "medquiz_completed",
  SESSION_DECK: "medquiz_deck",
  CORRECT_TOTAL: "medquiz_correct_total",
  ADMIN_MODE: "medquiz_admin_mode",

  loadCompletedIds() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_COMPLETED);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveCompletedIds(ids) {
    sessionStorage.setItem(this.SESSION_COMPLETED, JSON.stringify(ids));
  },

  loadDeck() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_DECK);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveDeck(deck) {
    sessionStorage.setItem(this.SESSION_DECK, JSON.stringify(deck));
  },

  popDeckId() {
    const deck = this.loadDeck();
    if (deck.length === 0) return null;
    const id = deck.shift();
    this.saveDeck(deck);
    return id;
  },

  clearDeck() {
    sessionStorage.removeItem(this.SESSION_DECK);
  },

  clearSession() {
    sessionStorage.removeItem(this.SESSION_COMPLETED);
    this.clearDeck();
  },

  loadCorrectTotal() {
    const n = parseInt(localStorage.getItem(this.CORRECT_TOTAL) || "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },

  incrementCorrectTotal() {
    const next = this.loadCorrectTotal() + 1;
    localStorage.setItem(this.CORRECT_TOTAL, String(next));
    return next;
  },

  clearCorrectTotal() {
    localStorage.removeItem(this.CORRECT_TOTAL);
  },

  clearAll() {
    this.clearSession();
    this.clearCorrectTotal();
  },

  isAdminMode() {
    return localStorage.getItem(this.ADMIN_MODE) === "1";
  },

  setAdminMode(enabled) {
    if (enabled) {
      localStorage.setItem(this.ADMIN_MODE, "1");
    } else {
      localStorage.removeItem(this.ADMIN_MODE);
    }
  },

  toggleAdminMode() {
    this.setAdminMode(!this.isAdminMode());
    return this.isAdminMode();
  },
};
