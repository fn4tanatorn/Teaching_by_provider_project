const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { connectLambda, getStore } = require("@netlify/blobs");

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) return { url, key };

  // Try different potential config file paths relative to __dirname and process.cwd()
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
  try {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        configContent += fs.readFileSync(p, "utf8");
        break;
      }
    }
    for (const p of localPaths) {
      if (fs.existsSync(p)) {
        configContent += fs.readFileSync(p, "utf8");
        break;
      }
    }
  } catch (err) {
    console.error("Could not read Supabase config file", err);
  }

  const urlMatch = configContent.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
  const keyMatch = configContent.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

  return {
    url: urlMatch ? urlMatch[1] : "",
    key: keyMatch ? keyMatch[1] : ""
  };
}

async function saveResultsToSupabase(room) {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    console.warn("[LiveQuiz] Supabase is not configured. Skipping saving results.");
    return;
  }

  const participants = room.participants.filter((p) => !p.kickedAt);
  if (!participants.length) return;

  const payloads = participants.map((participant) => ({
    room_code: room.code,
    participant_name: participant.username,
    score: scoreFor(room, participant.id)
  }));

  try {
    const response = await fetch(`${config.url}/rest/v1/livequiz_results`, {
      method: "POST",
      headers: {
        "apikey": config.key,
        "Authorization": `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payloads)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("[LiveQuiz] Failed to save results to Supabase:", response.status, errText);
    } else {
      console.log(`[LiveQuiz] Successfully saved ${payloads.length} participant results to Supabase.`);
    }
  } catch (err) {
    console.error("[LiveQuiz] Error saving results to Supabase:", err);
  }
}

const STORE_NAME = "livequiz";
const STATE_KEY = "rooms.json";
const LOCAL_STATE_PATH = path.join(process.cwd(), ".netlify", "livequiz.local.json");
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_LOCK_MS = 75 * 1000;
const HEARTBEAT_WRITE_MS = 15 * 1000;
const CHOICE_IDS = ["A", "B", "C", "D", "E"];
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Host-Token, X-Participant-Token",
};

function nowIso() {
  return new Date().toISOString();
}

function uid(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeQuestionType(value) {
  return String(value || "mcq").trim().toLowerCase() === "short_answer" ? "short_answer" : "mcq";
}

function answerKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[()[\]{}.,;:!?'"`]/g, "")
    .replace(/\s+/g, " ");
}

function parseAcceptedAnswers(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/);
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function textAnswerIsCorrect(answerText, acceptedAnswers) {
  const submitted = answerKey(answerText);
  if (!submitted) return false;
  return acceptedAnswers.some((answer) => answerKey(answer) === submitted);
}

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function csv(statusCode, body, filename) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body,
  };
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseBody(event) {
  if (!event.body || !String(event.body).trim()) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError("Invalid JSON", 400);
  }
}

function routePath(event) {
  const fromQuery = event.queryStringParameters?.path || "";
  if (fromQuery) return `/${String(fromQuery).replace(/^\/+/, "")}`;
  return String(event.path || "")
    .replace(/^\/\.netlify\/functions\/livequiz-api\/?/, "/")
    .replace(/^\/livequiz\/api\/?/, "/")
    .replace(/^$/, "/");
}

function queryToken(event, headerName, queryName) {
  const headers = event.headers || {};
  const header = headers[headerName] || headers[headerName.toLowerCase()] || headers[headerName.toUpperCase()];
  return header || event.queryStringParameters?.[queryName] || "";
}

function store() {
  return getStore({ name: STORE_NAME, consistency: "eventual" });
}

function canUseLocalFallback() {
  return !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function readLocalState() {
  try {
    const state = JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, "utf8"));
    return state && Array.isArray(state.rooms) ? state : { rooms: [] };
  } catch {
    return { rooms: [] };
  }
}

function writeLocalState(state) {
  fs.mkdirSync(path.dirname(LOCAL_STATE_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_STATE_PATH, JSON.stringify(state, null, 2));
}

async function loadState() {
  if (canUseLocalFallback()) return { state: readLocalState(), etag: null };

  const entry = await store().getWithMetadata(STATE_KEY, { type: "json" });
  const state = entry?.data && Array.isArray(entry.data.rooms) ? entry.data : { rooms: [] };
  return { state, etag: entry?.etag || null };
}

async function saveState(state, etag) {
  if (canUseLocalFallback()) {
    writeLocalState(state);
    return true;
  }

  const result = etag
    ? await store().setJSON(STATE_KEY, state, { onlyIfMatch: etag })
    : await store().setJSON(STATE_KEY, state, { onlyIfNew: true });
  return result.modified;
}

function cleanupExpiredRooms(rooms) {
  const now = Date.now();
  let changed = false;
  for (const [code, room] of rooms.entries()) {
    if (now > Date.parse(room.expiresAt)) {
      rooms.delete(code);
      changed = true;
    }
  }
  return changed;
}

function cleanupPresence(room) {
  const now = Date.now();
  let changed = false;
  for (const participant of room.participants) {
    if (participant.kickedAt) continue;
    const active = now - Date.parse(participant.lastHeartbeatAt) <= STALE_LOCK_MS;
    if (participant.active !== active) {
      participant.active = active;
      changed = true;
    }
  }
  return changed;
}

function tickRoom(room) {
  if (room.state !== "question_active" || !room.endsAt || Date.now() < Date.parse(room.endsAt)) {
    return false;
  }

  const question = room.questions[room.currentQuestionIndex];
  if (question && question.state !== "voided") question.state = "revealed";
  room.state = "question_reveal";
  room.revealedAt = nowIso();
  return true;
}

function markRoomDirty(room) {
  Object.defineProperty(room, "__dirty", {
    value: true,
    enumerable: false,
    configurable: true,
  });
}

function roomsMap(state) {
  return new Map((state.rooms || []).map((room) => [room.code, room]));
}

function serializeRooms(rooms) {
  for (const room of rooms.values()) delete room.__dirty;
  return { rooms: [...rooms.values()] };
}

async function withState(mutator) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { state, etag } = await loadState();
    const rooms = roomsMap(state);
    let changed = cleanupExpiredRooms(rooms);
    const result = await mutator(rooms, () => {
      changed = true;
    });

    for (const room of rooms.values()) {
      if (room.__dirty) changed = true;
    }

    if (!changed) return result;

    const nextState = serializeRooms(rooms);
    const saved = await saveState(nextState, etag);
    if (saved) return result;

    lastError = httpError("Room changed while saving. Retrying...", 409);
  }
  throw lastError || httpError("Could not save room state", 409);
}

function getRoom(rooms, code) {
  const room = rooms.get(String(code || "").trim().toUpperCase());
  if (!room) throw httpError("Room not found", 404);
  if (tickRoom(room) || cleanupPresence(room)) markRoomDirty(room);
  return room;
}

function requireHost(room, token) {
  if (!token || token !== room.hostToken) throw httpError("Invalid host link", 403);
}

function roomCode(rooms) {
  let code = "";
  do {
    code = String(crypto.randomInt(100000, 999999));
  } while (rooms.has(code));
  return code;
}

function normalizeQuestion(body, existing = {}) {
  const prompt = String(body.prompt || "").trim();
  const imageUrl = String(body.imageUrl || "").trim();
  const questionType = normalizeQuestionType(body.questionType || existing.questionType);
  const rawChoices = Array.isArray(body.choices) ? body.choices : [];
  const choices = rawChoices
    .map((text, index) => ({ id: CHOICE_IDS[index], text: String(text || "").trim() }))
    .filter((choice) => choice.text);
  const correctChoiceId = String(body.correctChoiceId || "").trim().toUpperCase();
  const acceptedAnswers = parseAcceptedAnswers(body.acceptedAnswers);
  const timeLimitSeconds = body.timeLimitSeconds ? Math.max(5, toInt(body.timeLimitSeconds, 0)) : null;

  if (!prompt && !imageUrl) throw httpError("Question needs prompt text or an image URL", 400);
  if (questionType === "mcq" && (choices.length < 4 || choices.length > 5)) throw httpError("Question needs 4 or 5 choices", 400);
  if (questionType === "mcq" && !choices.some((choice) => choice.id === correctChoiceId)) {
    throw httpError("Correct answer must match an existing choice", 400);
  }
  if (questionType === "short_answer" && !acceptedAnswers.length) {
    throw httpError("Short answer question needs at least one accepted answer", 400);
  }

  return {
    id: existing.id || uid(8),
    questionType,
    prompt,
    imageUrl,
    choices: questionType === "mcq" ? choices : [],
    correctChoiceId: questionType === "mcq" ? correctChoiceId : "",
    acceptedAnswers: questionType === "short_answer" ? acceptedAnswers : [],
    explanation: String(body.explanation || "").trim(),
    timeLimitSeconds,
    state: existing.state || "pending",
    voidedAt: existing.voidedAt || null,
  };
}

function validQuestionCount(room) {
  return room.questions.filter((q) => q.state !== "voided").length;
}

function activeParticipants(room) {
  cleanupPresence(room);
  return room.participants.filter((p) => !p.kickedAt);
}

function startQuestion(room, index) {
  const question = room.questions[index];
  if (!question || question.state === "voided") return false;
  const limit = question.timeLimitSeconds || room.globalTimeLimitSeconds;
  room.currentQuestionIndex = index;
  room.state = "question_active";
  room.startedAt = nowIso();
  room.endsAt = new Date(Date.now() + limit * 1000).toISOString();
  room.revealedAt = null;
  question.state = "active";
  room.answers[question.id] = room.answers[question.id] || {};
  return true;
}

function nextPlayableIndex(room, fromIndex) {
  for (let i = fromIndex; i < room.questions.length; i += 1) {
    if (room.questions[i].state !== "voided") return i;
  }
  return -1;
}

function participantByToken(room, sessionToken) {
  const participant = room.participants.find((p) => p.sessionToken === sessionToken);
  if (!participant) throw httpError("Participant session not found", 404);
  return participant;
}

function publicQuestion(question, reveal = false) {
  if (!question) return null;
  return {
    id: question.id,
    questionType: normalizeQuestionType(question.questionType),
    prompt: question.prompt,
    imageUrl: question.imageUrl,
    choices: question.choices,
    explanation: reveal ? question.explanation : "",
    correctChoiceId: reveal ? question.correctChoiceId : null,
    acceptedAnswers: reveal ? question.acceptedAnswers || [] : [],
    timeLimitSeconds: question.timeLimitSeconds,
    state: question.state,
    voidedAt: question.voidedAt,
  };
}

function scoreFor(room, participantId) {
  return room.questions.reduce((total, question) => {
    if (question.state === "voided") return total;
    const answer = room.answers[question.id]?.[participantId];
    return total + (answer?.isCorrect ? 1 : 0);
  }, 0);
}

function revealStats(room, question) {
  if (!question) return null;
  const answers = room.answers[question.id] || {};
  const participants = activeParticipants(room);
  const groups = {};
  if (normalizeQuestionType(question.questionType) === "short_answer") {
    groups.CORRECT = { count: 0, names: [] };
    groups.INCORRECT = { count: 0, names: [] };
    groups.NO_ANSWER = { count: 0, names: [] };
    const responses = [];
    for (const participant of participants) {
      const answer = answers[participant.id];
      if (!answer?.answerText) {
        groups.NO_ANSWER.count += 1;
        groups.NO_ANSWER.names.push(participant.username);
      } else if (answer.isCorrect) {
        groups.CORRECT.count += 1;
        groups.CORRECT.names.push(participant.username);
        responses.push({ username: participant.username, answerText: answer.answerText, isCorrect: true });
      } else {
        groups.INCORRECT.count += 1;
        groups.INCORRECT.names.push(participant.username);
        responses.push({ username: participant.username, answerText: answer.answerText, isCorrect: false });
      }
    }
    return { totalParticipants: participants.length, groups, responses };
  }

  for (const choice of question.choices) groups[choice.id] = { count: 0, names: [] };
  groups.NO_ANSWER = { count: 0, names: [] };

  for (const participant of participants) {
    const answer = answers[participant.id];
    if (answer?.selectedChoiceId && groups[answer.selectedChoiceId]) {
      groups[answer.selectedChoiceId].count += 1;
      groups[answer.selectedChoiceId].names.push(participant.username);
    } else {
      groups.NO_ANSWER.count += 1;
      groups.NO_ANSWER.names.push(participant.username);
    }
  }
  return { totalParticipants: participants.length, groups };
}

function hostState(room) {
  if (tickRoom(room) || cleanupPresence(room)) markRoomDirty(room);
  const currentQuestion = room.questions[room.currentQuestionIndex] || null;
  const reveal = ["question_reveal", "finished"].includes(room.state);
  return {
    code: room.code,
    state: room.state,
    globalTimeLimitSeconds: room.globalTimeLimitSeconds,
    currentQuestionIndex: room.currentQuestionIndex,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    expiresAt: room.expiresAt,
    questions: room.questions.map((question, index) => ({
      ...publicQuestion(question, true),
      position: index + 1,
    })),
    currentQuestion: publicQuestion(currentQuestion, reveal),
    participants: room.participants
      .filter((p) => !p.kickedAt)
      .map((p) => ({
        id: p.id,
        username: p.username,
        active: p.active,
        joinedAt: p.joinedAt,
        lastHeartbeatAt: p.lastHeartbeatAt,
        releasedAt: p.releasedAt || null,
        totalScore: scoreFor(room, p.id),
      })),
    revealStats: reveal ? revealStats(room, currentQuestion) : null,
  };
}

function participantState(room, participant) {
  if (tickRoom(room) || cleanupPresence(room)) markRoomDirty(room);
  const currentQuestion = room.questions[room.currentQuestionIndex] || null;
  const reveal = ["question_reveal", "finished"].includes(room.state);
  const answer = currentQuestion ? room.answers[currentQuestion.id]?.[participant.id] || null : null;
  return {
    code: room.code,
    state: participant.kickedAt ? "kicked" : room.state,
    username: participant.username,
    currentQuestionIndex: room.currentQuestionIndex,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    currentQuestion: publicQuestion(currentQuestion, reveal),
    selectedChoiceId: answer?.selectedChoiceId || null,
    answerText: answer?.answerText || "",
    isCorrect: reveal && answer ? answer.isCorrect : null,
    totalScore: scoreFor(room, participant.id),
  };
}

function exportCsv(room) {
  const rows = [["username", "total_score"]];
  for (const participant of room.participants.filter((p) => !p.kickedAt)) {
    rows.push([participant.username, String(scoreFor(room, participant.id))]);
  }
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

async function handleRoute(event) {
  const method = event.httpMethod;
  const path = routePath(event);

  if (path === "/rooms" && method === "POST") {
    const body = parseBody(event);
    const room = await withState((rooms, markChanged) => {
      const code = roomCode(rooms);
      const createdAt = nowIso();
      const nextRoom = {
        id: uid(8),
        code,
        hostToken: uid(18),
        state: "draft",
        globalTimeLimitSeconds: Math.max(5, toInt(body.globalTimeLimitSeconds, 30)),
        currentQuestionIndex: -1,
        startedAt: null,
        endsAt: null,
        revealedAt: null,
        createdAt,
        expiresAt: new Date(Date.now() + ROOM_TTL_MS).toISOString(),
        questions: [],
        participants: [],
        answers: {},
      };
      rooms.set(code, nextRoom);
      markChanged();
      return nextRoom;
    });
    return json(201, {
      roomCode: room.code,
      hostToken: room.hostToken,
      hostUrl: `host.html?room=${room.code}&token=${room.hostToken}`,
      participantUrl: `index.html?room=${room.code}`,
      expiresAt: room.expiresAt,
    });
  }

  if (path === "/join" && method === "POST") {
    const body = parseBody(event);
    const result = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, body.code);
      if (!["lobby", "question_active", "question_reveal"].includes(room.state)) {
        throw httpError("This room is not accepting participants", 400);
      }
      const cleanedName = String(body.username || "").trim().replace(/\s+/g, " ");
      if (!cleanedName) throw httpError("Username is required", 400);

      cleanupPresence(room);
      const normalized = cleanedName.toLocaleLowerCase();
      const existing = room.participants.find(
        (p) => !p.kickedAt && p.username.toLocaleLowerCase() === normalized
      );

      if (existing && body.sessionToken && existing.sessionToken === body.sessionToken) {
        existing.lastHeartbeatAt = nowIso();
        existing.active = true;
        markChanged();
        return { room, participant: existing, sessionToken: existing.sessionToken };
      }
      if (existing && existing.active) throw httpError("That username is already active in this room", 409);
      if (existing && !existing.active) {
        existing.sessionToken = uid(18);
        existing.lastHeartbeatAt = nowIso();
        existing.active = true;
        markChanged();
        return { room, participant: existing, sessionToken: existing.sessionToken };
      }

      const participant = {
        id: uid(8),
        username: cleanedName,
        sessionToken: uid(18),
        active: true,
        joinedAt: nowIso(),
        lastHeartbeatAt: nowIso(),
        kickedAt: null,
      };
      room.participants.push(participant);
      markChanged();
      return { room, participant, sessionToken: participant.sessionToken };
    });
    return json(200, {
      roomCode: result.room.code,
      sessionToken: result.sessionToken,
      participantUrl: `participant.html?room=${result.room.code}&session=${result.sessionToken}`,
      state: participantState(result.room, result.participant),
    });
  }

  const hostMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/host$/);
  if (hostMatch && method === "GET") {
    const result = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, hostMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (tickRoom(room) || cleanupPresence(room)) markChanged();
      return hostState(room);
    });
    return json(200, result);
  }

  const settingsMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/settings$/);
  if (settingsMatch && method === "PATCH") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, settingsMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (!["lobby", "draft"].includes(room.state)) {
        throw httpError("Settings can only be changed before the quiz starts", 400);
      }
      room.globalTimeLimitSeconds = Math.max(5, toInt(body.globalTimeLimitSeconds, room.globalTimeLimitSeconds));
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const lobbyMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/open-lobby$/);
  if (lobbyMatch && method === "POST") {
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, lobbyMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (room.state !== "draft") throw httpError("Lobby can only be opened from draft state", 400);
      if (validQuestionCount(room) < 1) throw httpError("Add at least one valid question before opening the lobby", 400);
      room.state = "lobby";
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const questionMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/questions$/);
  if (questionMatch && method === "POST") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, questionMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (!["lobby", "draft"].includes(room.state)) throw httpError("Questions can only be added before the quiz starts", 400);
      room.questions.push(normalizeQuestion(body));
      markChanged();
      return hostState(room);
    });
    return json(201, state);
  }

  const questionItemMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)$/);
  if (questionItemMatch && method === "PATCH") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, questionItemMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (!["lobby", "draft"].includes(room.state)) throw httpError("Questions can only be edited before the quiz starts", 400);
      const index = room.questions.findIndex((q) => q.id === questionItemMatch[2]);
      if (index === -1) throw httpError("Question not found", 404);
      room.questions[index] = normalizeQuestion(body, room.questions[index]);
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  if (questionItemMatch && method === "DELETE") {
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, questionItemMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (!["lobby", "draft"].includes(room.state)) throw httpError("Questions can only be deleted before the quiz starts", 400);
      const before = room.questions.length;
      room.questions = room.questions.filter((q) => q.id !== questionItemMatch[2]);
      if (room.questions.length === before) throw httpError("Question not found", 404);
      delete room.answers[questionItemMatch[2]];
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const questionMoveMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)\/move$/);
  if (questionMoveMatch && method === "POST") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, questionMoveMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (!["lobby", "draft"].includes(room.state)) throw httpError("Questions can only be reordered before the quiz starts", 400);
      const index = room.questions.findIndex((q) => q.id === questionMoveMatch[2]);
      if (index === -1) throw httpError("Question not found", 404);
      const nextIndex = index + (body.direction === "down" ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < room.questions.length) {
        [room.questions[index], room.questions[nextIndex]] = [room.questions[nextIndex], room.questions[index]];
        markChanged();
      }
      return hostState(room);
    });
    return json(200, state);
  }

  const startMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/start$/);
  if (startMatch && method === "POST") {
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, startMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (room.state !== "lobby") throw httpError("Quiz has already started", 400);
      if (validQuestionCount(room) < 1) throw httpError("Add at least one valid question before starting", 400);
      startQuestion(room, nextPlayableIndex(room, 0));
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const nextMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/next$/);
  if (nextMatch && method === "POST") {
    const state = await withState(async (rooms, markChanged) => {
      const room = getRoom(rooms, nextMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      if (room.state !== "question_reveal") throw httpError("You can advance after the reveal", 400);
      const nextIndex = nextPlayableIndex(room, room.currentQuestionIndex + 1);
      if (nextIndex === -1) {
        room.state = "finished";
        room.startedAt = null;
        room.endsAt = null;
        room.revealedAt = null;
        await saveResultsToSupabase(room).catch((err) => console.error("[Supabase LiveQuiz] Save error:", err));
      } else {
        startQuestion(room, nextIndex);
      }
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const kickMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/kick$/);
  if (kickMatch && method === "POST") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, kickMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      const participant = room.participants.find((p) => p.id === body.participantId);
      if (!participant) throw httpError("Participant not found", 404);
      participant.kickedAt = nowIso();
      participant.active = false;
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const releaseMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/release$/);
  if (releaseMatch && method === "POST") {
    const body = parseBody(event);
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, releaseMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      const participant = room.participants.find((p) => p.id === body.participantId && !p.kickedAt);
      if (!participant) throw httpError("Participant not found", 404);
      participant.sessionToken = uid(18);
      participant.active = false;
      participant.releasedAt = nowIso();
      participant.lastHeartbeatAt = new Date(Date.now() - STALE_LOCK_MS - 1000).toISOString();
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const voidMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)\/void$/);
  if (voidMatch && method === "POST") {
    const state = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, voidMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      const question = room.questions.find((q) => q.id === voidMatch[2]);
      if (!question) throw httpError("Question not found", 404);
      question.state = "voided";
      question.voidedAt = nowIso();
      if (room.questions[room.currentQuestionIndex]?.id === voidMatch[2]) {
        room.state = "question_reveal";
        room.revealedAt = nowIso();
      }
      markChanged();
      return hostState(room);
    });
    return json(200, state);
  }

  const participantMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/participant$/);
  if (participantMatch && method === "GET") {
    const token = queryToken(event, "x-participant-token", "session");
    const result = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, participantMatch[1]);
      const participant = participantByToken(room, token);
      if (!participant.kickedAt) {
        const last = Date.parse(participant.lastHeartbeatAt);
        if (!participant.active || Date.now() - last > HEARTBEAT_WRITE_MS) {
          participant.lastHeartbeatAt = nowIso();
          participant.active = true;
          markChanged();
        }
      }
      if (tickRoom(room) || cleanupPresence(room)) markChanged();
      return { room, participant };
    });
    return json(200, participantState(result.room, result.participant));
  }

  const answerMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/answer$/);
  if (answerMatch && method === "POST") {
    const body = parseBody(event);
    const token = queryToken(event, "x-participant-token", "session");
    const result = await withState((rooms, markChanged) => {
      const room = getRoom(rooms, answerMatch[1]);
      const participant = participantByToken(room, token);
      if (participant.kickedAt) throw httpError("You have been removed from this room", 403);
      participant.lastHeartbeatAt = nowIso();
      participant.active = true;
      if (room.state !== "question_active" || Date.now() > Date.parse(room.endsAt)) {
        tickRoom(room);
        markChanged();
        return { room, participant, locked: true };
      }
      const question = room.questions[room.currentQuestionIndex];
      room.answers[question.id] = room.answers[question.id] || {};
      if (normalizeQuestionType(question.questionType) === "short_answer") {
        const answerText = String(body.answerText || "").trim();
        if (!answerText) throw httpError("Answer text is required", 400);
        room.answers[question.id][participant.id] = {
          answerText,
          selectedAt: nowIso(),
          isCorrect: textAnswerIsCorrect(answerText, question.acceptedAnswers || []),
        };
      } else {
        const selectedChoiceId = String(body.choiceId || "").trim().toUpperCase();
        if (!question.choices.some((choice) => choice.id === selectedChoiceId)) {
          throw httpError("Invalid choice", 400);
        }
        room.answers[question.id][participant.id] = {
          selectedChoiceId,
          selectedAt: nowIso(),
          isCorrect: selectedChoiceId === question.correctChoiceId,
        };
      }
      markChanged();
      return { room, participant };
    });
    if (result.locked) return json(423, { error: "Answers are locked for this question" });
    return json(200, participantState(result.room, result.participant));
  }

  const exportMatch = path.match(/^\/rooms\/([A-Z0-9]+)\/export\.csv$/);
  if (exportMatch && method === "GET") {
    const body = await withState((rooms) => {
      const room = getRoom(rooms, exportMatch[1]);
      requireHost(room, queryToken(event, "x-host-token", "token"));
      return exportCsv(room);
    });
    return csv(200, body, `livequiz-${exportMatch[1]}-results.csv`);
  }

  return json(404, { error: "Not found" });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  try {
    if (event?.blobs) connectLambda(event);
    return await handleRoute(event);
  } catch (err) {
    console.error(err);
    return json(err.status || 500, { error: err.message || "Server error" });
  }
};

exports._private = {
  routePath,
};
