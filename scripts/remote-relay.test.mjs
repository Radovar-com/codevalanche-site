import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserRelay } from "../src/remote/browserRelay.js";
test("production browser relay remains sealed before opening a socket or issuing a ticket", async () => {
  let calls = 0;
  const relay = createBrowserRelay({
    origin: "https://remote.example.test",
    controller: {
      ticket: async () => {
        calls++;
      },
    },
    WebSocketImpl: class {
      constructor() {
        calls++;
      }
    },
    qualification: false,
  });
  await assert.rejects(() => relay.connect(), /channel_unqualified/);
  assert.equal(calls, 0);
});
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const controller = () => ({
  context: () => ({
    principal: { userId: id(1), sessionId: id(2) },
    controllerId: id(3),
    fingerprint: "a".repeat(64),
    csrfToken: "csrf",
  }),
  ticket: async () => ({ ticket: "b".repeat(64) }),
  proof: async () => ({ challengeId: id(4), response: "c".repeat(64) }),
});
test("connect timeout closes its socket and late open cannot authenticate", async () => {
  let socket;
  class Socket {
    readyState = 1;
    sent = [];
    closes = 0;
    constructor() {
      socket = this;
    }
    send(raw) {
      this.sent.push(raw);
    }
    close() {
      this.closes++;
      this.readyState = 3;
    }
  }
  const relay = createBrowserRelay({
    controller: controller(),
    origin: "https://remote.example.test",
    qualification: true,
    WebSocketImpl: Socket,
    timeoutMs: 10,
  });
  await assert.rejects(relay.connect(), /connection_timeout/);
  assert.equal(socket.closes, 1);
  socket.onopen();
  assert.deepEqual(socket.sent, []);
  relay.close();
});
test("account changed while waiting for open cannot authenticate old identity", async () => {
  let socket,
    context = controller().context();
  class Socket {
    readyState = 1;
    sent = [];
    constructor() {
      socket = this;
    }
    send(raw) {
      this.sent.push(raw);
    }
    close() {
      this.readyState = 3;
    }
  }
  const source = { ...controller(), context: () => context };
  const relay = createBrowserRelay({
    controller: source,
    origin: "https://remote.example.test",
    qualification: true,
    WebSocketImpl: Socket,
    timeoutMs: 20,
  });
  const connecting = relay.connect();
  await new Promise((r) => setTimeout(r, 0));
  context = { ...context, principal: { userId: id(8), sessionId: id(9) } };
  socket.onopen();
  await assert.rejects(connecting, /connection_withdrawn/);
  assert.deepEqual(socket.sent, []);
  relay.close();
});
