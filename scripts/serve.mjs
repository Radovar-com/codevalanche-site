import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist")
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json" }

const port = Number(process.argv[2] || process.env.CODEVALANCHE_PORT || 4173)

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname)
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1)
  const file = path.resolve(root, relative)
  if (!file.startsWith(`${root}${path.sep}`) && file !== root) { response.writeHead(400); response.end("Bad request"); return }
  try { const body = await readFile(file); response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }); response.end(body) }
  catch { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found") }
}).listen(port, "127.0.0.1", () => console.log(`Codevalanche preview at http://127.0.0.1:${port}`))
