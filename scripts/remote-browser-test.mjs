import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
const output =
  process.env.CODEVALANCHE_REMOTE_TEST_OUTPUT ||
  path.resolve("scratchpad/remote-browser");
const bundle = await build({
  entryPoints: ["src/remote/app.js"],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
const userId = "11111111-1111-4111-8111-111111111111";
let configured = false,
  controllerFingerprint = null,
  server;
const csp =
  "default-src 'self';script-src 'self';style-src 'self';connect-src 'self';img-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none'";
server = createServer(async (req, res) => {
  try {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/remote/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(
        `window.CODEVALANCHE_REMOTE=${JSON.stringify({
          enabled: configured,
          origin: null,
          paths: { session: "/fixture/session", hosts: "/fixture/hosts" },
          channelQualified: false,
          runEnabled: false,
        })}`,
      );
      return;
    }
    if (req.url === "/remote/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
      return;
    }
    if (req.url === "/fixture/session") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Set-Cookie",
        "remote-fixture=opaque; HttpOnly; SameSite=Strict; Path=/",
      );
      res.end(
        JSON.stringify({
          ok: true,
          data: {
            authenticated: true,
            principal: {
              userId,
              sessionId: "44444444-4444-4444-8444-444444444444",
            },
            csrfToken: "synthetic-csrf",
            controllerKeyFingerprint: controllerFingerprint,
          },
        }),
      );
      return;
    }
    if (req.url === "/fixture/hosts") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          data: [
            {
              hostId: "22222222-2222-4222-8222-222222222222",
              ownerUserId: userId,
              name: "Studio PC",
              platform: "windows",
              online: true,
              remoteEnabled: false,
              fingerprint: "b".repeat(64),
            },
            {
              hostId: "33333333-3333-4333-8333-333333333333",
              ownerUserId: userId,
              name: "Travel Mac",
              platform: "macos",
              online: false,
              remoteEnabled: true,
              fingerprint: "c".repeat(64),
            },
          ],
        }),
      );
      return;
    }
    const name = new URL(req.url, "http://fixture.invalid").pathname;
    const file = path.join(
      process.cwd(),
      "src",
      name.endsWith("/") ? name + "index.html" : name,
    );
    res.setHeader(
      "Content-Type",
      name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [],
  requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));
await page.addInitScript(() => {
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new Error("Remote must not read account localStorage");
    },
  });
});
try {
  await mkdir(output, { recursive: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/remote/`);
  await page
    .getByText(
      "Remote access is not enabled yet. Keep working on your computer.",
    )
    .waitFor();
  assert.equal(
    requests.some((url) => url.includes("/fixture/")),
    false,
  );
  await page.screenshot({
    path: path.join(output, "remote-disabled.png"),
    fullPage: true,
  });
  controllerFingerprint = await page.evaluate(async (uid) => {
    const { loadControllerIdentity } = await import("/remote/controllerKey.js");
    return (await loadControllerIdentity(uid)).fingerprint;
  }, userId);
  configured = true;
  await page.reload();
  await page.getByRole("heading", { name: "Your computers" }).waitFor();
  await page.getByRole("button", { name: /Studio PC/ }).click();
  await page.getByText("Remote access is off on this computer.").waitFor();
  assert.equal(await page.locator("#remote-stop").isEnabled(), false);
  await page.getByRole("button", { name: /Travel Mac/ }).click();
  await page
    .getByText("This computer is offline. Its enrollment is preserved.")
    .waitFor();
  const cryptoProof = await page.evaluate(async (uid) => {
    const { loadControllerIdentity } = await import("/remote/controllerKey.js");
    const first = await loadControllerIdentity(uid);
    let exportRefused = false;
    try {
      await crypto.subtle.exportKey("jwk", first.keyPair.privateKey);
    } catch {
      exportRefused = true;
    }
    const again = await loadControllerIdentity(uid);
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(
        "codevalanche-remote-controller-v1",
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject();
    });
    const fresh = await loadControllerIdentity(uid);
    return {
      exportRefused,
      persisted: first.fingerprint === again.fingerprint,
      changed: first.fingerprint !== fresh.fingerprint,
      privateExtractable: first.keyPair.privateKey.extractable,
      publicHexLength: first.publicKey.length,
    };
  }, userId);
  assert.deepEqual(cryptoProof, {
    exportRefused: true,
    persisted: true,
    changed: true,
    privateExtractable: false,
    publicHexLength: 130,
  });
  assert.equal(
    await page.evaluate(() => document.cookie.includes("remote-fixture")),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "remote-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  assert.equal(
    requests.some((url) => !url.startsWith(origin)),
    false,
  );
  console.log(
    "PASS real browser: dedicated CSP, no third-party or account storage access, truthful off/offline states, non-exportable persistent controller key + new fingerprint after clear, HttpOnly fixture cookie, mobile width. BFF OAuth/production channel remain unqualified.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
