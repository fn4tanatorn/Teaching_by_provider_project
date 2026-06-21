const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { routeApi, sendError, sendJson } = require("./livequiz/server");

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

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Teaching web app: http://localhost:${PORT}`);
  console.log(`LiveQuiz:         http://localhost:${PORT}/livequiz/`);
});
