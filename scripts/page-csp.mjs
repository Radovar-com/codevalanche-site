// Writes the per-page Content Security Policy <meta> (used by scripts/build.mjs).
import { createHash } from "node:crypto"
import { pageContentSecurityPolicy } from "../cloudflare/security-headers.mjs"

// Browsers hash the script text after the HTML parser turned CRLF/CR into LF,
// so the build does the same (a Windows checkout has CRLF files).
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => createHash("sha256").update(match[1].replace(/\r\n?/g, "\n")).digest("base64"))
}

export function publicConfigValue(configSource, key) {
  return configSource.match(new RegExp(`${key}: "([^"]*)"`))?.[1] || ""
}

/** relative: the page path inside dist, with forward slashes. */
export function addContentSecurityPolicyMeta(html, { relative, supabaseUrl = "", apiOrigin = "" }) {
  if (/http-equiv="Content-Security-Policy"/i.test(html)) throw new Error(`${relative}: already has a CSP meta`)
  const charset = /<meta charset="utf-8">/i
  if (!charset.test(html)) throw new Error(`${relative}: <meta charset="utf-8"> is required before the CSP meta`)
  const account = relative.startsWith("account/") || relative === "account.html"
  const policy = pageContentSecurityPolicy({ account, inlineScriptHashes: inlineScriptHashes(html), supabaseUrl, apiOrigin })
  return html.replace(charset, (tag) => `${tag}<meta http-equiv="Content-Security-Policy" content="${policy}">`)
}
