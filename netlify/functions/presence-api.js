const { getStore } = require("@netlify/blobs");
const fs = require("fs/promises");
const path = require("path");

const STORE_NAME = "presence";
const STATE_KEY = "active.json";
const LOCAL_STATE_PATH = path.join(process.cwd(), ".netlify", "presence.local.json");
const ACTIVE_TTL_MS = 90 * 1000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function loadState() {
  try {
    return (await store().get(STATE_KEY, { type: "json" })) || { users: [] };
  } catch (error) {
    if (!String(error.message || "").includes("Netlify Blobs")) throw error;
    try {
      return JSON.parse(await fs.readFile(LOCAL_STATE_PATH, "utf8"));
    } catch {
      return { users: [] };
    }
  }
}

async function saveState(state) {
  try {
    await store().setJSON(STATE_KEY, state);
  } catch (error) {
    if (!String(error.message || "").includes("Netlify Blobs")) throw error;
    await fs.mkdir(path.dirname(LOCAL_STATE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_STATE_PATH, JSON.stringify(state, null, 2));
  }
}

function cleanUsers(users) {
  const cutoff = Date.now() - ACTIVE_TTL_MS;
  return users.filter((user) => Date.parse(user.lastSeenAt || "") >= cutoff);
}

function summarize(users) {
  const students = users.filter((user) => user.role !== "admin").length;
  const staff = users.filter((user) => user.role === "admin").length;
  return {
    total: users.length,
    students,
    staff,
    updatedAt: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, {});

    const state = await loadState();
    let users = cleanUsers(Array.isArray(state.users) ? state.users : []);

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      const id = String(body.id || "").slice(0, 120);
      if (!id) return json(400, { error: "Missing presence id." });

      const nextUser = {
        id,
        name: String(body.name || "Student").slice(0, 80),
        role: body.role === "admin" ? "admin" : "student",
        page: String(body.page || "").slice(0, 80),
        lastSeenAt: new Date().toISOString(),
      };

      users = users.filter((user) => user.id !== id);
      users.push(nextUser);
      await saveState({ users });
    } else if (event.httpMethod !== "GET") {
      return json(405, { error: "Method not allowed." });
    }

    return json(200, { summary: summarize(users) });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Presence error." });
  }
};
