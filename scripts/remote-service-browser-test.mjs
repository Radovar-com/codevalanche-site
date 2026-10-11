import assert from "node:assert/strict";
import { createServer, request } from "node:https";
import { connect as tlsConnect } from "node:tls";
import { once } from "node:events";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
const producer = path.resolve(
  process.env.CODEVALANCHE_REMOTE_SOURCE || "../users-remote-service-20261011",
);
const load = (name) => import(pathToFileURL(path.join(producer, name)).href);
const [
  { loopbackTls },
  { setupDb },
  { syntheticOAuthProvider },
  { canonical, owner, sessionId },
  { PostgresRemoteStore },
  { PersistentRegistry },
  { PersistentCommandBroker },
  { PossessionChallenges },
  { createQualificationServer },
  { BrowserSessions },
  { OAuthProviderClient },
  { createSitePolicyAdapter },
  { suite, fingerprintKey, createBoundQualificationChannel },
  { deliveryClient },
] = await Promise.all(
  [
    "tests/helpers/tls.mts",
    "tests/helpers/persistent.mts",
    "tests/helpers/oauthProvider.mts",
    "tests/fixtures.mts",
    "src/storage/postgres.ts",
    "src/registry/persistentRegistry.ts",
    "src/authorization/persistentBroker.ts",
    "src/channel/possession.ts",
    "src/transport/qualificationServer.ts",
    "src/web/session.ts",
    "src/web/oauthCallback.ts",
    "src/authorization/sitePolicyAdapter.ts",
    "src/channel/standardChannel.ts",
    "tests/helpers/channelSession.mts",
  ].map(load),
);
const WebSocket = createRequire(path.join(producer, "package.json"))("ws");
const output = path.resolve(
  process.env.CODEVALANCHE_REMOTE_TEST_OUTPUT ||
    "scratchpad/remote-service-browser",
);
const tls = await loopbackTls(),
  db = await setupDb(),
  provider = await syntheticOAuthProvider();
let service, browser, hostSocket, hostChannel, hostDelivery;
const hostErrors = [],
  dispatched = [];
const bundle = await build({
  stdin: {
    contents: `export {createBrowserBffClient} from './src/remote/bffClient.js';export {createBrowserController} from './src/remote/controllerClient.js';export {prepareControllerLogin,loadControllerIdentity} from './src/remote/controllerKey.js';export {createBrowserRelay} from './src/remote/browserRelay.js';export {createRemoteOperations} from './src/remote/remoteOperations.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
const csp =
  "default-src 'self';script-src 'self';style-src 'self';connect-src 'self';img-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none'";
const appBundle = await build({
  entryPoints: ["src/remote/app.js"],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
// Dedicated loopback test gateway: only exact BFF routes and relay upgrade reach the real producer.
const gateway = createServer(tls, async (req, res) => {
  if (req.url.startsWith("/bff/")) {
    const upstream = request(
      service.url + req.url,
      {
        method: req.method,
        ca: tls.cert,
        headers: { ...req.headers, host: new URL(service.url).host },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
    return;
  }
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/remote/probe.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
    return;
  }
  if (req.url === "/remote/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(appBundle.outputFiles[0].text);
    return;
  }
  if (req.url === "/remote/config.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(
      `window.CODEVALANCHE_REMOTE=${JSON.stringify({ enabled: true, discoveryEnabled: true, localQualification: true, origin: null, authorizationOrigins: [provider.origin], runEnabled: false })}`,
    );
    return;
  }
  if (req.url === "/remote/remote.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(await readFile("src/remote/remote.css"));
    return;
  }
  if (req.url === "/remote/ui/") {
    res.setHeader("Content-Type", "text/html");
    res.end(await readFile("src/remote/index.html"));
    return;
  }
  if (req.url === "/remote/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      "<!doctype html><title>Remote loopback qualification</title><main>Explicit synthetic host qualification</main>",
    );
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
const origin = `https://127.0.0.1:${gateway.address().port}`;
gateway.on("upgrade", (req, socket, head) => {
  if (req.url !== "/v1/connect") {
    socket.destroy();
    return;
  }
  const target = new URL(service.url);
  const upstream = tlsConnect(
    { host: target.hostname, port: Number(target.port), ca: tls.cert },
    () => {
      const headers = { ...req.headers, host: target.host };
      upstream.write(
        `GET /v1/connect HTTP/1.1\r\n${Object.entries(headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    },
  );
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
});
const actor = { userId: owner, sessionId };
const state = canonical();
state.principal.mfaVerifiedAt = new Date().toISOString();
const store = new PostgresRemoteStore({
    db,
    resolveCanonical: async () => structuredClone(state),
    wallNow: Date.now,
  }),
  challenges = new PossessionChallenges(),
  registry = new PersistentRegistry({
    store,
    verifyKeyProof: challenges.verify.bind(challenges),
    browserOrigins: [origin],
  }),
  broker = new PersistentCommandBroker({
    store,
    verifyKeyProof: challenges.verify.bind(challenges),
  });
const sessions = new BrowserSessions({
  origin,
  returnToAllowlist: ["/remote/"],
  oauth: new OAuthProviderClient({
    issuer: provider.origin,
    discoveryUrl: provider.origin + "/.well-known/openid-configuration",
    clientId: "synthetic-bff",
    redirectUri: origin + "/bff/callback",
    mode: "local-qualification",
  }),
  canonical: createSitePolicyAdapter({
    endpoint: provider.origin + "/functions/v1/codevalanche-account",
    publicApiKey: "synthetic-public",
    evidenceAction: "remote.policy.evidence",
    mode: "local-qualification",
  }),
  registry,
  broker,
  challenges,
  onLogout: (a) => service.disconnectActorSession(a),
});
service = createQualificationServer({
  enabled: true,
  mode: "local-qualification",
  tls,
  registry,
  broker,
  challenges,
  browserOrigins: [origin],
  browserSessions: sessions,
  authenticate: async (token) => {
    if (token !== "synthetic-host-token") throw Error("sign_in_required");
    return actor;
  },
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function call(route, body) {
  return await new Promise((resolve, reject) => {
    const r = request(
      service.url + route,
      {
        method: "POST",
        ca: tls.cert,
        headers: {
          Authorization: "Bearer synthetic-host-token",
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (b) => (raw += b));
        res.on("end", () => {
          const result = JSON.parse(raw);
          res.statusCode === 200
            ? resolve(result.data)
            : reject(Error(JSON.stringify(result)));
        });
      },
    );
    r.on("error", reject);
    r.end(JSON.stringify(body));
  });
}
const hostKeys = await suite.kem.generateKeyPair(),
  hostFingerprint = await fingerprintKey(hostKeys.publicKey),
  hostPublicKey = Buffer.from(
    await suite.kem.serializePublicKey(hostKeys.publicKey),
  ).toString("hex");
async function proof(purpose) {
  const c = await call("/v1/key-challenges", {
      publicKey: hostPublicKey,
      purpose,
    }),
    ctx = await suite.createRecipientContext({
      recipientKey: hostKeys,
      enc: Buffer.from(c.enc, "hex"),
      info: new TextEncoder().encode(c.info),
    });
  return {
    challengeId: c.challengeId,
    response: Buffer.from(
      await ctx.open(Buffer.from(c.ciphertext, "hex")),
    ).toString("hex"),
  };
}
try {
  await service.start();
  const host = await call("/v1/hosts", {
    name: "Synthetic Studio",
    platform: "windows",
    publicKey: hostPublicKey,
    fingerprint: hostFingerprint,
    proof: await proof("enroll-host"),
  });
  await call("/v1/host-state", {
    hostId: host.hostId,
    enabled: true,
    proof: await proof(`host-enabled:${host.hostId}:true`),
  });
  const ticket = (
    await call("/v1/tickets", {
      deviceId: host.hostId,
      role: "host",
      fingerprint: hostFingerprint,
      kind: "native",
      proof: await proof("ticket-issue:local-remote:native:"),
    })
  ).ticket;
  hostSocket = new WebSocket(
    service.url.replace("https:", "wss:") + "/v1/connect",
    { ca: tls.cert },
  );
  await once(hostSocket, "open");
  const hostReadyPromise = once(hostSocket, "message");
  hostSocket.send(
    JSON.stringify({
      type: "authenticate",
      token: "synthetic-host-token",
      ticket,
      fingerprint: hostFingerprint,
      kind: "native",
      proof: await proof(`ticket-consume:${ticket}:local-remote`),
    }),
  );
  const hostReady = JSON.parse((await hostReadyPromise)[0].toString());
  assert.equal(hostReady.type, "ready");
  hostSocket.on("message", async (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === "channel.session") {
        hostChannel?.close();
        hostDelivery?.close();
        const controller = await db.query(
          "SELECT public_key FROM cv_remote.controllers WHERE controller_id=$1",
          [m.session.controllerId],
        );
        hostDelivery = deliveryClient(hostSocket, m.session, "host");
        hostChannel = await createBoundQualificationChannel({
          localIdentity: hostKeys,
          pinnedPeer: {
            publicKey: await suite.kem.deserializePublicKey(
              Buffer.from(controller.rows[0].public_key, "hex"),
            ),
            fingerprint: m.session.controllerKeyFingerprint,
          },
          session: m.session,
          side: "host",
          delivery: hostDelivery,
        });
      }
      if (m.type === "dispatch") {
        assert.ok(hostChannel);
        const plaintext = JSON.parse(
          new TextDecoder().decode(await hostChannel.open(m.packet)),
        );
        dispatched.push({ envelope: m.packet.envelope, payload: plaintext });
        const e = m.packet.envelope,
          result =
            e.operation === "project.list"
              ? {
                  projects: [
                    { projectId: "project-a", name: "Synthetic project" },
                  ],
                }
              : e.operation === "run.stop"
                ? { status: "confirmed" }
                : plaintext.conversationId
                  ? {
                      messages: [
                        {
                          role: "assistant",
                          text: "Harmless synthetic host read",
                        },
                      ],
                    }
                  : {
                      conversations: [
                        {
                          conversationId: "conversation-a",
                          title: "Synthetic conversation",
                        },
                      ],
                    };
        const bytes = new TextEncoder().encode(JSON.stringify(result));
        const packet = await hostChannel.seal(
          { ...e, payloadHash: hash(bytes) },
          bytes,
        );
        hostSocket.send(JSON.stringify({ type: "response", packet }));
        hostSocket.send(
          JSON.stringify({
            type: "receipt",
            commandId: e.commandId,
            receipt: { state: "completed", outcome: "success" },
          }),
        );
      }
    } catch (error) {
      hostErrors.push(error.message);
    }
  });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("account_storage_forbidden");
      },
    }),
  );
  await page.goto(origin + "/remote/");
  const authorization = await page.evaluate(async () => {
    const sdk = await import("/remote/probe.js");
    globalThis.sdk = sdk;
    const bff = sdk.createBrowserBffClient({
      origin: location.origin,
      pageOrigin: location.origin,
      configured: true,
    });
    try {
      await bff.session();
    } catch (e) {
      if (e.code !== "sign_in_required") throw e;
    }
    const identity = await sdk.prepareControllerLogin();
    return (await bff.beginLogin({ controllerPublicKey: identity.publicKey }))
      .authorizationUrl;
  });
  await page.goto(authorization);
  assert.equal(page.url(), origin + "/remote/");
  const enrolled = await page.evaluate(async () => {
    globalThis.sdk = await import("/remote/probe.js");
    globalThis.bff = sdk.createBrowserBffClient({
      origin: location.origin,
      pageOrigin: location.origin,
      configured: true,
    });
    globalThis.controller = sdk.createBrowserController({ bff });
    await controller.open();
    return await controller.enroll("Synthetic browser");
  });
  assert.equal(enrolled.ownerUserId, owner);
  const pending = await page.evaluate(
    async (hostId) => await controller.manualPairing(hostId),
    host.hostId,
  );
  assert.equal(
    (await db.query("SELECT count(*) AS n FROM cv_remote.grants")).rows[0].n,
    0,
  );
  assert.equal(pending.controllerKeyFingerprint, enrolled.fingerprint);
  const scope = {
      projectIds: ["project-a"],
      operations: ["project.list", "conversation.read", "run.stop"],
      projectBindingVersions: { "project-a": 1 },
    },
    scopeDigest = hash(
      JSON.stringify([
        scope.projectIds,
        scope.operations,
        scope.projectIds.map((id) => [id, scope.projectBindingVersions[id]]),
      ]),
    );
  const grant = await call("/v1/pairing/approve", {
    pairingRequestId: pending.pairingRequestId,
    scope,
    proof: await proof(
      `pairing-approve:${pending.pairingRequestId}:${scopeDigest}`,
    ),
  });
  const result = await page.evaluate(async (selection) => {
    const details = await controller.grant(selection.hostId, selection.grantId);
    globalThis.relay = sdk.createBrowserRelay({
      controller,
      origin: location.origin,
      qualification: true,
    });
    await relay.connect();
    await relay.openGrant(details.grant, details.hostPublicKey);
    const projects = await relay.command({
        projectId: "project-a",
        operation: "project.list",
      }),
      read = await relay.command({
        projectId: "project-a",
        operation: "conversation.read",
        payload: { conversationId: "conversation-a" },
      }),
      stopId = crypto.randomUUID(),
      stop = await relay.command({
        projectId: "project-a",
        operation: "run.stop",
        commandId: stopId,
      });
    let spentRetryError = null;
    try {
      await relay.command({
        projectId: "project-a",
        operation: "run.stop",
        commandId: stopId,
      });
    } catch (error) {
      spentRetryError = error.message;
    }
    return {
      projects,
      read,
      stop,
      stopId,
      spentRetryError,
      spentStatus: relay.commandStatus(stopId),
      identity: {
        extractable: controller.context().keyPair.privateKey.extractable,
      },
      cookie: document.cookie,
    };
  }, grant);
  assert.equal(result.read.messages[0].text, "Harmless synthetic host read");
  assert.equal(result.stop.status, "confirmed");
  assert.equal(result.spentRetryError, "result_unknown");
  assert.equal(result.spentStatus.status, "result_received");
  assert.equal("result" in result.spentStatus, false);
  assert.equal("payload" in result.spentStatus, false);
  assert.equal(result.identity.extractable, false);
  assert.equal(result.cookie, "");
  const sessionCookie = (await context.cookies()).find(
    (c) => c.name === "__Host-cv_remote_session",
  );
  assert.equal(sessionCookie?.httpOnly, true);
  assert.equal(sessionCookie?.secure, true);
  assert.equal(sessionCookie?.sameSite, "Lax");
  assert.equal(dispatched.length, 3);
  assert.equal(dispatched[2].envelope.commandId, result.stopId);
  assert.equal(
    dispatched.every(
      (d) =>
        d.envelope.hostId === host.hostId &&
        d.envelope.controllerId === enrolled.controllerId &&
        d.envelope.projectId === "project-a",
    ),
    true,
  );
  await new Promise((r) => setTimeout(r, 50));
  const journal = await db.query(
    "SELECT command_id,state,receipt FROM cv_remote.command_journal ORDER BY updated_at",
  );
  assert.equal(journal.rows.length, 3);
  assert.equal(
    journal.rows.every((r) => r.state === "completed"),
    true,
  );
  assert.equal(
    JSON.stringify(journal.rows).includes("Harmless synthetic"),
    false,
  );
  assert.deepEqual(hostErrors, []);
  assert.deepEqual(errors, []);
  await page.evaluate(() => relay.close());
  if (process.env.CODEVALANCHE_REMOTE_DISCOVERY_REVIEWED === "1") {
    await page.goto(origin + "/remote/ui/");
    await page.getByRole("button", { name: /Synthetic Studio/ }).click();
    await page
      .getByRole("option", { name: "Synthetic project" })
      .waitFor({ state: "attached" });
    await page.locator("#projects").selectOption("project-a");
    await page
      .getByRole("button", { name: "Synthetic conversation", exact: true })
      .click();
    await page
      .getByText("Harmless synthetic host read", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Stop agent", exact: true }).click();
    await page
      .getByText("The host confirmed the stop request.", { exact: true })
      .waitFor();
    assert.equal(dispatched.length, 7);
    assert.equal(
      await page.locator("#target-name").textContent(),
      "Synthetic Studio",
    );
    assert.equal(await page.locator("#projects").inputValue(), "project-a");
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, "actual-ui.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  } else
    await page.evaluate(async () => {
      controller.clear();
      await bff.logout();
    });
  await page.goto(origin + "/remote/");
  const reloginAuthorization = await page.evaluate(async () => {
    globalThis.sdk = await import("/remote/probe.js");
    const bff = sdk.createBrowserBffClient({
      origin: location.origin,
      pageOrigin: location.origin,
      configured: true,
    });
    try {
      await bff.session();
    } catch (e) {
      if (e.code !== "sign_in_required") throw e;
    }
    const identity = await sdk.prepareControllerLogin();
    return (await bff.beginLogin({ controllerPublicKey: identity.publicKey }))
      .authorizationUrl;
  });
  await page.goto(reloginAuthorization);
  const rebound = await page.evaluate(async (grant) => {
    const sdk = await import("/remote/probe.js");
    const bff = sdk.createBrowserBffClient({
      origin: location.origin,
      pageOrigin: location.origin,
      configured: true,
    });
    const controller = sdk.createBrowserController({ bff });
    await controller.open();
    const detail = await controller.grant(grant.hostId, grant.grantId);
    return {
      controllerId: controller.state().controllerId,
      grantId: detail.grant.grantId,
    };
  }, grant);
  assert.equal(rebound.controllerId, enrolled.controllerId);
  assert.equal(rebound.grantId, grant.grantId);
  assert.equal(
    (await db.query("SELECT count(*) AS n FROM cv_remote.controllers")).rows[0]
      .n,
    1,
  );
  const afterClear = await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase("codevalanche-remote-controller-v1");
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    const sdk = await import("/remote/probe.js"),
      bff = sdk.createBrowserBffClient({
        origin: location.origin,
        pageOrigin: location.origin,
        configured: true,
      }),
      controller = sdk.createBrowserController({ bff });
    try {
      await controller.open();
      return "unexpected";
    } catch (e) {
      return e.message;
    }
  });
  assert.equal(afterClear, "controller_key_changed");
  assert.deepEqual(errors, []);
  assert.deepEqual(hostErrors, []);
  await mkdir(output, { recursive: true });
  const receipt = {
    accepted: false,
    status: "synthetic-loopback-only",
    producerSource: {
      path: producer,
      archiveCommit: process.env.CODEVALANCHE_REMOTE_SOURCE_COMMIT || null,
      namespace: "cv_remote",
    },
    browserVersion: browser.version(),
    strictCsp: true,
    oauthPkceCallback: true,
    nonexportableIdbKey: true,
    httpOnlySecureCookie: true,
    manualHostApproval: true,
    actualTlsWss: true,
    sqlSession: true,
    hpkeAuth: true,
    deliveryConsume: true,
    hostRead: true,
    stopCorrelation: true,
    spentCommandIdRequiresReceiptRecovery: true,
    commandStatusMetadataOnly: true,
    metadataOnlyJournal: true,
    reloginUsesActualProofBoundController: true,
    clearedStorageRefusesOldController: true,
    actualUiDiscovery:
      process.env.CODEVALANCHE_REMOTE_DISCOVERY_REVIEWED === "1",
    productionEnabled: false,
    nativeRun: false,
    liveProvider: false,
    physicalPlatformContainment: false,
  };
  await writeFile(
    path.join(output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const activePage = browser?.contexts()[0]?.pages()[0];
  if (activePage) {
    console.error(
      "Browser boundary state",
      await activePage
        .locator("#remote-status")
        .textContent()
        .catch(() => null),
    );
    await mkdir(output, { recursive: true });
    await activePage
      .screenshot({ path: path.join(output, "failed-ui.png"), fullPage: true })
      .catch(() => {});
  }
  console.error(
    "Host boundary diagnostics",
    JSON.stringify({
      hostErrors,
      dispatched: dispatched.map((d) => d.envelope.operation),
      metadata: service?.metadata(),
    }),
  );
  throw error;
} finally {
  hostChannel?.close();
  hostDelivery?.close();
  hostSocket?.terminate();
  await browser?.close();
  await service?.close();
  gateway.closeAllConnections();
  await new Promise((r) => gateway.close(r));
  await provider.close();
  await db.close();
}
