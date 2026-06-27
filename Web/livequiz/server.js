const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const quiz = require("./state");

const PORT = process.env.PORT || 3001;
const STATIC_DIR = __dirname;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error("Invalid JSON");
        err.status = 400;
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Host-Token, X-Participant-Token",
  });
  res.end(JSON.stringify(data));
}

function sendError(res, err) {
  sendJson(res, err.status || 500, { error: err.message || "Server error" });
}

function tokenFrom(req, url, headerName, queryName) {
  return req.headers[headerName.toLowerCase()] || url.searchParams.get(queryName) || "";
}

function getMime(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  filePath = path.normalize(path.join(STATIC_DIR, filePath));

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": getMime(filePath) });
    res.end(data);
  });
}

async function routeApi(req, res, url) {
  if (url.pathname === "/api/rooms" && req.method === "POST") {
    const body = await readBody(req);
    const room = quiz.createRoom(body);
    sendJson(res, 201, {
      roomCode: room.code,
      hostToken: room.hostToken,
      hostUrl: `host.html?room=${room.code}&token=${room.hostToken}`,
      participantUrl: `index.html?room=${room.code}`,
      expiresAt: room.expiresAt,
    });
    return;
  }

  if (url.pathname === "/api/join" && req.method === "POST") {
    const body = await readBody(req);
    const result = quiz.joinRoom(body);
    sendJson(res, 200, {
      roomCode: result.room.code,
      sessionToken: result.sessionToken,
      participantUrl: `participant.html?room=${result.room.code}&session=${result.sessionToken}`,
      state: quiz.participantState(result.room, result.participant),
    });
    return;
  }

  const hostMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/host$/);
  if (hostMatch && req.method === "GET") {
    const room = quiz.getRoom(hostMatch[1]);
    quiz.requireHost(room, tokenFrom(req, url, "x-host-token", "token"));
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const settingsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/settings$/);
  if (settingsMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const room = quiz.updateSettings(settingsMatch[1], tokenFrom(req, url, "x-host-token", "token"), body);
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const lobbyMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/open-lobby$/);
  if (lobbyMatch && req.method === "POST") {
    const room = quiz.openLobby(lobbyMatch[1], tokenFrom(req, url, "x-host-token", "token"));
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const questionMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/questions$/);
  if (questionMatch && req.method === "POST") {
    const body = await readBody(req);
    const room = quiz.addQuestion(questionMatch[1], tokenFrom(req, url, "x-host-token", "token"), body);
    sendJson(res, 201, quiz.hostState(room));
    return;
  }

  const questionItemMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)$/);
  if (questionItemMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const room = quiz.updateQuestion(
      questionItemMatch[1],
      tokenFrom(req, url, "x-host-token", "token"),
      questionItemMatch[2],
      body
    );
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  if (questionItemMatch && req.method === "DELETE") {
    const room = quiz.deleteQuestion(
      questionItemMatch[1],
      tokenFrom(req, url, "x-host-token", "token"),
      questionItemMatch[2]
    );
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const questionMoveMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)\/move$/);
  if (questionMoveMatch && req.method === "POST") {
    const body = await readBody(req);
    const room = quiz.moveQuestion(
      questionMoveMatch[1],
      tokenFrom(req, url, "x-host-token", "token"),
      questionMoveMatch[2],
      body.direction
    );
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const startMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/start$/);
  if (startMatch && req.method === "POST") {
    const room = quiz.startQuiz(startMatch[1], tokenFrom(req, url, "x-host-token", "token"));
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const nextMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/next$/);
  if (nextMatch && req.method === "POST") {
    const room = quiz.advanceQuestion(nextMatch[1], tokenFrom(req, url, "x-host-token", "token"));
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const kickMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/kick$/);
  if (kickMatch && req.method === "POST") {
    const body = await readBody(req);
    const room = quiz.kickParticipant(kickMatch[1], tokenFrom(req, url, "x-host-token", "token"), body.participantId);
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const releaseMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/release$/);
  if (releaseMatch && req.method === "POST") {
    const body = await readBody(req);
    const room = quiz.releaseParticipant(releaseMatch[1], tokenFrom(req, url, "x-host-token", "token"), body.participantId);
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const voidMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/questions\/([a-f0-9]+)\/void$/);
  if (voidMatch && req.method === "POST") {
    const room = quiz.voidQuestion(voidMatch[1], tokenFrom(req, url, "x-host-token", "token"), voidMatch[2]);
    sendJson(res, 200, quiz.hostState(room));
    return;
  }

  const participantMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/participant$/);
  if (participantMatch && req.method === "GET") {
    const result = quiz.heartbeat(participantMatch[1], tokenFrom(req, url, "x-participant-token", "session"));
    sendJson(res, 200, quiz.participantState(result.room, result.participant));
    return;
  }

  const answerMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/answer$/);
  if (answerMatch && req.method === "POST") {
    const body = await readBody(req);
    const result = quiz.submitAnswer(answerMatch[1], tokenFrom(req, url, "x-participant-token", "session"), body);
    sendJson(res, 200, quiz.participantState(result.room, result.participant));
    return;
  }

  const exportMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/export\.csv$/);
  if (exportMatch && req.method === "GET") {
    const csv = quiz.exportCsv(exportMatch[1], tokenFrom(req, url, "x-host-token", "token"));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="livequiz-${exportMatch[1]}-results.csv"`,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(csv);
    return;
  }

  const eventsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/events$/);
  if (eventsMatch && req.method === "GET") {
    const code = eventsMatch[1];
    const role = url.searchParams.get("role");
    const token = role === "host"
      ? tokenFrom(req, url, "x-host-token", "token")
      : tokenFrom(req, url, "x-participant-token", "session");

    const room = quiz.getRoom(code);
    if (role === "host") {
      quiz.requireHost(room, token);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = () => {
      try {
        const r = quiz.getRoom(code);
        let data;
        if (role === "host") {
          data = quiz.hostState(r);
        } else {
          const p = r.participants.find((p) => p.sessionToken === token);
          if (!p) return;
          data = quiz.participantState(r, p);
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    send();
    const unsubscribe = quiz.onRoomChange(code, send);

    const heartbeatTimer = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    const cleanup = () => {
      unsubscribe();
      clearInterval(heartbeatTimer);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      try {
        await routeApi(req, res, url);
      } catch (err) {
        console.error(err);
        sendError(res, err);
      }
      return;
    }

    serveStatic(req, res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`LiveQuiz prototype: http://localhost:${PORT}`);
  });
}

module.exports = {
  routeApi,
  sendError,
  sendJson,
};
