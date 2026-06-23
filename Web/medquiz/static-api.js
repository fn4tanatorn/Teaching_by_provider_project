/**
 * MedQuiz API สำหรับ Netlify / static host (ไม่มี Node server)
 * ดึงข้อมูลจาก problems.json แทน /api/*
 */
(function () {
  function useStaticApi() {
    const { hostname, port } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return port !== "3000";
    }
    return true;
  }

  if (!useStaticApi()) return;

  let problemsCache = null;
  let loadPromise = null;

  function loadProblems() {
    if (problemsCache) return Promise.resolve(problemsCache);
    if (!loadPromise) {
      loadPromise = fetch("problems.json")
        .then((r) => {
          if (!r.ok) throw new Error("Could not load problems.json");
          return r.json();
        })
        .then((data) => {
          problemsCache = Array.isArray(data.problems) ? data.problems : data;
          return problemsCache;
        });
    }
    return loadPromise;
  }

  function toPublicProblem(problem) {
    const { answer, explanation, source, ...rest } = problem;
    return rest;
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

  function parseExclude(params) {
    const exclude = params.get("exclude");
    if (!exclude) return new Set();
    return new Set(
      exclude
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean)
    );
  }

  function shuffleIds(ids) {
    const deck = [...ids];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function pickRandom(items) {
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  function jsonResponse(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      async json() {
        return body;
      },
    };
  }

  async function handleApi(url, init) {
    const problems = await loadProblems();
    const method = (init && init.method) || "GET";

    if (url.pathname === "/api/stats" && method === "GET") {
      return jsonResponse(200, { total: problems.length });
    }

    if (url.pathname === "/api/categories" && method === "GET") {
      const categories = [...new Set(problems.map((p) => p.category))].sort();
      return jsonResponse(200, { categories });
    }

    if (url.pathname === "/api/problems/ids" && method === "GET") {
      return jsonResponse(200, { ids: problems.map((p) => p.id) });
    }

    const byId = url.pathname.match(/^\/api\/problems\/(\d+)$/);
    if (byId && method === "GET") {
      const id = Number(byId[1]);
      const problem = problems.find((p) => p.id === id);
      if (!problem) return jsonResponse(404, { error: "Question not found" });
      return jsonResponse(200, { problem: toPublicProblem(problem) });
    }

    if (url.pathname === "/api/problems" && method === "GET") {
      const filtered = filterProblems(problems, url.searchParams);
      return jsonResponse(200, {
        problems: filtered.map(toPublicProblem),
        total: filtered.length,
      });
    }

    if (url.pathname === "/api/problems/random" && method === "GET") {
      let filtered = filterProblems(problems, url.searchParams);
      const excludeIds = parseExclude(url.searchParams);
      if (excludeIds.size) {
        filtered = filtered.filter((p) => !excludeIds.has(p.id));
        if (!filtered.length) {
          return jsonResponse(404, {
            error: "No questions remain",
            code: "NO_MORE_QUESTIONS",
          });
        }
      }
      if (!filtered.length) {
        return jsonResponse(404, { error: "No question matched the selected filters" });
      }
      return jsonResponse(200, { problem: toPublicProblem(pickRandom(filtered)) });
    }

    if (url.pathname === "/api/problems/shuffle" && method === "GET") {
      let ids = problems.map((p) => p.id);
      const excludeIds = parseExclude(url.searchParams);
      if (excludeIds.size) ids = ids.filter((id) => !excludeIds.has(id));
      if (!ids.length) {
        return jsonResponse(404, {
          error: "No questions remain",
          code: "NO_MORE_QUESTIONS",
        });
      }
      return jsonResponse(200, { deck: shuffleIds(ids) });
    }

    if (url.pathname === "/api/problems/check" && method === "POST") {
      let body = {};
      try {
        body = init && init.body ? JSON.parse(init.body) : {};
      } catch {
        return jsonResponse(400, { error: "Invalid JSON" });
      }
      const problem = problems.find((p) => p.id === body.id);
      if (!problem) return jsonResponse(404, { error: "Question not found" });
      if (problem.type !== "mcq") {
        return jsonResponse(400, { error: "This question is not an MCQ" });
      }
      const choice = body.choice;
      const validIds = problem.choices.map((c) => c.id);
      if (!choice || !validIds.includes(choice)) {
        return jsonResponse(400, { error: "Invalid choice" });
      }
      const correct = choice === problem.answer;
      const correctChoice = problem.choices.find((c) => c.id === problem.answer);
      return jsonResponse(200, {
        correct,
        correctChoice: correct ? undefined : correctChoice,
        explanation: problem.explanation,
      });
    }

    return jsonResponse(404, { error: "Not found" });
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const path =
      typeof input === "string"
        ? input
        : input && input.url
          ? input.url
          : "";
    try {
      const url = new URL(path, window.location.origin);
      if (url.pathname.startsWith("/api/")) {
        return handleApi(url, init).catch((err) => {
          console.error("[static-api]", err);
          return jsonResponse(500, { error: err.message || "An error occurred" });
        });
      }
    } catch {
      /* not a URL we handle */
    }
    return nativeFetch(input, init);
  };
})();
