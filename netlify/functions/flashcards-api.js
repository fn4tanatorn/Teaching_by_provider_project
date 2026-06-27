const { connectLambda, getStore } = require("@netlify/blobs");
const fs = require("fs/promises");
const path = require("path");

const STORE_NAME = "flashcards";
const BANK_KEY = "shared-bank.json";
const LOCAL_BANK_PATH = path.join(process.cwd(), ".netlify", "flashcards-bank.local.json");
const DEFAULT_STAFF_CODE = "admin061";
const EMPTY_BANK = { decks: [], cards: [] };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Staff-Code",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body || !String(event.body).trim()) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON");
    err.status = 400;
    throw err;
  }
}

function staffCode(event) {
  const headers = event.headers || {};
  return headers["x-staff-code"] || headers["X-Staff-Code"] || headers["X-STAFF-CODE"] || "";
}

function expectedStaffCode() {
  return process.env.FLASHCARDS_STAFF_CODE || DEFAULT_STAFF_CODE;
}

function normalizeDate(value) {
  return typeof value === "string" && value ? value : new Date().toISOString();
}

function normalizeNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeDeck(deck) {
  return {
    id: String(deck?.id || ""),
    name: String(deck?.name || "").trim(),
    description: String(deck?.description || "").trim(),
    createdAt: normalizeDate(deck?.createdAt),
  };
}

function normalizeCard(card) {
  return {
    id: String(card?.id || ""),
    deckId: String(card?.deckId || ""),
    front: String(card?.front || "").trim(),
    back: String(card?.back || "").trim(),
    imageUrl: String(card?.imageUrl || "").trim(),
    createdAt: normalizeDate(card?.createdAt),
    updatedAt: normalizeDate(card?.updatedAt),
    dueAt: normalizeDate(card?.dueAt),
    intervalDays: normalizeNumber(card?.intervalDays, 0),
    ease: normalizeNumber(card?.ease, 2.5),
    reps: normalizeNumber(card?.reps, 0),
    lapses: normalizeNumber(card?.lapses, 0),
  };
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : {};
  const decks = Array.isArray(state.decks)
    ? state.decks.map(normalizeDeck).filter((deck) => deck.id && deck.name)
    : [];
  const deckIds = new Set(decks.map((deck) => deck.id));
  const cards = Array.isArray(state.cards)
    ? state.cards
        .map(normalizeCard)
        .filter((card) => card.id && card.deckId && deckIds.has(card.deckId) && card.front && card.back)
    : [];

  return { decks, cards };
}

function store() {
  return getStore({
    name: STORE_NAME,
    consistency: "strong",
  });
}

function canUseLocalFallback() {
  return !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

async function loadLocalBank() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_BANK_PATH, "utf8"));
  } catch {
    return EMPTY_BANK;
  }
}

async function saveLocalBank(state) {
  await fs.mkdir(path.dirname(LOCAL_BANK_PATH), { recursive: true });
  await fs.writeFile(LOCAL_BANK_PATH, JSON.stringify(state, null, 2));
}

function connectBlobContext(event) {
  if (event?.blobs) connectLambda(event);
}

async function loadBank() {
  if (canUseLocalFallback()) return loadLocalBank();
  return (await store().get(BANK_KEY, { type: "json" })) || EMPTY_BANK;
}

async function saveBank(state) {
  if (canUseLocalFallback()) {
    await saveLocalBank(state);
    return;
  }

  await store().setJSON(BANK_KEY, state);
}

exports.handler = async (event) => {
  try {
    connectBlobContext(event);

    if (event.httpMethod === "OPTIONS") return json(204, {});

    if (event.httpMethod === "GET") {
      const state = normalizeState(await loadBank());
      return json(200, { state });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      if (staffCode(event) !== expectedStaffCode()) {
        return json(401, { error: "Wrong staff code." });
      }

      const state = normalizeState(body.state);
      await saveBank(state);
      return json(200, { state });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Flashcard bank error." });
  }
};
