import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteCompanion } from "../src/remote/model.js";
import { createBrowserBffClient } from "../src/remote/bffClient.js";
const userId = "11111111-1111-4111-8111-111111111111",
  a = "22222222-2222-4222-8222-222222222222",
  b = "33333333-3333-4333-8333-333333333333";
const session = {
  authenticated: true,
  principal: { userId, sessionId: "44444444-4444-4444-8444-444444444444" },
  csrfToken: "synthetic-csrf",
};
const hosts = [
  {
    hostId: a,
    ownerUserId: userId,
    name: "Studio PC",
    platform: "windows",
    online: true,
    remoteEnabled: true,
    fingerprint: "b".repeat(64),
  },
  {
    hostId: b,
    ownerUserId: userId,
    name: "Travel Mac",
    platform: "macos",
    online: true,
    remoteEnabled: true,
    fingerprint: "c".repeat(64),
  },
];
const identity = { fingerprint: "a".repeat(64) };
const grant = (hostId) => ({
  grantId: "66666666-6666-4666-8666-666666666666",
  ownerUserId: userId,
  hostId,
  controllerId: "77777777-7777-4777-8777-777777777777",
  projectIds: ["one", "two"],
  operations: ["project.list", "conversation.read"],
  allowedNativeProfiles: [],
  projectBindingVersions: { one: 1, two: 1 },
  nativeCatalogDigest: null,
  policyVersion: 1,
  grantVersion: 1,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  hostKeyFingerprint: hosts.find((h) => h.hostId === hostId).fingerprint,
  controllerKeyFingerprint: identity.fingerprint,
});
const service = () => ({
  session: async () => session,
  hosts: async () => hosts,
  grant: async (hostId) => grant(hostId),
  projects: async () => [{ projectId: "one", name: "Example project" }],
});
test("channel withdrawal reported as Error message clears decrypted view and capabilities", async () => {
  const api = service();
  api.conversations = async () => [{ conversationId: "one", title: "One" }];
  let withdrawn = false;
  api.readConversation = async () => {
    if (withdrawn) throw Error("grant_revoked");
    return { messages: [{ text: "previous plaintext" }] };
  };
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  await model.readConversation("one");
  assert.equal(
    model.state().conversation.messages[0].text,
    "previous plaintext",
  );
  withdrawn = true;
  await model.readConversation("one");
  assert.equal(model.state().conversation, null);
  assert.equal(model.state().canRead, false);
  assert.equal(model.state().status, "signed-out");
});
test("late project response from the previous host cannot replace the visible target", async () => {
  const api = service();
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  api.projects = (hostId) =>
    hostId === a
      ? new Promise((resolve) => {
          release = resolve;
          started();
        })
      : Promise.resolve([{ projectId: "two", name: "Travel project" }]);
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  const old = model.selectHost(a);
  await ready;
  await model.selectHost(b);
  release([{ projectId: "one", name: "Old studio project" }]);
  await old;
  assert.equal(model.state().hostId, b);
  assert.equal(model.state().projects[0].projectId, "two");
});
test("a foreign or unknown host deep link is rejected", async () => {
  const api = service();
  api.hosts = async () => [
    ...hosts,
    {
      ...hosts[0],
      hostId: "55555555-5555-4555-8555-555555555555",
      ownerUserId: "foreign",
    },
  ];
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  await assert.rejects(
    () => model.selectHost("55555555-5555-4555-8555-555555555555"),
    /host_forbidden/,
  );
  assert.equal(model.state().hostId, null);
});
test("selection is not permission and unqualified native Run stays disabled", async () => {
  const model = createRemoteCompanion({
    api: service(),
    identity: async () => identity,
  });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  assert.equal(model.state().canRun, false);
  assert.equal(model.state().canStop, false);
});
test("account withdrawal fences held responses and clears decrypted conversation", async () => {
  const api = service();
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  api.projects = () =>
    new Promise((resolve) => {
      release = resolve;
      started();
    });
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  const old = model.selectHost(a);
  await ready;
  model.withdraw();
  release([{ projectId: "one", name: "private" }]);
  await old;
  assert.equal(model.state().status, "signed-out");
  assert.equal(model.state().projects.length, 0);
  assert.equal(model.state().conversation, null);
});
test("browser BFF mutation uses same-origin cookie and CSRF without bearer access", async () => {
  let seen;
  const api = createBrowserBffClient({
    origin: "https://remote.example.test",
    pageOrigin: "https://remote.example.test",
    configured: true,
    paths: {
      session: "/web/session",
      hosts: "/web/hosts",
      logout: "/web/logout",
    },
    fetch: async (url, init) => {
      seen = { url, init };
      return Response.json({ ok: true, data: { ...session } });
    },
  });
  await api.session();
  await api.logout();
  assert.equal(seen.init.credentials, "same-origin");
  assert.equal(seen.init.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.equal(seen.init.headers.Authorization, undefined);
  assert.equal(seen.url, "https://remote.example.test/web/logout");
});
test("cross-origin BFF and unconfigured service fail before network", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
  };
  assert.throws(
    () =>
      createBrowserBffClient({
        origin: "https://evil.test",
        pageOrigin: "https://remote.example.test",
        configured: true,
        fetch,
      }),
    /origin_forbidden/,
  );
  const api = createBrowserBffClient({
    origin: "https://remote.example.test",
    pageOrigin: "https://remote.example.test",
    configured: false,
    fetch,
  });
  await assert.rejects(() => api.session(), /remote_not_configured/);
  assert.equal(calls, 0);
});
test("disconnect never permits a stop using a cached grant", async () => {
  const api = service();
  let calls = 0;
  api.grant = async (hostId) => ({
    ...grant(hostId),
    operations: ["project.list", "run.stop"],
  });
  api.stop = async () => {
    calls++;
    return { status: "confirmed" };
  };
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  assert.equal(model.state().canStop, true);
  model.disconnected();
  await assert.rejects(() => model.stop(), /stop_forbidden/);
  assert.equal(calls, 0);
});
test("exact BFF bootstrap/login contract keeps OAuth credentials server-side and works before authentication", async () => {
  const calls = [];
  const api = createBrowserBffClient({
    origin: "https://remote.example.test",
    pageOrigin: "https://remote.example.test",
    configured: true,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(
        url.endsWith("/bff/session")
          ? {
              authenticated: false,
              csrfToken: "bootstrap-csrf",
              remoteEnabled: false,
              runEnabled: false,
            }
          : {
              authorizationUrl:
                "https://auth.example.test/authorize?state=synthetic",
            },
      );
    },
  });
  await assert.rejects(() => api.session(), /sign_in_required/);
  const result = await api.beginLogin({
    controllerPublicKey: "04" + "1".repeat(128),
    returnTo: "/remote/",
  });
  assert.equal(
    result.authorizationUrl,
    "https://auth.example.test/authorize?state=synthetic",
  );
  assert.equal(calls[1].url, "https://remote.example.test/bff/login");
  assert.equal(calls[1].init.headers["X-CSRF-Token"], "bootstrap-csrf");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    controllerPublicKey: "04" + "1".repeat(128),
    returnTo: "/remote/",
  });
  assert.equal(calls[1].init.headers.Authorization, undefined);
});
test("a conversation arriving after grant expiration is never rendered", async () => {
  const api = service();
  let now = Date.now(),
    release;
  api.conversations = async () => [
    { conversationId: "conversation-one", title: "Synthetic" },
  ];
  api.readConversation = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const model = createRemoteCompanion({
    api,
    identity: async () => identity,
    now: () => now,
  });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  const pending = model.readConversation("conversation-one");
  now += 1200000;
  release({
    messages: [{ role: "assistant", text: "stale private response" }],
  });
  await pending;
  assert.equal(model.state().conversation, null);
});
test("missing presence data is unknown and does not authorize a connection", async () => {
  const api = service();
  let called = false;
  api.hosts = async () => [{ ...hosts[0], online: undefined }];
  api.grant = async () => {
    called = true;
    return grant(a);
  };
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  assert.equal(model.state().hosts[0].online, null);
  await model.selectHost(a);
  assert.equal(model.state().authorization, "presence-unknown");
  assert.equal(called, false);
});
test("unknown stop result is preserved and cannot redispatch a second command", async () => {
  const api = service();
  let calls = 0;
  api.grant = async (hostId) => ({
    ...grant(hostId),
    operations: ["project.list", "run.stop"],
  });
  api.stop = async () => {
    calls++;
    throw new Error("synthetic interrupted response");
  };
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  await model.stop();
  const commandId = model.state().commandId;
  assert.equal(model.state().result, "indeterminate");
  await assert.rejects(() => model.stop(), /result_unknown/);
  assert.equal(calls, 1);
  assert.equal(model.state().commandId, commandId);
});
test("a receipt from an old target cannot confirm a stop on the new selected computer", async () => {
  const api = service();
  let release;
  api.grant = async (hostId) => ({
    ...grant(hostId),
    operations: ["project.list", "run.stop"],
  });
  api.stop = ({ commandId }) =>
    new Promise((resolve) => {
      release = () => resolve({ commandId, status: "confirmed" });
    });
  const model = createRemoteCompanion({ api, identity: async () => identity });
  await model.open();
  await model.selectHost(a);
  await model.selectProject("one");
  const pending = model.stop();
  await model.selectHost(b);
  release();
  await pending;
  assert.equal(model.state().hostId, b);
  assert.equal(model.state().result, null);
});
