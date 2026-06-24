const API = "/api";
const QUOTA_PAGE = "quota.html";
const COMPLETE_PAGE = "complete.html";
const NEXT_DELAY_MS = 900;
const QUESTION_TIME_SEC = 60;
const QUOTA_REDIRECT_SEC = 10;
const TEST_RETRY_SEC = 3;

function isTestMode() {
  return typeof MedQuizConfig !== "undefined" && MedQuizConfig.TEST_MODE;
}

function isAdminMode() {
  return MedQuizStorage.isAdminMode();
}

const cardEl = document.getElementById("card");
const statusEl = document.getElementById("status");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const timerEl = document.getElementById("timer");
const timerValueEl = document.getElementById("timerValue");

const badgeCategory = document.getElementById("badgeCategory");
const badgeDifficulty = document.getElementById("badgeDifficulty");
const titleEl = document.getElementById("title");
const questionEl = document.getElementById("question");
const hintEl = document.getElementById("hint");

const CATEGORY_LABELS = {
  math: "Mathematics",
  english: "English",
  logic: "Logic",
  coding: "Coding",
  pharmacology: "Pharmacology",
};

const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

let currentProblem = null;
let answered = false;
let timerIntervalId = null;
let quotaCountdownId = null;

let completedIds = MedQuizStorage.loadCompletedIds();

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setFeedback(message, type = "") {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${type}`.trim();
  feedbackEl.classList.remove("hidden");
}

function clearFeedback() {
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback hidden";
}

function disableChoices() {
  choicesEl.querySelectorAll(".choice").forEach((b) => {
    b.disabled = true;
  });
}

function stopQuestionTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function stopQuotaCountdown() {
  if (quotaCountdownId) {
    clearInterval(quotaCountdownId);
    quotaCountdownId = null;
  }
}

function updateTimerDisplay(seconds) {
  timerValueEl.textContent = String(seconds);
  timerEl.classList.toggle("timer--warn", seconds <= 10 && seconds > 0);
  timerEl.classList.toggle("timer--urgent", seconds <= 5 && seconds > 0);
}

function startQuestionTimer() {
  stopQuestionTimer();
  let remaining = QUESTION_TIME_SEC;
  updateTimerDisplay(remaining);
  timerEl.classList.remove("timer--paused");

  timerIntervalId = setInterval(() => {
    remaining -= 1;
    updateTimerDisplay(remaining);

    if (remaining <= 0) {
      stopQuestionTimer();
      handleTimeUp();
    }
  }, 1000);
}

function scheduleTestRetry(reasonText) {
  stopQuestionTimer();
  stopQuotaCountdown();
  timerEl.classList.add("timer--paused");

  let secLeft = TEST_RETRY_SEC;

  const updateMessage = () => {
    setFeedback(
      `${reasonText} (test mode)\nNext question in ${secLeft} seconds...`,
      "error"
    );
  };

  updateMessage();
  quotaCountdownId = setInterval(() => {
    secLeft -= 1;
    if (secLeft <= 0) {
      stopQuotaCountdown();
      timerEl.classList.remove("timer--paused");
      fetchNextQuestion();
      return;
    }
    updateMessage();
  }, 1000);
}

function scheduleQuotaRedirect(reasonText) {
  if (isTestMode()) {
    scheduleTestRetry(reasonText);
    return;
  }

  stopQuestionTimer();
  stopQuotaCountdown();
  timerEl.classList.add("timer--paused");

  let secLeft = QUOTA_REDIRECT_SEC;
  const adminNote = isAdminMode()
    ? "\n(Admin mode) You can use Skip limit on the next page."
    : "";

  const updateMessage = () => {
    setFeedback(
      `${reasonText}\nGoing to the limit page in ${secLeft} seconds...${adminNote}`,
      "error"
    );
  };

  updateMessage();
  quotaCountdownId = setInterval(() => {
    secLeft -= 1;
    if (secLeft <= 0) {
      stopQuotaCountdown();
      goToQuotaPage();
      return;
    }
    updateMessage();
  }, 1000);
}

function renderChoices(problem) {
  choicesEl.innerHTML = "";

  if (problem.type !== "mcq" || !problem.choices?.length) {
    const li = document.createElement("li");
    li.className = "choices-empty";
    li.textContent = "This question does not have choices yet.";
    choicesEl.appendChild(li);
    return;
  }

  for (const choice of problem.choices) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.dataset.choiceId = choice.id;
    btn.innerHTML = `<span class="choice-label">${choice.id.toUpperCase()}</span><span class="choice-text">${choice.text}</span>`;
    btn.addEventListener("click", () => submitChoice(choice.id, btn));
    li.appendChild(btn);
    choicesEl.appendChild(li);
  }
}

function markChoices(selectedId, correctId) {
  for (const btn of choicesEl.querySelectorAll(".choice")) {
    const id = btn.dataset.choiceId;
    btn.disabled = true;

    if (id === correctId) {
      btn.classList.add("correct");
    } else if (id === selectedId) {
      btn.classList.add("wrong");
    }
  }
}

function goToQuotaPage() {
  stopQuestionTimer();
  stopQuotaCountdown();
  let url = QUOTA_PAGE;
  if (window.location.search.includes('embed=1')) {
    url += '?embed=1';
  }
  window.location.href = url;
}

function goToCompletePage() {
  stopQuestionTimer();
  stopQuotaCountdown();
  let url = COMPLETE_PAGE;
  if (window.location.search.includes('embed=1')) {
    url += '?embed=1';
  }
  window.location.href = url;
}

function handleTimeUp() {
  if (!currentProblem || answered) return;

  answered = true;
  disableChoices();
  scheduleQuotaRedirect("Time limit reached");
}

async function submitChoice(choiceId, btn) {
  if (!currentProblem || answered) return;

  answered = true;
  stopQuestionTimer();
  disableChoices();
  btn.classList.add("selected");

  try {
    const res = await fetch(`${API}/problems/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentProblem.id, choice: choiceId }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not check the answer");
    }

    if (data.correct) {
      markChoices(choiceId, choiceId);
      setFeedback("Correct. Moving to the next question...", "ok");

      MedQuizStorage.incrementCorrectTotal();

      if (!completedIds.includes(currentProblem.id)) {
        completedIds.push(currentProblem.id);
        MedQuizStorage.saveCompletedIds(completedIds);
      }

      setTimeout(() => {
        fetchNextQuestion();
      }, NEXT_DELAY_MS);
      return;
    }

    markChoices(choiceId, data.correctChoice?.id);
    scheduleQuotaRedirect("Incorrect answer");
  } catch (err) {
    answered = false;
    choicesEl.querySelectorAll(".choice").forEach((b) => {
      b.disabled = false;
    });
    btn.classList.remove("selected");
    startQuestionTimer();
    setStatus(err.message, "error");
  }
}

function showProblem(problem) {
  stopQuotaCountdown();
  currentProblem = problem;
  answered = false;
  clearFeedback();
  setStatus("");

  cardEl.classList.remove("hidden");
  cardEl.classList.remove("show");
  void cardEl.offsetWidth;
  cardEl.classList.add("show");

  badgeCategory.textContent = CATEGORY_LABELS[problem.category] || problem.category;
  badgeDifficulty.textContent = DIFFICULTY_LABELS[problem.difficulty] || problem.difficulty;
  titleEl.textContent = problem.title;
  questionEl.textContent = problem.question;
  hintEl.textContent = problem.hint || "";
  renderChoices(problem);
  startQuestionTimer();
}

function shuffleDeckClient(ids) {
  const deck = [...ids];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

async function buildShuffledDeck() {
  const params = new URLSearchParams();
  if (completedIds.length) {
    params.set("exclude", completedIds.join(","));
  }

  const qs = params.toString();
  const shuffleUrl = `${API}/problems/shuffle${qs ? `?${qs}` : ""}`;
  const res = await fetch(shuffleUrl);
  const data = await res.json();

  if (res.status === 404 && data.code === "NO_MORE_QUESTIONS") {
    return null;
  }

  if (res.ok && Array.isArray(data.deck)) {
    MedQuizStorage.saveDeck(data.deck);
    return data.deck;
  }

  const idsRes = await fetch(`${API}/problems/ids`);
  const idsData = await idsRes.json();

  if (!idsRes.ok || !Array.isArray(idsData.ids)) {
    throw new Error(data.error || idsData.error || "Could not create a random set");
  }

  const excludeSet = new Set(completedIds);
  const remaining = idsData.ids.filter((id) => !excludeSet.has(id));

  if (remaining.length === 0) {
    return null;
  }

  const deck = shuffleDeckClient(remaining);
  MedQuizStorage.saveDeck(deck);
  return deck;
}

async function fetchProblemById(id) {
  const res = await fetch(`${API}/problems/${id}`);
  const data = await res.json();

  if (res.ok) {
    return data.problem;
  }

  const params = new URLSearchParams();
  if (completedIds.length) {
    params.set("exclude", completedIds.join(","));
  }
  const qs = params.toString();
  const fallback = await fetch(`${API}/problems/random${qs ? `?${qs}` : ""}`);
  const fallbackData = await fallback.json();

  if (!fallback.ok) {
    throw new Error(fallbackData.error || "Could not load the question");
  }

  return fallbackData.problem;
}

async function ensureDeck() {
  let deck = MedQuizStorage.loadDeck();
  if (deck.length > 0) return deck;
  return buildShuffledDeck();
}

async function fetchNextQuestion() {
  stopQuestionTimer();
  setStatus("Loading the next question...");

  try {
    const deck = await ensureDeck();

    if (!deck || deck.length === 0) {
      if (isTestMode()) {
        completedIds = [];
        MedQuizStorage.saveCompletedIds(completedIds);
        MedQuizStorage.clearDeck();
        setStatus("Test mode: starting a new question set...");
        fetchNextQuestion();
        return;
      }
      goToCompletePage();
      return;
    }

    const nextId = MedQuizStorage.popDeckId();
    if (nextId == null) {
      fetchNextQuestion();
      return;
    }

    const problem = await fetchProblemById(nextId);
    showProblem(problem);
  } catch (err) {
    setStatus(err.message, "error");
  }
}

fetchNextQuestion();
