const { connectLambda, getStore } = require("@netlify/blobs");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const STORE_NAME = "flashcards";
const BANK_KEY = "shared-bank.json";
const SUPABASE_BANK_TABLE = "flashcard_shared_bank";
const SUPABASE_BANK_ID = "shared";
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

function readSupabaseConfigFile() {
  const paths = [
    path.join(__dirname, "../..", "Web", "js", "supabase-config.js"),
    path.join(__dirname, "..", "Web", "js", "supabase-config.js"),
    path.join(process.cwd(), "Web", "js", "supabase-config.js"),
  ];
  const localPaths = [
    path.join(__dirname, "../..", "Web", "js", "supabase-config.local.js"),
    path.join(__dirname, "..", "Web", "js", "supabase-config.local.js"),
    path.join(process.cwd(), "Web", "js", "supabase-config.local.js"),
  ];

  let configContent = "";
  for (const configPath of [...paths, ...localPaths]) {
    try {
      if (fsSync.existsSync(configPath)) {
        configContent += `\n${fsSync.readFileSync(configPath, "utf8")}`;
      }
    } catch {
      // File config is a convenience fallback only.
    }
  }

  const urlMatch = configContent.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
  const keyMatch = configContent.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);
  return {
    url: urlMatch ? urlMatch[1] : "",
    anonKey: keyMatch ? keyMatch[1] : "",
  };
}

function getSupabaseConfig() {
  const fileConfig = readSupabaseConfigFile();
  return {
    url: process.env.SUPABASE_URL || fileConfig.url,
    anonKey: process.env.SUPABASE_ANON_KEY || fileConfig.anonKey,
    serviceKey:
      process.env.FLASHCARDS_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "",
  };
}

function hasSupabaseRead(config) {
  return Boolean(
    config.url &&
      config.anonKey &&
      !String(config.url).includes("YOUR_PROJECT") &&
      !String(config.anonKey).includes("YOUR_ANON"),
  );
}

function hasSupabaseWrite(config) {
  return hasSupabaseRead(config) && Boolean(config.serviceKey);
}

async function requestSupabase(config, pathAndQuery, init = {}, useServiceRole = false) {
  const key = useServiceRole ? config.serviceKey : config.anonKey;
  const response = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase flashcard bank request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
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

async function loadBlobBank() {
  if (canUseLocalFallback()) return loadLocalBank();
  return (await store().get(BANK_KEY, { type: "json" })) || EMPTY_BANK;
}

async function saveBlobBank(state) {
  if (canUseLocalFallback()) {
    await saveLocalBank(state);
    return;
  }

  await store().setJSON(BANK_KEY, state);
}

async function loadSupabaseBank(config) {
  const rows = await requestSupabase(
    config,
    `${SUPABASE_BANK_TABLE}?id=eq.${encodeURIComponent(SUPABASE_BANK_ID)}&select=state&limit=1`,
  );
  return normalizeState(Array.isArray(rows) && rows[0] ? rows[0].state : EMPTY_BANK);
}

async function saveSupabaseBank(config, state) {
  await requestSupabase(
    config,
    `${SUPABASE_BANK_TABLE}?on_conflict=id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: SUPABASE_BANK_ID,
        state: normalizeState(state),
        updated_at: new Date().toISOString(),
      }),
    },
    true,
  );
}

async function loadBank() {
  const config = getSupabaseConfig();
  if (hasSupabaseRead(config)) {
    try {
      const supabaseState = await loadSupabaseBank(config);
      if ((supabaseState.decks.length > 0 || supabaseState.cards.length > 0) || !hasSupabaseWrite(config)) {
        return { state: supabaseState, source: "supabase" };
      }

      const fallbackState = normalizeState(await loadBlobBank());
      if (fallbackState.decks.length > 0 || fallbackState.cards.length > 0) {
        await saveSupabaseBank(config, fallbackState);
        return { state: fallbackState, source: "supabase" };
      }

      return { state: supabaseState, source: "supabase" };
    } catch (error) {
      console.warn("[Flashcards] Supabase bank read failed; using blob/local fallback.", error.message || error);
    }
  }

  return { state: normalizeState(await loadBlobBank()), source: canUseLocalFallback() ? "local" : "blob" };
}

async function saveBank(state) {
  const config = getSupabaseConfig();
  if (hasSupabaseWrite(config)) {
    try {
      await saveSupabaseBank(config, state);
      await saveBlobBank(state).catch((error) => {
        console.warn("[Flashcards] Blob mirror write failed.", error.message || error);
      });
      return { source: "supabase" };
    } catch (error) {
      console.warn("[Flashcards] Supabase bank write failed; using blob/local fallback.", error.message || error);
    }
  }

  await saveBlobBank(state);
  return { source: canUseLocalFallback() ? "local" : "blob" };
}

exports.handler = async (event) => {
  try {
    connectBlobContext(event);

    if (event.httpMethod === "OPTIONS") return json(204, {});

    if (event.httpMethod === "GET") {
      const bank = await loadBank();
      return json(200, { state: normalizeState(bank.state), source: bank.source });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      if (staffCode(event) !== expectedStaffCode()) {
        return json(401, { error: "Wrong staff code." });
      }

      const state = normalizeState(body.state);
      const bank = await saveBank(state);
      return json(200, { state, source: bank.source });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Flashcard bank error." });
  }
};
