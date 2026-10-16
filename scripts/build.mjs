import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { headersFile } from "../cloudflare/security-headers.mjs"
import { addContentSecurityPolicyMeta, publicConfigValue } from "./page-csp.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "src")
const destination = path.join(root, "dist")

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, errorOnExist: false })

// Render the same navigation on every marketing page so account access cannot drift.
const sharedHeader = await readFile(path.join(source, "partials/header.html"), "utf8")
for (const page of ["index.html", "changelog.html", "privacy.html", "terms.html"]) {
  const output = path.join(destination, page)
  const html = await readFile(output, "utf8")
  const header = page === "changelog.html"
    ? sharedHeader.replaceAll('href="/changelog.html"', 'href="/changelog.html" aria-current="page"')
    : sharedHeader
  await writeFile(output, html.replace("<!-- site-header -->", header))
}

await build({ entryPoints: [path.join(source, "account/app.js")], outfile: path.join(destination, "account/app.js"), bundle: true, format: "esm", minify: true, target: ["es2022"], legalComments: "eof" })
// Version the completed bundle, styles and public configuration so a new page
// cannot reuse an older cached account implementation after deployment.
const assets = ["/account/app.js", "/account/account.css", "/config.js"]
const versions = await Promise.all(assets.map(async (asset) => {
  const content = await readFile(path.join(destination, asset))
  return [asset, createHash("sha256").update(content).digest("hex").slice(0, 16)]
}))
for (const page of ["account/index.html", "account/authorize/index.html"]) {
  const output = path.join(destination, page)
  let html = await readFile(output, "utf8")
  for (const [asset, version] of versions) html = html.replaceAll(`"${asset}"`, `"${asset}?v=${version}"`)
  await writeFile(output, html)
}
// Content Security Policy on every page as <meta>, so it holds on any host
// (GitHub Pages cannot send headers). Inline scripts are allowed by their
// exact hash; anything injected later is refused.
const publicConfig = await readFile(path.join(destination, "config.js"), "utf8")
const supabaseUrl = publicConfigValue(publicConfig, "supabaseUrl"), apiOrigin = publicConfigValue(publicConfig, "apiOrigin")
async function htmlPages(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? (entry.name === "partials" ? [] : htmlPages(path.join(dir, entry.name)))
    : [entry.name.endsWith(".html") ? path.join(dir, entry.name) : null]))
  return nested.flat().filter(Boolean)
}
for (const output of await htmlPages(destination)) {
  const html = await readFile(output, "utf8")
  const relative = path.relative(destination, output).split(path.sep).join("/")
  await writeFile(output, addContentSecurityPolicyMeta(html, { relative, supabaseUrl, apiOrigin }))
}
// Cloudflare Pages reads security headers from dist/_headers; GitHub Pages would
// only publish it as a file, so it is written on request.
if (process.env.CODEVALANCHE_HEADERS_FILE === "1") await writeFile(path.join(destination, "_headers"), headersFile())
console.log(`Built static site to ${destination}`)
