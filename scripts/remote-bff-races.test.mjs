import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserBffClient } from "../src/remote/bffClient.js";
test("logout fences a held session response from restoring BFF identity or CSRF", async () => {
  let release, started;
  const ready = new Promise((r) => (started = r));
  const data = {
    authenticated: true,
    csrfToken: "csrf",
    principal: {
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
  };
  let sessions = 0;
  const bff = createBrowserBffClient({
    origin: "https://remote.example.test",
    pageOrigin: "https://remote.example.test",
    configured: true,
    fetch: async (url) => {
      if (url.endsWith("/bff/session") && ++sessions === 2) {
        started();
        await new Promise((r) => (release = r));
      }
      return new Response(
        JSON.stringify(url.endsWith("/bff/logout") ? { ok: true } : data),
        { status: 200 },
      );
    },
  });
  await bff.session();
  const pending = bff.session();
  await ready;
  await bff.logout();
  release();
  await assert.rejects(pending, /account_request_superseded/);
  await assert.rejects(bff.hosts(), /sign_in_required/);
});
