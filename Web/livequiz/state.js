const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildResultExport, csvFromSection } = require("./results");

const DATA_PATH = path.join(__dirname, "livequiz-data.json");
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_LOCK_MS = 75 * 1000;
const CHOICE_IDS = ["A", "B", "C", "D", "E"];

let rooms = new Map();
let timers = new Map();
const listeners = new Map();

function notifyRoom(code) {
  const cbs = listeners.get(code);
  if (!cbs || !cbs.size) return;
  for (const cb of cbs) {
    try { cb(); } catch {}
  }
}

function onRoomChange(code, cb) {
  if (!listeners.has(code)) listeners.set(code, new Set());
  listeners.get(code).add(cb);
  return () => {
    const cbs = listeners.get(code);
    if (cbs) { cbs.delete(cb); if (!cbs.size) listeners.delete(code); }
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && (key || serviceKey)) return { url, key, serviceKey };

  const configPath = path.join(__dirname, "../js/supabase-config.js");
  const localConfigPath = path.join(__dirname, "../js/supabase-config.local.js");
  
  let configContent = "";
  try {
    if (fs.existsSync(configPath)) {
      configContent += fs.readFileSync(configPath, "utf8");
    }
    if (fs.existsSync(localConfigPath)) {
      configContent += fs.readFileSync(localConfigPath, "utf8");
    }
  } catch (err) {
    console.error("Could not read Supabase config file", err);
  }

  const urlMatch = configContent.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
  const keyMatch = configContent.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);
  const serviceKeyMatch = configContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]([^'"]+)['"]/);

  return {
    url: urlMatch ? urlMatch[1] : "",
    key: keyMatch ? keyMatch[1] : "",
    serviceKey: serviceKeyMatch ? serviceKeyMatch[1] : ""
  };
}

async function saveResultsToSupabase(room) {
  const config = getSupabaseConfig();
  const serviceKey = config.serviceKey;
  if (!config.url || !serviceKey) {
    console.warn("[LiveQuiz] Supabase service role is not configured. Skipping result snapshot.");
    return;
  }

  const results = buildResultExport(room);
  const payload = {
    room_code: room.code,
    room_state: room.state,
    participant_count: results.room.participantCount,
    question_count: results.room.questionCount,
    possible_score: results.room.possibleScore,
    summary: results.summary.objects,
    responses: results.responses.objects,
    questions: results.questions.objects,
    finished_at: results.room.finishedAt || nowIso(),
    updated_at: nowIso()
  };

  try {
    const response = await fetch(`${config.url}/rest/v1/livequiz_results?on_conflict=room_code`, {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([payload])
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("[LiveQuiz] Failed to save result snapshot to Supabase:", response.status, errText);
    } else {
      console.log(`[LiveQuiz] Saved result snapshot for room ${room.code} to Supabase.`);
    }
  } catch (err) {
    console.error("[LiveQuiz] Error saving results to Supabase:", err);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uid(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function roomCode() {
  let code = "";
  do {
    code = String(crypto.randomInt(100000, 999999));
  } while (rooms.has(code));
  return code;
}

function loadStore() {
  if (!fs.existsSync(DATA_PATH)) return;
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  if (!raw.trim()) return;
  const data = JSON.parse(raw);
  rooms = new Map((data.rooms || []).map((room) => [room.code, room]));
  cleanupExpiredRooms();
  for (const room of rooms.values()) {
    scheduleTimer(room);
  }
}

function saveStore() {
  const payload = { rooms: [...rooms.values()] };
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2));
}

function cleanupExpiredRooms({ persist = true } = {}) {
  const now = Date.now();
  let changed = false;
  for (const [code, room] of rooms.entries()) {
    if (now > Date.parse(room.expiresAt)) {
      clearRoomTimer(code);
      rooms.delete(code);
      changed = true;
    }
  }
  if (changed && persist) saveStore();
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

function cleanupPresence(room) {
  const now = Date.now();
  for (const participant of room.participants) {
    if (participant.kickedAt) continue;
    participant.active = now - Date.parse(participant.lastHeartbeatAt) <= STALE_LOCK_MS;
  }
}

function expireRoomIfNeeded(room) {
  if (Date.now() > Date.parse(room.expiresAt)) {
    room.state = "expired";
    clearRoomTimer(room.code);
  }
}

function getRoom(code) {
  const room = rooms.get(String(code || "").trim().toUpperCase());
  if (!room) {
    const err = new Error("Room not found");
    err.status = 404;
    throw err;
  }
  expireRoomIfNeeded(room);
  tickRoom(room);
  cleanupPresence(room);
  return room;
}

function requireHost(room, token) {
  if (room.state === "expired") {
    const err = new Error("This room has expired");
    err.status = 410;
    throw err;
  }
  if (!token || token !== room.hostToken) {
    const err = new Error("Invalid host link");
    err.status = 403;
    throw err;
  }
}

function clearRoomTimer(code) {
  const existing = timers.get(code);
  if (existing) {
    clearTimeout(existing);
    timers.delete(code);
  }
}

function scheduleTimer(room) {
  clearRoomTimer(room.code);
  if (room.state !== "question_active" || !room.endsAt) return;

  const delay = Math.max(0, Date.parse(room.endsAt) - Date.now());
  const timer = setTimeout(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) return;
    tickRoom(liveRoom);
    saveStore();
    notifyRoom(liveRoom.code);
  }, delay + 25);
  timers.set(room.code, timer);
}

function tickRoom(room) {
  if (room.state !== "question_active" || !room.endsAt) return;
  if (Date.now() < Date.parse(room.endsAt)) return;

  const question = room.questions[room.currentQuestionIndex];
  if (question && question.state !== "voided") {
    question.state = "revealed";
  }
  room.state = "question_reveal";
  room.revealedAt = nowIso();
  clearRoomTimer(room.code);
}

function activeParticipants(room) {
  cleanupPresence(room);
  return room.participants.filter((p) => !p.kickedAt);
}

function createRoom({ globalTimeLimitSeconds } = {}) {
  const code = roomCode();
  const createdAt = nowIso();
  const room = {
    id: uid(8),
    code,
    hostToken: uid(18),
    state: "draft",
    globalTimeLimitSeconds: Math.max(5, toInt(globalTimeLimitSeconds, 30)),
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
  rooms.set(code, room);
  saveStore();
  return room;
}

function openLobby(code, token) {
  const room = getRoom(code);
  requireHost(room, token);
  if (room.state !== "draft") {
    const err = new Error("Lobby can only be opened from draft state");
    err.status = 400;
    throw err;
  }
  if (validQuestionCount(room) < 1) {
    const err = new Error("Add at least one valid question before opening the lobby");
    err.status = 400;
    throw err;
  }
  room.state = "lobby";
  saveStore();
  notifyRoom(code);
  return room;
}

function updateSettings(code, token, body) {
  const room = getRoom(code);
  requireHost(room, token);
  if (!["lobby", "draft"].includes(room.state)) {
    const err = new Error("Settings can only be changed before the quiz starts");
    err.status = 400;
    throw err;
  }
  room.globalTimeLimitSeconds = Math.max(5, toInt(body.globalTimeLimitSeconds, room.globalTimeLimitSeconds));
  saveStore();
  notifyRoom(code);
  return room;
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
  const timeLimitSeconds = body.timeLimitSeconds
    ? Math.max(5, toInt(body.timeLimitSeconds, 0))
    : null;

  if (!prompt && !imageUrl) {
    const err = new Error("Question needs prompt text or an image URL");
    err.status = 400;
    throw err;
  }
  if (questionType === "mcq" && (choices.length < 4 || choices.length > 5)) {
    const err = new Error("Question needs 4 or 5 choices");
    err.status = 400;
    throw err;
  }
  if (questionType === "mcq" && !choices.some((choice) => choice.id === correctChoiceId)) {
    const err = new Error("Correct answer must match an existing choice");
    err.status = 400;
    throw err;
  }
  if (questionType === "short_answer" && !acceptedAnswers.length) {
    const err = new Error("Short answer question needs at least one accepted answer");
    err.status = 400;
    throw err;
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

function addQuestion(code, token, body) {
  const room = getRoom(code);
  requireHost(room, token);
  if (!["lobby", "draft"].includes(room.state)) {
    const err = new Error("Questions can only be added before the quiz starts");
    err.status = 400;
    throw err;
  }
  room.questions.push(normalizeQuestion(body));
  saveStore();
  notifyRoom(code);
  return room;
}

function updateQuestion(code, token, questionId, body) {
  const room = getRoom(code);
  requireHost(room, token);
  if (!["lobby", "draft"].includes(room.state)) {
    const err = new Error("Questions can only be edited before the quiz starts");
    err.status = 400;
    throw err;
  }
  const index = room.questions.findIndex((q) => q.id === questionId);
  if (index === -1) {
    const err = new Error("Question not found");
    err.status = 404;
    throw err;
  }
  room.questions[index] = normalizeQuestion(body, room.questions[index]);
  saveStore();
  notifyRoom(code);
  return room;
}

function deleteQuestion(code, token, questionId) {
  const room = getRoom(code);
  requireHost(room, token);
  if (!["lobby", "draft"].includes(room.state)) {
    const err = new Error("Questions can only be deleted before the quiz starts");
    err.status = 400;
    throw err;
  }
  const before = room.questions.length;
  room.questions = room.questions.filter((q) => q.id !== questionId);
  if (room.questions.length === before) {
    const err = new Error("Question not found");
    err.status = 404;
    throw err;
  }
  delete room.answers[questionId];
  saveStore();
  notifyRoom(code);
  return room;
}

function moveQuestion(code, token, questionId, direction) {
  const room = getRoom(code);
  requireHost(room, token);
  if (!["lobby", "draft"].includes(room.state)) {
    const err = new Error("Questions can only be reordered before the quiz starts");
    err.status = 400;
    throw err;
  }
  const index = room.questions.findIndex((q) => q.id === questionId);
  if (index === -1) {
    const err = new Error("Question not found");
    err.status = 404;
    throw err;
  }
  const offset = direction === "down" ? 1 : -1;
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= room.questions.length) return room;
  [room.questions[index], room.questions[nextIndex]] = [room.questions[nextIndex], room.questions[index]];
  saveStore();
  notifyRoom(code);
  return room;
}

function joinRoom({ code, username, sessionToken }) {
  const room = getRoom(code);
  if (room.state === "expired") {
    const err = new Error("This room has expired");
    err.status = 410;
    throw err;
  }
  if (!["lobby", "question_active", "question_reveal"].includes(room.state)) {
    const err = new Error("This room is not accepting participants");
    err.status = 400;
    throw err;
  }

  const cleanedName = String(username || "").trim().replace(/\s+/g, " ");
  if (!cleanedName) {
    const err = new Error("Username is required");
    err.status = 400;
    throw err;
  }

  cleanupPresence(room);
  const normalized = cleanedName.toLocaleLowerCase();
  const existing = room.participants.find(
    (p) => !p.kickedAt && p.username.toLocaleLowerCase() === normalized
  );

  if (existing && sessionToken && existing.sessionToken === sessionToken) {
    existing.lastHeartbeatAt = nowIso();
    existing.active = true;
    saveStore();
    return { room, participant: existing, sessionToken: existing.sessionToken };
  }

  if (existing && existing.active) {
    const err = new Error("That username is already active in this room");
    err.status = 409;
    throw err;
  }

  if (existing && !existing.active) {
    existing.sessionToken = uid(18);
    existing.lastHeartbeatAt = nowIso();
    existing.active = true;
    saveStore();
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
  saveStore();
  notifyRoom(code);
  return { room, participant, sessionToken: participant.sessionToken };
}

function participantByToken(room, sessionToken) {
  const participant = room.participants.find((p) => p.sessionToken === sessionToken);
  if (!participant) {
    const err = new Error("Participant session not found");
    err.status = 404;
    throw err;
  }
  return participant;
}

function heartbeat(code, sessionToken) {
  const room = getRoom(code);
  const participant = participantByToken(room, sessionToken);
  if (!participant.kickedAt) {
    participant.lastHeartbeatAt = nowIso();
    participant.active = true;
    saveStore();
  }
  return { room, participant };
}

function kickParticipant(code, token, participantId) {
  const room = getRoom(code);
  requireHost(room, token);
  const participant = room.participants.find((p) => p.id === participantId);
  if (!participant) {
    const err = new Error("Participant not found");
    err.status = 404;
    throw err;
  }
  participant.kickedAt = nowIso();
  participant.active = false;
  saveStore();
  notifyRoom(code);
  return room;
}

function releaseParticipant(code, token, participantId) {
  const room = getRoom(code);
  requireHost(room, token);
  const participant = room.participants.find((p) => p.id === participantId && !p.kickedAt);
  if (!participant) {
    const err = new Error("Participant not found");
    err.status = 404;
    throw err;
  }
  // Rotate the token so the stale browser cannot immediately reclaim the lock.
  participant.sessionToken = uid(18);
  participant.active = false;
  participant.releasedAt = nowIso();
  participant.lastHeartbeatAt = new Date(Date.now() - STALE_LOCK_MS - 1000).toISOString();
  saveStore();
  notifyRoom(code);
  return room;
}

function validQuestionCount(room) {
  return room.questions.filter((q) => q.state !== "voided").length;
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
  scheduleTimer(room);
  return true;
}

function nextPlayableIndex(room, fromIndex) {
  for (let i = fromIndex; i < room.questions.length; i += 1) {
    if (room.questions[i].state !== "voided") return i;
  }
  return -1;
}

function startQuiz(code, token) {
  const room = getRoom(code);
  requireHost(room, token);
  if (room.state !== "lobby") {
    const err = new Error("Quiz has already started");
    err.status = 400;
    throw err;
  }
  if (validQuestionCount(room) < 1) {
    const err = new Error("Add at least one valid question before starting");
    err.status = 400;
    throw err;
  }
  startQuestion(room, nextPlayableIndex(room, 0));
  saveStore();
  notifyRoom(code);
  return room;
}

function advanceQuestion(code, token) {
  const room = getRoom(code);
  requireHost(room, token);
  if (room.state !== "question_reveal") {
    const err = new Error("You can advance after the reveal");
    err.status = 400;
    throw err;
  }
  const nextIndex = nextPlayableIndex(room, room.currentQuestionIndex + 1);
  if (nextIndex === -1) {
    room.state = "finished";
    room.startedAt = null;
    room.endsAt = null;
    room.revealedAt = null;
    saveStore();
    notifyRoom(code);
    saveResultsToSupabase(room);
    return room;
  }
  startQuestion(room, nextIndex);
  saveStore();
  notifyRoom(code);
  return room;
}

function voidQuestion(code, token, questionId) {
  const room = getRoom(code);
  requireHost(room, token);
  const question = room.questions.find((q) => q.id === questionId);
  if (!question) {
    const err = new Error("Question not found");
    err.status = 404;
    throw err;
  }
  question.state = "voided";
  question.voidedAt = nowIso();

  if (room.questions[room.currentQuestionIndex]?.id === questionId) {
    clearRoomTimer(room.code);
    room.state = "question_reveal";
    room.revealedAt = nowIso();
  }
  saveStore();
  notifyRoom(code);
  return room;
}

function submitAnswer(code, sessionToken, body = {}) {
  const room = getRoom(code);
  const participant = participantByToken(room, sessionToken);
  if (participant.kickedAt) {
    const err = new Error("You have been removed from this room");
    err.status = 403;
    throw err;
  }
  participant.lastHeartbeatAt = nowIso();
  participant.active = true;

  if (room.state !== "question_active" || Date.now() > Date.parse(room.endsAt)) {
    tickRoom(room);
    saveStore();
    const err = new Error("Answers are locked for this question");
    err.status = 423;
    throw err;
  }

  const question = room.questions[room.currentQuestionIndex];
  room.answers[question.id] = room.answers[question.id] || {};
  if (normalizeQuestionType(question.questionType) === "short_answer") {
    const answerText = String(body.answerText || "").trim();
    if (!answerText) {
      const err = new Error("Answer text is required");
      err.status = 400;
      throw err;
    }
    room.answers[question.id][participant.id] = {
      answerText,
      selectedAt: nowIso(),
      isCorrect: textAnswerIsCorrect(answerText, question.acceptedAnswers || []),
    };
  } else {
    const selectedChoiceId = String(body.choiceId || "").trim().toUpperCase();
    if (!question.choices.some((choice) => choice.id === selectedChoiceId)) {
      const err = new Error("Invalid choice");
      err.status = 400;
      throw err;
    }
    room.answers[question.id][participant.id] = {
      selectedChoiceId,
      selectedAt: nowIso(),
      isCorrect: selectedChoiceId === question.correctChoiceId,
    };
  }
  saveStore();
  notifyRoom(code);
  return { room, participant };
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

  for (const choice of question.choices) {
    groups[choice.id] = { count: 0, names: [] };
  }
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

  return {
    totalParticipants: participants.length,
    groups,
  };
}

function hostState(room) {
  tickRoom(room);
  cleanupPresence(room);
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
  tickRoom(room);
  cleanupPresence(room);
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

function exportCsv(code, token) {
  const room = getRoom(code);
  requireHost(room, token);
  const rows = [["username", "total_score"]];
  for (const participant of room.participants.filter((p) => !p.kickedAt)) {
    rows.push([participant.username, String(scoreFor(room, participant.id))]);
  }
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
}

function resultExport(code, token) {
  const room = getRoom(code);
  requireHost(room, token);
  return buildResultExport(room);
}

function exportDetailCsv(code, token) {
  return `\uFEFF${csvFromSection(resultExport(code, token).responses)}`;
}

loadStore();
setInterval(() => cleanupExpiredRooms(), 60 * 60 * 1000).unref?.();

module.exports = {
  createRoom,
  openLobby,
  updateSettings,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  moveQuestion,
  joinRoom,
  heartbeat,
  kickParticipant,
  releaseParticipant,
  startQuiz,
  advanceQuestion,
  voidQuestion,
  submitAnswer,
  getRoom,
  requireHost,
  hostState,
  participantState,
  exportCsv,
  exportDetailCsv,
  resultExport,
  onRoomChange,
};
