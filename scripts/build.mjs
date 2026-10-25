import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { headersFile } from "../cloudflare/security-headers.mjs"
import { buildAnalytics } from "./build-analytics.mjs"
import { applyPostbuildSecurity } from "./postbuild-security.mjs"
import { applyLocalizedMetadata, buildLocalizedSitemap, ensureLanguagePicker, rewriteFooterLanguageLinks, rewriteLocalizedLinks } from "./locale-export.mjs"
import { buildLlmsFull } from "./build-llms-full.mjs"
import { validateEnglishSourceCatalog, validateLocaleCatalogs } from "./translate-site.mjs"
import { renderTranslatedHtml } from "./localization.mjs"
import { validateSeoExport } from "./seo-export-test.mjs"
import { DOWNLOAD_STARTED_PAGE, LOCALES, MARKETING_PAGES, localizedMarketingPath } from "../src/locales/manifest.js"
import { prepareMarketingPartial } from "./marketing-partials.mjs"
import { versionSiteAssets } from "./asset-cache.mjs"
import { changelogTranslations, loadReleases, renderChangelog } from "./changelog.mjs"
import { describeRelease, downloadTranslations, fillDownload, fillVerification, publicDownloadCount, redirectPage, selectDownloadVariant, windowsDownload } from "./download-page.mjs"
await buildAnalytics()

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "src")
const destination = path.join(root, "dist")

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, errorOnExist: false })

// Public link configuration and server gateway/collector share a reviewed manifest.
// A local preview may point at another manifest; a publishable build never sets this.
const downloadManifest = JSON.parse(await readFile(process.env.CODEVALANCHE_DOWNLOAD_PREVIEW_MANIFEST || path.join(root, "supabase/functions/_shared/download-manifest.json"), "utf8"))
const windowsInstaller = windowsDownload(downloadManifest)
const publicConfig = await readFile(path.join(destination, "config.js"), "utf8")
await writeFile(path.join(destination, "config.js"), publicConfig.replace(/window\.CODEVALANCHE_RELEASE_MANIFEST = [^\r\n]+/, () => `window.CODEVALANCHE_RELEASE_MANIFEST = ${JSON.stringify(downloadManifest)}`))
await build({entryPoints:[path.join(source,"downloads.js")],outfile:path.join(destination,"downloads.js"),bundle:true,format:"iife",target:["es2022"],minify:true})

// Render the same navigation on every marketing page so account access cannot drift.
// The thank-you page after a download click shares it, but is not indexed.
const PAGES_WITH_NAVIGATION = [...MARKETING_PAGES, DOWNLOAD_STARTED_PAGE]
const sharedHeader = await readFile(path.join(source, "partials/header.html"), "utf8")
const sharedFooter = await readFile(path.join(source, "partials/footer.html"), "utf8")
for (const page of PAGES_WITH_NAVIGATION) {
  const output = path.join(destination, page.file)
  const html = await readFile(output, "utf8")
  const header = prepareMarketingPartial(sharedHeader, page.path)
  const footer = prepareMarketingPartial(sharedFooter, page.path)
  await writeFile(output, html.replace("<!-- site-header -->", header).replace("<!-- site-footer -->", footer))
}

// Only published versions appear; until the first one, the page says it is on its way.
// A local preview may point at other notes; a publishable build never sets this.
const releases = await loadReleases(process.env.CODEVALANCHE_CHANGELOG_PREVIEW_RELEASES || path.join(root, "content/releases"))
const verificationOutput = path.join(destination, "download/verify/index.html")
await writeFile(verificationOutput, fillVerification(await readFile(verificationOutput, "utf8"), releases, windowsInstaller))
const changelogOutput = path.join(destination, "changelog.html")
await writeFile(changelogOutput, renderChangelog(await readFile(changelogOutput, "utf8"), releases))

// The public download count is the real number from the release host, read only
// when the publishing workflow asks for it, and shown only from a minimum upward.
const downloadPageSettings = JSON.parse(await readFile(path.join(root, "content/download-page.json"), "utf8"))
const publicCount = windowsInstaller && process.env.CODEVALANCHE_PUBLIC_DOWNLOAD_COUNT === "1"
  ? await publicDownloadCount(downloadManifest, { token: process.env.GITHUB_TOKEN ?? "" }) : null
const downloadFill = { releases, count: publicCount, minimum: downloadPageSettings.publicCountMinimum }
// The homepage follows the same manifest, so it never says "in preparation" after a release.
for (const page of ["index.html", "download/index.html", DOWNLOAD_STARTED_PAGE.file]) {
  const output = path.join(destination, page)
  await writeFile(output, fillDownload(selectDownloadVariant(await readFile(output, "utf8"), windowsInstaller), windowsInstaller, downloadFill))
}
const homepage = path.join(destination, "index.html")
await writeFile(homepage, describeRelease(await readFile(homepage, "utf8"), windowsInstaller))
if (windowsInstaller) {
  const redirect = path.join(destination, windowsInstaller.path, "index.html")
  await mkdir(path.dirname(redirect), { recursive: true })
  await writeFile(redirect, redirectPage(windowsInstaller))
}

const homeHtml = await readFile(path.join(destination, "index.html"), "utf8")
const languagePicker = homeHtml.match(/<details class="lang-picker">[\s\S]*?<\/details>/)?.[0]
if (!languagePicker) throw new Error("The existing footer language picker could not be found")
// Local design previews may skip translated output; a publishable build never sets this.
const englishPreviewOnly = process.env.CODEVALANCHE_PREVIEW_ENGLISH_ONLY === "1"
if (!englishPreviewOnly) {
  await validateEnglishSourceCatalog(root)
  await validateLocaleCatalogs(root)
}

const englishPages = new Map()
const includeLocaleBootstrap = html => html.includes('src="/locales/bootstrap.js"')
  ? html
  : html.replace("</body>", '<script type="module" src="/locales/bootstrap.js"></script></body>')
// The thank-you page is not a public route: its language links and canonical
// address lead to the download page, so switching language never downloads again.
const localizeStartedPage = (html, tag) => rewriteFooterLanguageLinks(html, "/download/", tag)
  .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="https://codevalanche.com${localizedMarketingPath("/download/", tag)}">`)
for (const page of PAGES_WITH_NAVIGATION) {
  const output = path.join(destination, page.file)
  let html = await readFile(output, "utf8")
  html = ensureLanguagePicker(html, languagePicker)
  html = rewriteLocalizedLinks(html, "en")
  if (page === DOWNLOAD_STARTED_PAGE) {
    await writeFile(output, includeLocaleBootstrap(localizeStartedPage(html, "en")))
    englishPages.set(page.file, await readFile(output, "utf8"))
    continue
  }
  html = rewriteFooterLanguageLinks(html, page.path, "en")
  html = applyLocalizedMetadata(html, page.path, "en")
  html = includeLocaleBootstrap(html)
  await writeFile(output, html)
  englishPages.set(page.file, html)
}

for (const locale of englishPreviewOnly ? [] : LOCALES.filter(item => item.slug)) {
  const localeCatalog = JSON.parse(await readFile(path.join(source, "locales", `${locale.slug}.json`), "utf8"))
  const catalog = { ...localeCatalog, ...changelogTranslations(releases, locale.tag), ...downloadTranslations(windowsInstaller, { ...downloadFill, tag: locale.tag, catalog: localeCatalog }) }
  for (const page of PAGES_WITH_NAVIGATION) {
    let html = renderTranslatedHtml(englishPages.get(page.file), catalog, locale.tag)
    html = rewriteLocalizedLinks(html, locale.tag)
    if (page === DOWNLOAD_STARTED_PAGE) {
      const output = path.join(destination, locale.slug, page.file)
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, includeLocaleBootstrap(localizeStartedPage(html, locale.tag)))
      continue
    }
    html = rewriteFooterLanguageLinks(html, page.path, locale.tag)
    html = applyLocalizedMetadata(html, page.path, locale.tag)
    html = includeLocaleBootstrap(html)
    const relativeOutput = path.join(locale.slug, page.path === "/" ? "index.html" : page.file)
    const output = path.join(destination, relativeOutput)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, html)
  }
}
await writeFile(path.join(destination, "sitemap.xml"), buildLocalizedSitemap())
for (const privateSource of ["en.json", "glossary.json", "runtime-strings.en.json"]) {
  await rm(path.join(destination, "locales", privateSource), { force: true })
}
// Partials are build inputs, not standalone public documents.
await rm(path.join(destination, "partials"), { recursive: true, force: true })

for (const page of ["account/index.html", "account/authorize/index.html", "account/signed-in/index.html"]) {
  const output = path.join(destination, page)
  let html = await readFile(output, "utf8")
  html = html.replace("</head>", '<script src="/locales/preload.js"></script></head>')
  if (page === "account/signed-in/index.html") html = html.replace("</body>", '<script type="module" src="/locales/bootstrap.js"></script></body>')
  await writeFile(output, html)
}
const llms = englishPreviewOnly ? { pages: 0 } : await buildLlmsFull(destination)

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
await versionSiteAssets(destination)
const security = await applyPostbuildSecurity(destination)
// Cloudflare Pages reads security headers from dist/_headers; GitHub Pages would
// only publish it as a file, so it is written on request. The header CSP carries
// only frame-ancestors/base-uri/object-src/form-action; scripts stay with the meta CSP.
if (process.env.CODEVALANCHE_HEADERS_FILE === "1") await writeFile(path.join(destination, "_headers"), headersFile())
const seo = englishPreviewOnly ? { publicPages: "English preview only, not" } : await validateSeoExport(destination)
console.log(`Built static site to ${destination} (${security.htmlFiles} HTML pages passed CSP; ${seo.publicPages} public routes; ${llms.pages} discovery pages)`)
