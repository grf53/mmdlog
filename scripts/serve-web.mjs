#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".mmdlog": "text/plain; charset=utf-8",
  ".mmdl": "text/plain; charset=utf-8",
  ".gif": "image/gif",
  ".png": "image/png"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}/`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/examples/web/index.html";
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(ROOT, "." + path);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain" });
    res.end(err.message);
  }
});

server.listen(PORT, () => {
  console.log(`mmdlog web demo: http://localhost:${PORT}/examples/web/`);
});
