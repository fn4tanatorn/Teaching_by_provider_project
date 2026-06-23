const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, "problems.json");
const FRONTEND_DIR = __dirname;

function loadProblems() {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw).problems;
}

function pickRandom(items) {
  if (items.length === 0) return null;
  const index = crypto.randomInt(0, items.length);
  return items[index];
}

function shuffleIds(ids) {
  const deck = [...ids];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function toPublicProblem(problem) {
  const { answer, explanation, source, ...rest } = problem;
  return rest;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data, methods = "GET, POST, OPTIONS") {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function getMime(filePath) {
  const ext = path.extname(filePath);
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  filePath = path.normalize(path.join(FRONTEND_DIR, filePath));

  if (!filePath.startsWith(FRONTEND_DIR)) {
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

function filterProblems(problems, params) {
  let filtered = problems;
  const category = params.get("category");
  const difficulty = params.get("difficulty");
  const type = params.get("type");

  if (category) filtered = filtered.filter((p) => p.category === category);
  if (difficulty) filtered = filtered.filter((p) => p.difficulty === difficulty);
  if (type) filtered = filtered.filter((p) => p.type === type);

  return filtered;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      const problems = loadProblems();

      if (url.pathname === "/api/stats" && req.method === "GET") {
        sendJson(res, 200, { total: problems.length });
        return;
      }

      if (url.pathname === "/api/categories") {
        const categories = [...new Set(problems.map((p) => p.category))].sort();
        sendJson(res, 200, { categories });
        return;
      }

      if (url.pathname === "/api/problems/ids" && req.method === "GET") {
        sendJson(res, 200, { ids: problems.map((p) => p.id) });
        return;
      }

      const problemById = url.pathname.match(/^\/api\/problems\/(\d+)$/);
      if (problemById && req.method === "GET") {
        const id = Number(problemById[1]);
        const problem = problems.find((p) => p.id === id);

        if (!problem) {
          sendJson(res, 404, { error: "Question not found" });
          return;
        }

        sendJson(res, 200, { problem: toPublicProblem(problem) });
        return;
      }

      if (url.pathname === "/api/problems" && req.method === "GET") {
        const filtered = filterProblems(problems, url.searchParams);
        sendJson(res, 200, {
          problems: filtered.map(toPublicProblem),
          total: filtered.length,
        });
        return;
      }

      if (url.pathname === "/api/problems/random" && req.method === "GET") {
        let filtered = filterProblems(problems, url.searchParams);
        const exclude = url.searchParams.get("exclude");

        if (exclude) {
          const excludeIds = new Set(
            exclude.split(",").map((id) => Number(id.trim())).filter(Boolean)
          );
          const withoutExcluded = filtered.filter((p) => !excludeIds.has(p.id));

          if (withoutExcluded.length === 0) {
            sendJson(res, 404, {
              error: "No questions remain",
              code: "NO_MORE_QUESTIONS",
            });
            return;
          }

          filtered = withoutExcluded;
        }

        if (filtered.length === 0) {
          sendJson(res, 404, { error: "No question matched the selected filters" });
          return;
        }

        const picked = pickRandom(filtered);
        sendJson(res, 200, { problem: toPublicProblem(picked) });
        return;
      }

      if (url.pathname === "/api/problems/shuffle" && req.method === "GET") {
        let ids = problems.map((p) => p.id);
        const exclude = url.searchParams.get("exclude");

        if (exclude) {
          const excludeIds = new Set(
            exclude.split(",").map((id) => Number(id.trim())).filter(Boolean)
          );
          ids = ids.filter((id) => !excludeIds.has(id));
        }

        if (ids.length === 0) {
          sendJson(res, 404, {
            error: "No questions remain",
            code: "NO_MORE_QUESTIONS",
          });
          return;
        }

        sendJson(res, 200, { deck: shuffleIds(ids) });
        return;
      }

      if (url.pathname === "/api/problems/check" && req.method === "POST") {
        const body = await readBody(req);
        const problem = problems.find((p) => p.id === body.id);

        if (!problem) {
          sendJson(res, 404, { error: "Question not found" });
          return;
        }

        if (problem.type !== "mcq") {
          sendJson(res, 400, { error: "This question is not an MCQ" });
          return;
        }

        const choice = body.choice;
        const validIds = problem.choices.map((c) => c.id);

        if (!choice || !validIds.includes(choice)) {
          sendJson(res, 400, { error: "Invalid choice" });
          return;
        }

        const correct = choice === problem.answer;
        const correctChoice = problem.choices.find((c) => c.id === problem.answer);

        sendJson(res, 200, {
          correct,
          correctChoice: correct ? undefined : correctChoice,
          explanation: problem.explanation,
        });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Server error" });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`API:    http://localhost:${PORT}/api/problems/random`);
});
