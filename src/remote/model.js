import { REMOTE_OPERATIONS } from "./contracts.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fingerprint = /^[0-9a-f]{64}$/;
const opaque = /^[a-zA-Z0-9_-]{1,128}$/;
export function remoteError(code, status = 503) {
  return Object.assign(new Error(code), { code, status });
}
function boundGrant(grant, principal, host, identity, now) {
  if (
    !grant ||
    !uuid.test(grant.grantId || "") ||
    grant.ownerUserId !== principal.userId ||
    grant.hostId !== host.hostId ||
    !uuid.test(grant.controllerId || "") ||
    grant.controllerKeyFingerprint !== identity.fingerprint ||
    !fingerprint.test(grant.controllerKeyFingerprint) ||
    grant.hostKeyFingerprint !== host.fingerprint ||
    !fingerprint.test(grant.hostKeyFingerprint || "") ||
    !Number.isSafeInteger(grant.policyVersion) ||
    grant.policyVersion < 1 ||
    !Number.isSafeInteger(grant.grantVersion) ||
    grant.grantVersion < 1 ||
    !Array.isArray(grant.projectIds) ||
    !grant.projectIds.length ||
    grant.projectIds.some(
      (p) =>
        !opaque.test(p) ||
        !Number.isSafeInteger(grant.projectBindingVersions?.[p]) ||
        grant.projectBindingVersions[p] < 1,
    ) ||
    !Array.isArray(grant.operations) ||
    grant.operations.some((o) => !REMOTE_OPERATIONS.includes(o)) ||
    !Number.isFinite(Date.parse(grant.expiresAt)) ||
    Date.parse(grant.expiresAt) <= now
  )
    throw remoteError("grant_revoked", 403);
  return structuredClone(grant);
}
export function createRemoteCompanion({
  api,
  identity,
  changed = () => {},
  now = Date.now,
}) {
  let generation = 0,
    principal = null,
    device = null,
    grant = null;
  let view = {
    status: "idle",
    hosts: [],
    hostId: null,
    projects: [],
    projectId: null,
    conversations: [],
    conversation: null,
    authorization: "approval-required",
    canRead: false,
    canStop: false,
    canRun: false,
    commandId: null,
    result: null,
    error: null,
  };
  const publish = () => changed(structuredClone(view));
  const resetTarget = () => {
    api.clear?.();
    grant = null;
    view.hostId = null;
    view.projectId = null;
    view.projects = [];
    view.conversations = [];
    view.conversation = null;
    view.canRead = false;
    view.canStop = false;
    view.authorization = "approval-required";
    view.commandId = null;
    view.result = null;
  };
  const capabilities = () => {
    const host = view.hosts.find((h) => h.hostId === view.hostId);
    const current =
      view.status === "ready" &&
      grant &&
      Date.parse(grant.expiresAt) > now() &&
      host?.online === true &&
      host.remoteEnabled === true &&
      view.projectId &&
      grant.projectIds.includes(view.projectId);
    view.canRead = Boolean(
      current && grant.operations.includes("conversation.read"),
    );
    view.canStop = Boolean(
      current &&
      grant.operations.includes("run.stop") &&
      typeof api.stop === "function",
    );
    view.canRun = false;
  };
  const refuse = (error) => {
    const code = error?.code || error?.message || "remote_service_unavailable";
    if (
      [
        "sign_in_required",
        "session_revoked",
        "account_suspended",
        "grant_revoked",
        "controller_key_changed",
      ].includes(code)
    ) {
      generation++;
      resetTarget();
      view.hosts = [];
      principal = null;
      device = null;
      view.status = "signed-out";
    } else {
      view.status = "unavailable";
      view.canRead = false;
      view.canStop = false;
      view.conversation = null;
      api.clear?.();
    }
    view.error = code;
    publish();
  };
  return {
    state: () => structuredClone(view),
    withdraw() {
      generation++;
      principal = null;
      device = null;
      resetTarget();
      view.hosts = [];
      view.status = "signed-out";
      view.error = null;
      publish();
    },
    async open() {
      const turn = ++generation;
      resetTarget();
      principal = null;
      device = null;
      view.hosts = [];
      view.status = "loading";
      view.error = null;
      publish();
      try {
        const session = await api.session();
        if (turn !== generation) return;
        if (
          !uuid.test(session?.principal?.userId || "") ||
          !uuid.test(session?.principal?.sessionId || "")
        )
          throw remoteError("sign_in_required", 401);
        principal = {
          userId: session.principal.userId,
          sessionId: session.principal.sessionId,
        };
        const nextDevice = await identity(principal.userId, {
          expectedFingerprint: session.controllerKeyFingerprint,
        });
        if (turn !== generation) return;
        if (
          session.controllerKeyFingerprint &&
          nextDevice.fingerprint !== session.controllerKeyFingerprint
        )
          throw remoteError("controller_key_changed", 403);
        device = nextDevice;
        const hosts = await api.hosts();
        if (turn !== generation) return;
        if (!Array.isArray(hosts)) {
          throw remoteError("remote_service_unavailable");
        }
        view.hosts = hosts
          .filter(
            (h) =>
              h.ownerUserId === principal.userId && uuid.test(h.hostId || ""),
          )
          .map((h) => ({
            hostId: h.hostId,
            ownerUserId: h.ownerUserId,
            name: String(h.name || "Computer").slice(0, 80),
            platform: h.platform,
            online: typeof h.online === "boolean" ? h.online : null,
            remoteEnabled: h.remoteEnabled === true,
            fingerprint: h.fingerprint,
          }));
        view.status = "ready";
        publish();
      } catch (error) {
        if (turn === generation) refuse(error);
      }
    },
    async selectHost(hostId) {
      const host = view.hosts.find(
        (h) => h.hostId === hostId && h.ownerUserId === principal?.userId,
      );
      if (!host) throw remoteError("host_forbidden", 403);
      const turn = ++generation;
      resetTarget();
      view.hostId = hostId;
      view.status = "loading";
      view.error = null;
      publish();
      if (!host.online || !host.remoteEnabled) {
        view.status = "ready";
        view.authorization = !host.remoteEnabled
          ? "remote-off"
          : host.online === false
            ? "offline"
            : "presence-unknown";
        publish();
        return;
      }
      try {
        if (!api.grant) {
          view.status = "ready";
          view.authorization = "approval-required";
          publish();
          return;
        }
        const result = await api.grant(hostId, device.fingerprint);
        if (turn !== generation) return;
        if (!result) {
          view.status = "ready";
          view.authorization = "approval-required";
          publish();
          return;
        }
        grant = boundGrant(result, principal, host, device, now());
        view.authorization = "approved";
        if (!grant.operations.includes("project.list")) {
          view.status = "ready";
          publish();
          return;
        }
        const projects = await api.projects(hostId, grant);
        if (turn !== generation) return;
        if (!grant || Date.parse(grant.expiresAt) <= now())
          throw remoteError("grant_revoked", 403);
        if (!Array.isArray(projects)) {
          throw remoteError("remote_service_unavailable");
        }
        view.projects = projects
          .filter((p) => grant.projectIds.includes(p.projectId))
          .map((p) => ({
            projectId: p.projectId,
            name: String(p.name || "Project").slice(0, 160),
          }));
        view.status = "ready";
        publish();
      } catch (error) {
        if (turn === generation) refuse(error);
      }
    },
    async selectProject(projectId) {
      if (
        !view.projects.some((p) => p.projectId === projectId) ||
        !grant?.projectIds.includes(projectId)
      )
        throw remoteError("project_forbidden", 403);
      const turn = ++generation;
      view.projectId = projectId;
      api.cancelPending?.();
      view.conversations = [];
      view.conversation = null;
      view.result = null;
      view.commandId = null;
      capabilities();
      publish();
      if (!view.canRead || !api.conversations) return;
      try {
        const items = await api.conversations({
          hostId: view.hostId,
          projectId,
          grant,
        });
        if (turn !== generation) return;
        if (!grant || Date.parse(grant.expiresAt) <= now())
          throw remoteError("grant_revoked", 403);
        view.conversations = Array.isArray(items)
          ? items.map((c) => ({
              conversationId: c.conversationId,
              title: String(c.title || "Conversation").slice(0, 160),
            }))
          : [];
        publish();
      } catch (error) {
        if (turn === generation) refuse(error);
      }
    },
    async readConversation(conversationId) {
      capabilities();
      if (
        !view.canRead ||
        !view.conversations.some((c) => c.conversationId === conversationId)
      )
        throw remoteError("conversation_forbidden", 403);
      const turn = ++generation;
      const target = {
        hostId: view.hostId,
        projectId: view.projectId,
        conversationId,
        grant,
      };
      view.status = "loading";
      publish();
      try {
        const conversation = await api.readConversation(target);
        if (turn !== generation) return;
        if (!grant || Date.parse(grant.expiresAt) <= now())
          throw remoteError("grant_revoked", 403);
        view.conversation = {
          conversationId,
          messages: (conversation?.messages || []).map((m) => ({
            role: ["user", "assistant", "system"].includes(m.role)
              ? m.role
              : "assistant",
            text: String(m.text || ""),
          })),
        };
        view.status = "ready";
        publish();
      } catch (error) {
        if (turn === generation) refuse(error);
      }
    },
    async stop() {
      capabilities();
      if (!view.canStop) throw remoteError("stop_forbidden", 403);
      if (["pending", "indeterminate"].includes(view.result)) {
        throw remoteError("result_unknown", 409);
      }
      const turn = generation;
      const commandId = crypto.randomUUID();
      view.commandId = commandId;
      view.result = "pending";
      publish();
      try {
        const receipt = await api.stop({
          hostId: view.hostId,
          projectId: view.projectId,
          grant,
          commandId,
        });
        if (turn !== generation) return;
        view.result =
          receipt?.commandId === commandId && receipt?.status === "confirmed"
            ? "confirmed"
            : "indeterminate";
        publish();
      } catch (error) {
        if (turn !== generation) return;
        if (
          ["grant_revoked", "session_revoked", "account_suspended"].includes(
            error?.code || error?.message,
          )
        )
          refuse(error);
        else {
          view.result = "indeterminate";
          view.error = "result_unknown";
          publish();
        }
      }
    },
    disconnected() {
      generation++;
      api.clear?.();
      grant = null;
      view.status = "reconnecting";
      view.conversation = null;
      view.canStop = false;
      view.canRead = false;
      if (view.result === "pending") view.result = "indeterminate";
      publish();
    },
  };
}
