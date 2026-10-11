import {
  createBoundQualificationChannel,
  ChannelDeliveryClient,
  validateSessionDescriptor,
  validateContract,
  grantBindingBytes,
} from "./vendor/channelSdk.js";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
// Explicit loopback qualification only. The production entry remains sealed.
export function createBrowserRelay({
  controller,
  origin,
  qualification = false,
  WebSocketImpl = WebSocket,
  timeoutMs = 8000,
  maxCommandHistory = 1024,
}) {
  if (
    !Number.isSafeInteger(maxCommandHistory) ||
    maxCommandHistory < 1 ||
    maxCommandHistory > 1024
  )
    throw Error("invalid_command_history_limit");
  // Lifetime metadata history: never evict spent IDs or retain result/plaintext.
  // Capacity exhaustion fails closed; no clear/retry operation releases a spent ID.
  const commandHistory = new Map();
  const binding = (c, grant) =>
    JSON.stringify([
      new URL(origin).origin,
      c.context.principal.userId,
      c.context.controllerId,
      c.context.fingerprint,
      new TextDecoder().decode(grantBindingBytes(grant)),
    ]);
  let active = null,
    epoch = 0;
  const snapshot = () => {
    const c = controller.context();
    return {
      ...c,
      principal: c.principal ? { ...c.principal } : null,
      keyPair: c.keyPair ? { ...c.keyPair } : null,
    };
  };
  const sameAccount = (c) => {
    const n = controller.context();
    return (
      n.principal?.userId === c.principal?.userId &&
      n.principal?.sessionId === c.principal?.sessionId &&
      n.controllerId === c.controllerId &&
      n.fingerprint === c.fingerprint &&
      n.csrfToken === c.csrfToken &&
      n.keyPair?.privateKey === c.keyPair?.privateKey
    );
  };
  const valid = (c) =>
    active === c && c.epoch === epoch && !c.closed && sameAccount(c.context);
  function dispose(c, reason = "connection_withdrawn") {
    if (!c || c.closed) return;
    c.closed = true;
    clearTimeout(c.connectTimer);
    c.rejectConnect?.(Error(reason));
    c.rejectConnect = null;
    c.channel?.close();
    c.delivery?.close();
    c.ready = null;
    c.grant = null;
    c.channel = null;
    c.listeners.clear();
    for (const p of [...c.pending.values(), ...c.responses.values()]) {
      if (p.record) p.record.status = "uncertain";
      clearTimeout(p.timer);
      p.reject(Error(reason));
    }
    c.pending.clear();
    c.responses.clear();
    if (active === c) active = null;
    c.socket?.close();
  }
  function close() {
    epoch++;
    dispose(active);
  }
  function current(c) {
    if (!valid(c)) {
      dispose(c);
      throw Error("connection_withdrawn");
    }
  }
  function scope(c) {
    current(c);
    if (
      !c.ready ||
      !c.channel ||
      !c.grant ||
      Date.parse(c.grant.expiresAt) <= Date.now()
    )
      throw Error("grant_revoked");
  }
  function request(c, type, fields) {
    current(c);
    if (!c.ready || c.socket.readyState !== 1)
      throw Error("connection_withdrawn");
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (c.pending.delete(requestId)) reject(Error("result_unknown"));
      }, timeoutMs);
      c.pending.set(requestId, { resolve, reject, timer });
      try {
        current(c);
        c.socket.send(JSON.stringify({ type, requestId, ...fields }));
      } catch (error) {
        clearTimeout(timer);
        c.pending.delete(requestId);
        reject(error);
      }
    });
  }
  return {
    close,
    async connect() {
      if (!qualification) throw Error("channel_unqualified");
      if (
        WebSocketImpl === globalThis.WebSocket &&
        !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)
      )
        throw Error("channel_unqualified");
      close();
      const turn = epoch,
        context = snapshot();
      if (!context.principal || !context.controllerId)
        throw Error("controller_approval_required");
      const check = () => {
        if (turn !== epoch || !sameAccount(context))
          throw Error("connection_withdrawn");
      };
      const ticket = await controller.ticket();
      check();
      const proof = await controller.proof(
        `ticket-consume:${ticket.ticket}:local-remote`,
      );
      check();
      const url = new URL("/v1/connect", origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const c = {
        epoch: turn,
        context,
        closed: false,
        ready: null,
        channel: null,
        grant: null,
        delivery: null,
        pending: new Map(),
        responses: new Map(),
        channelEpoch: 0,
        listeners: new Set(),
        socket: new WebSocketImpl(url.href),
      };
      active = c;
      await new Promise((resolve, reject) => {
        c.rejectConnect = reject;
        c.connectTimer = setTimeout(
          () => dispose(c, "connection_timeout"),
          timeoutMs,
        );
        c.socket.onopen = () => {
          try {
            current(c);
            c.socket.send(
              JSON.stringify({
                type: "authenticate",
                kind: "browser",
                ticket: ticket.ticket,
                fingerprint: context.fingerprint,
                proof,
                csrfToken: context.csrfToken,
              }),
            );
          } catch {
            dispose(c);
          }
        };
        c.socket.onerror = () => {
          if (active === c) dispose(c);
        };
        c.socket.onclose = () => {
          if (active === c && c.epoch === epoch) dispose(c);
        };
        c.socket.onmessage = async (event) => {
          if (!valid(c)) {
            dispose(c);
            return;
          }
          let message;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (message.type === "ready") {
            if (
              c.ready ||
              message.deviceId !== context.controllerId ||
              message.role !== "controller" ||
              !uuid.test(message.connectionId) ||
              !uuid.test(message.serverInstanceId) ||
              message.channelProtocolVersion !== 1
            ) {
              dispose(c, "invalid_channel_ready");
              return;
            }
            c.ready = structuredClone(message);
            clearTimeout(c.connectTimer);
            c.rejectConnect = null;
            resolve();
            return;
          }
          if (!c.ready) return;
          if (message.requestId && c.pending.has(message.requestId)) {
            const p = c.pending.get(message.requestId);
            c.pending.delete(message.requestId);
            clearTimeout(p.timer);
            message.type === "error"
              ? p.reject(Error(message.error?.code || "remote_refused"))
              : p.resolve(structuredClone(message));
            return;
          }
          for (const listener of c.listeners) {
            if (!valid(c)) return;
            listener(event.data);
          }
          if (
            message.type === "response" &&
            c.responses.has(message.packet?.envelope?.commandId)
          ) {
            const commandId = message.packet.envelope.commandId,
              p = c.responses.get(commandId),
              channel = c.channel,
              grant = c.grant,
              packet = structuredClone(message.packet);
            try {
              scope(c);
              const e = packet.envelope;
              if (
                e.projectId !== p.envelope.projectId ||
                e.operation !== p.envelope.operation ||
                e.commandId !== p.envelope.commandId ||
                e.deadline !== p.envelope.deadline ||
                Date.parse(e.deadline) <= Date.now()
              )
                throw Error("response_correlation_mismatch");
              const plaintext = await channel.open(packet);
              scope(c);
              if (
                channel !== c.channel ||
                grant !== c.grant ||
                c.responses.get(commandId) !== p
              )
                throw Error("connection_withdrawn");
              const result = JSON.parse(new TextDecoder().decode(plaintext));
              c.responses.delete(commandId);
              clearTimeout(p.timer);
              p.record.status = "result_received";
              p.resolve(result);
            } catch (error) {
              if (c.responses.get(commandId) === p) {
                c.responses.delete(commandId);
                clearTimeout(p.timer);
                p.record.status = "uncertain";
                p.reject(error);
              }
            }
          } else if (message.type === "error") {
            for (const p of c.responses.values()) {
              p.record.status = "uncertain";
              clearTimeout(p.timer);
              p.reject(Error(message.error?.code || "remote_refused"));
            }
            c.responses.clear();
          }
        };
      });
      current(c);
      return structuredClone(c.ready);
    },
    async openGrant(input, hostPublicKey) {
      const c = active;
      if (!qualification || !c) throw Error("channel_unqualified");
      current(c);
      const grant = validateContract("RemoteGrant", input),
        context = c.context,
        attempt = ++c.channelEpoch;
      const checkGrant = () => {
        current(c);
        if (attempt !== c.channelEpoch) throw Error("channel_grant_changed");
      };
      if (
        grant.ownerUserId !== context.principal.userId ||
        grant.controllerId !== context.controllerId ||
        grant.controllerKeyFingerprint !== context.fingerprint ||
        Date.parse(grant.expiresAt) <= Date.now()
      )
        throw Error("grant_revoked");
      c.channel?.close();
      c.delivery?.close();
      c.channel = null;
      c.grant = null;
      const message = await request(c, "channel.open", {
        grantId: grant.grantId,
        hostId: grant.hostId,
        grantVersion: grant.grantVersion,
        policyVersion: grant.policyVersion,
      });
      checkGrant();
      const descriptor = validateSessionDescriptor(message.session),
        digest = hex(
          await crypto.subtle.digest("SHA-256", grantBindingBytes(grant)),
        );
      checkGrant();
      if (
        descriptor.ownerUserId !== context.principal.userId ||
        descriptor.controllerId !== context.controllerId ||
        descriptor.controllerConnectionId !== c.ready.connectionId ||
        descriptor.serverInstanceId !== c.ready.serverInstanceId ||
        descriptor.hostId !== grant.hostId ||
        descriptor.grantId !== grant.grantId ||
        descriptor.grantVersion !== grant.grantVersion ||
        descriptor.policyVersion !== grant.policyVersion ||
        descriptor.grantDigest !== digest ||
        descriptor.controllerKeyFingerprint !==
          grant.controllerKeyFingerprint ||
        descriptor.hostKeyFingerprint !== grant.hostKeyFingerprint ||
        Date.parse(descriptor.expiresAt) <= Date.now()
      )
        throw Error("channel_grant_changed");
      if (
        typeof hostPublicKey !== "string" ||
        !/^04[a-f0-9]{128}$/.test(hostPublicKey)
      )
        throw Error("peer_identity_mismatch");
      const peer = await crypto.subtle.importKey(
        "raw",
        Uint8Array.from(hostPublicKey.match(/../g), (x) => parseInt(x, 16)),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        [],
      );
      checkGrant();
      const delivery = new ChannelDeliveryClient({
        connectionId: c.ready.connectionId,
        send: (data) => {
          current(c);
          c.socket.send(data);
        },
        subscribe: (listener) => {
          c.listeners.add(listener);
          return () => c.listeners.delete(listener);
        },
      });
      let channel;
      try {
        channel = await createBoundQualificationChannel({
          localIdentity: context.keyPair,
          pinnedPeer: {
            publicKey: peer,
            fingerprint: grant.hostKeyFingerprint,
          },
          session: descriptor,
          side: "controller",
          delivery,
        });
        checkGrant();
      } catch (error) {
        channel?.close();
        delivery.close();
        throw error;
      }
      c.delivery = delivery;
      c.channel = channel;
      c.grant = grant;
      return descriptor;
    },
    commandStatus(commandId) {
      const c = active;
      if (!c) throw Error("connection_withdrawn");
      scope(c);
      if (!uuid.test(commandId)) throw Error("invalid_contract");
      commandId = commandId.toLowerCase();
      const record = commandHistory.get(commandId);
      if (!record) return null;
      if (record.binding !== binding(c, c.grant))
        throw Error("command_identity_conflict");
      return Object.freeze({
        commandId,
        status: record.status,
        connectionEpoch: record.connectionEpoch,
        connectionId: record.connectionId,
        channelSessionId: record.channelSessionId,
      });
    },
    async command({
      projectId,
      operation,
      payload = {},
      commandId = crypto.randomUUID(),
    }) {
      const c = active;
      if (!qualification || !c) throw Error("channel_unqualified");
      scope(c);
      if (["run.start", "run.approve"].includes(operation))
        throw Error("remote_run_unqualified");
      const grant = c.grant,
        channel = c.channel;
      if (
        !grant.projectIds.includes(projectId) ||
        !grant.operations.includes(operation)
      )
        throw Error("grant_revoked");
      if (!uuid.test(commandId)) throw Error("invalid_contract");
      commandId = commandId.toLowerCase();
      const bytes = new TextEncoder().encode(
        JSON.stringify(structuredClone(payload)),
      );
      if (bytes.byteLength > 1048576) throw Error("payload_too_large");
      const scopeBinding = binding(c, grant),
        identity = JSON.stringify([scopeBinding, projectId, operation]),
        known = commandHistory.get(commandId);
      const check = () => {
        scope(c);
        if (grant !== c.grant || channel !== c.channel)
          throw Error("connection_withdrawn");
      };
      check();
      if (known) {
        if (known.identity !== identity)
          throw Error("command_identity_conflict");
        const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
        check();
        const expected = await known.hashPromise;
        check();
        if (digest !== expected) throw Error("command_identity_conflict");
        // Receipt recovery may inspect metadata; command packets are never re-emitted.
        throw Error("result_unknown");
      }
      if (commandHistory.size >= maxCommandHistory)
        throw Error("command_history_capacity");
      const record = {
        identity,
        binding: scopeBinding,
        status: "preparing",
        sent: false,
        connectionEpoch: c.epoch,
        connectionId: c.ready.connectionId,
        channelSessionId: channel.session.channelSessionId,
        accountSessionId: c.context.principal.sessionId,
        hashPromise: null,
      };
      // Reservation precedes every digest/seal await, preventing simultaneous double seals.
      commandHistory.set(commandId, record);
      try {
        record.hashPromise = crypto.subtle.digest("SHA-256", bytes).then(hex);
        const digest = await record.hashPromise;
        check();
        const envelope = {
          version: 1,
          commandId,
          grantId: grant.grantId,
          grantVersion: grant.grantVersion,
          policyVersion: grant.policyVersion,
          hostId: grant.hostId,
          controllerId: grant.controllerId,
          projectId,
          operation,
          deadline: new Date(Date.now() + 10000).toISOString(),
          payloadHash: digest,
        };
        const packet = await channel.seal(envelope, bytes);
        check();
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (c.responses.delete(commandId)) {
              record.status = "uncertain";
              reject(Error("result_unknown"));
            }
          }, timeoutMs);
          c.responses.set(commandId, {
            resolve,
            reject,
            timer,
            record,
            envelope: structuredClone(envelope),
          });
          try {
            check();
            record.sent = true;
            record.status = "sent";
            c.socket.send(JSON.stringify({ type: "command", packet }));
          } catch (error) {
            clearTimeout(timer);
            c.responses.delete(commandId);
            reject(error);
          }
        });
        check();
        return result;
      } catch (error) {
        record.status = record.sent ? "uncertain" : "not_sent";
        throw error;
      }
    },
  };
}
