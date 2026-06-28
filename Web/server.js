const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { routeApi, sendError, sendJson } = require("./livequiz/server");
const { handler: flashcardsApi } = require("../netlify/functions/flashcards-api");
const { handler: imageUploadApi } = require("../netlify/functions/image-upload");
const { handler: presenceApi } = require("../netlify/functions/presence-api");

const PORT = process.env.PORT || 3000;
const WEB_DIR = __dirname;

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
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  if (filePath.endsWith("/")) filePath += "index.html";
  filePath = path.normalize(path.join(WEB_DIR, filePath));

  if (!filePath.startsWith(WEB_DIR)) {
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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/livequiz/api/")) {
    const livequizUrl = new URL(req.url, `http://localhost:${PORT}`);
    livequizUrl.pathname = url.pathname.replace(/^\/livequiz\/api/, "/api");
    try {
      await routeApi(req, res, livequizUrl);
    } catch (err) {
      console.error(err);
      sendError(res, err);
    }
    return;
  }

  if (url.pathname === "/.netlify/functions/flashcards-api") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      const result = await flashcardsApi({
        httpMethod: req.method,
        path: url.pathname,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
        body,
        isBase64Encoded: false,
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: err.message || "Flashcard bank error" });
    }
    return;
  }

  if (url.pathname === "/.netlify/functions/image-upload") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuffer = Buffer.concat(chunks);
      const result = await imageUploadApi({
        httpMethod: req.method,
        path: url.pathname,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
        body: bodyBuffer.toString("base64"),
        isBase64Encoded: true,
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: err.message || "Image upload error" });
    }
    return;
  }

  if (url.pathname === "/.netlify/functions/presence-api") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      const result = await presenceApi({
        httpMethod: req.method,
        path: url.pathname,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
        body,
        isBase64Encoded: false,
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: err.message || "Presence error" });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Teaching web app: http://localhost:${PORT}`);
  console.log(`LiveQuiz:         http://localhost:${PORT}/livequiz/`);
});
