import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

import { buildAnalytics } from "./build-analytics.mjs"
await buildAnalytics()

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "src")
const destination = path.join(root, "dist")

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, errorOnExist: false })

// Public link configuration and server gateway/collector share a reviewed manifest.
const downloadManifest = JSON.parse(await readFile(path.join(root, "supabase/functions/_shared/download-manifest.json"), "utf8"))
const publicConfig = await readFile(path.join(destination, "config.js"), "utf8")
await writeFile(path.join(destination, "config.js"), publicConfig.replace(/window\.CODEVALANCHE_RELEASE_MANIFEST = [^\r\n]+/, () => `window.CODEVALANCHE_RELEASE_MANIFEST = ${JSON.stringify(downloadManifest)}`))
await build({entryPoints:[path.join(source,"downloads.js")],outfile:path.join(destination,"downloads.js"),bundle:true,format:"iife",target:["es2022"],minify:true})

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
console.log(`Built static site to ${destination}`)
