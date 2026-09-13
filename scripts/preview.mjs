import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const route = pathname === "/" ? "/index.html" : ["/projects", "/projects/"].includes(pathname) ? "/projects/index.html" : pathname;
    const file = resolve(root, `.${route}`);
    if (!file.startsWith(root + sep) || !types[extname(file)] || pathname.split("/").some(p => p.startsWith("."))) {
      res.writeHead(404).end(); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)], "Cache-Control": "no-store" }).end(data);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(4173, "127.0.0.1", () => console.log("Preview: http://localhost:4173"));

