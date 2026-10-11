import { createBrowserBffClient } from "./bffClient.js";
import { createRemoteCompanion } from "./model.js";
import {
  loadControllerIdentity,
  prepareControllerLogin,
} from "./controllerKey.js";
import { createBrowserController } from "./controllerClient.js";
import { createBrowserRelay } from "./browserRelay.js";
import { createWebRemoteApi } from "./webRemoteApi.js";
const $ = (id) => document.getElementById(id),
  config = window.CODEVALANCHE_REMOTE || {};
const bff = createBrowserBffClient({
  origin: config.origin || location.origin,
  pageOrigin: location.origin,
  configured: config.enabled === true,
  paths: config.paths,
});
const controller = createBrowserController({ bff });
const localQualification =
  config.localQualification === true &&
  ["127.0.0.1", "localhost"].includes(location.hostname);
const relay = createBrowserRelay({
  controller,
  origin: location.origin,
  qualification: localQualification,
});
const api =
  config.discoveryEnabled === true
    ? createWebRemoteApi({ bff, controller, relay })
    : { ...bff, session: () => controller.open() };
const messages = {
  approval_pending:
    "Browser approval requested. Confirm the key and allowed projects on your computer before continuing.",
  remote_not_configured:
    "Remote access is not enabled yet. Keep working on your computer.",
  remote_service_unavailable:
    "Remote service is unavailable. Try again; your computer enrollment is preserved.",
  sign_in_required: "Sign in on this remote page to view your computers.",
  host_forbidden: "This computer is not available to your account.",
  grant_revoked:
    "Browser approval was withdrawn. Approve this browser again on your computer.",
  result_unknown:
    "The result is unknown. Reconnect and check the existing command; it will not be resent automatically.",
  controller_storage_unavailable:
    "This browser cannot keep its device key. Enable browser storage or use a supported browser.",
  conversation_forbidden:
    "This conversation is not included in the current approval.",
  controller_key_changed:
    "This browser key changed. Sign in again and approve the new browser key on your computer.",
  source_binding_unavailable:
    "The computer list could not be verified for this session. Try again later.",
  mfa_required: "Verify your authenticator before using remote access.",
  reauthentication_required:
    "Sign in again and verify your authenticator to continue.",
};
let busy = false;
let actionError = null;
let trustHost = null;
function render(view) {
  if (trustHost !== view.hostId) {
    trustHost = view.hostId;
    $("manual-comparison").textContent = "";
    $("pairing-data").value = "";
    $("pairing-entry").hidden = true;
  }
  $("entry-description").textContent =
    view.status === "signed-out"
      ? "Sign in on this remote page, then approve this browser on your computer."
      : view.status === "ready" && !view.hosts.length
        ? "No remote computers are enrolled for this account. Enable remote on your computer, then approve this browser there."
        : view.error && view.error !== "remote_not_configured"
          ? "Remote access could not be verified. Your local projects and enrollment are preserved."
          : "Remote access is not enabled yet. Your local projects remain available on your computer.";
  $("remote-entry").hidden =
    ["ready", "loading", "reconnecting"].includes(view.status) &&
    view.hosts.length > 0;
  $("workspace").hidden =
    view.hosts.length === 0 || view.status === "signed-out";
  $("remote-logout").hidden = view.status === "signed-out" || !config.enabled;
  $("remote-status").textContent =
    view.error || actionError
      ? messages[view.error || actionError] ||
        "Remote access could not be verified. Try again."
      : view.status === "loading"
        ? "Checking the selected computer…"
        : view.status === "reconnecting"
          ? "Connection lost. Reconnect to check current access and command results."
          : "";
  $("remote-login").hidden = view.status !== "signed-out" || !config.enabled;
  $("hosts").replaceChildren(
    ...view.hosts.map((host) => {
      const li = document.createElement("li"),
        button = document.createElement("button"),
        name = document.createElement("span"),
        subtitle = document.createElement("small"),
        dot = document.createElement("span");
      button.className = "host-button";
      button.dataset.hostId = host.hostId;
      button.dataset.online = String(host.online);
      button.setAttribute("aria-pressed", String(view.hostId === host.hostId));
      dot.className = "presence";
      name.textContent = host.name;
      subtitle.textContent = `${host.online === true ? "Online" : host.online === false ? "Offline" : "Status unavailable"}${
        host.remoteEnabled ? "" : " · Remote off"
      }`;
      button.append(dot, name, subtitle);
      button.onclick = () =>
        void act(() => model.selectHost(host.hostId), true);
      li.append(button);
      return li;
    }),
  );
  $("hosts-empty").hidden = view.hosts.length !== 0;
  const host = view.hosts.find((h) => h.hostId === view.hostId);
  $("target-name").textContent = host?.name || "Choose a computer";
  $("target-state").textContent =
    view.authorization === "approved"
      ? "This browser has an approval for the listed projects."
      : view.authorization === "offline"
        ? "This computer is offline. Its enrollment is preserved."
        : view.authorization === "presence-unknown"
          ? "Availability has not been confirmed. Refresh to check this computer."
          : view.authorization === "remote-off"
            ? "Remote access is off on this computer."
            : host
              ? "Approve this browser on the selected computer before opening projects."
              : "A computer being online does not approve this browser.";
  $("request-approval").hidden =
    !host ||
    host.online !== true ||
    !host.remoteEnabled ||
    view.authorization !== "approval-required";
  $("projects").replaceChildren(
    new Option("Choose a project", ""),
    ...view.projects.map((p) => new Option(p.name, p.projectId)),
  );
  $("projects").value = view.projectId || "";
  $("projects").disabled = !view.projects.length;
  $("manual-approval").disabled =
    !host || host.online !== true || !host.remoteEnabled;
  $("conversations").replaceChildren(
    ...view.conversations.map((c) => {
      const li = document.createElement("li"),
        button = document.createElement("button");
      button.textContent = c.title;
      button.onclick = () =>
        void act(() => model.readConversation(c.conversationId));
      li.append(button);
      return li;
    }),
  );
  $("conversation-empty").hidden = view.conversations.length > 0;
  $("remote-stop").disabled =
    busy || !view.canStop || view.result === "indeterminate";
  $("messages").replaceChildren(
    ...(view.conversation?.messages || []).map((m) => {
      const article = document.createElement("article"),
        role = document.createElement("div"),
        text = document.createElement("div");
      article.className = "message";
      role.className = "role";
      role.textContent =
        m.role === "user" ? "You" : m.role === "assistant" ? "Agent" : "System";
      text.className = "text";
      text.textContent = m.text;
      article.append(role, text);
      return article;
    }),
  );
  if (!view.conversation) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent =
      "Conversations stay on the selected computer and appear through an approved secure connection.";
    $("messages").append(p);
  }
  $("command-result").textContent =
    view.result === "pending"
      ? "Stop requested. Waiting for confirmation."
      : view.result === "confirmed"
        ? "The host confirmed the stop request."
        : view.result === "indeterminate"
          ? messages.result_unknown
          : "";
}
const model = createRemoteCompanion({
  api,
  identity: loadControllerIdentity,
  changed: render,
});
let actionEpoch = 0;
async function act(work, interrupt = false) {
  if (busy && !interrupt) return;
  const turn = ++actionEpoch;
  busy = true;
  actionError = null;
  try {
    await work();
  } catch (error) {
    if (turn !== actionEpoch) return;
    actionError = error?.code || error?.message;
    $("remote-status").textContent =
      messages[error?.code || error?.message] ||
      "Remote access could not be verified. Try again.";
  } finally {
    if (turn !== actionEpoch) return;
    busy = false;
    render(model.state());
  }
}
$("projects").onchange = () =>
  void act(() => model.selectProject($("projects").value), true);
$("remote-stop").onclick = () => void act(() => model.stop());
$("refresh-hosts").onclick = $("remote-retry").onclick = () =>
  void act(() => model.open());
$("remote-logout").onclick = () =>
  void act(async () => {
    model.withdraw();
    controller.clear();
    await api.logout();
  });
$("remote-login").onclick = () =>
  void act(async () => {
    const identity = await prepareControllerLogin({
      fresh: model.state().error === "controller_key_changed",
    });
    const result = await api.beginLogin({
      controllerPublicKey: identity.publicKey,
      returnTo: "/remote/",
    });
    const url = new URL(result.authorizationUrl);
    const allowed = config.authorizationOrigins || [];
    if (
      !(
        url.protocol === "https:" ||
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ) ||
      !allowed.includes(url.origin)
    )
      throw new Error("origin_forbidden");
    location.assign(url.href);
  });
window.addEventListener("offline", () => model.disconnected());
window.addEventListener("pagehide", () => {
  model.withdraw();
  controller.clear();
});
$("request-approval").onclick = () =>
  void act(async () => {
    if (!controller.state().controllerId)
      await controller.enroll("Web browser");
    $("pairing-entry").hidden = false;
    $("remote-status").textContent =
      "Open remote approval on the selected computer and paste its one-time pairing information.";
  });
$("pairing-form").onsubmit = (event) => {
  event.preventDefault();
  void act(async () => {
    let qr;
    try {
      qr = JSON.parse($("pairing-data").value);
    } catch {
      throw new Error("invalid_fields");
    }
    if (qr.hostId !== model.state().hostId) throw new Error("host_forbidden");
    await controller.pairing(qr);
    $("pairing-data").value = "";
    $("pairing-entry").hidden = true;
    actionError = "approval_pending";
  });
};
$("manual-approval").onclick = () =>
  void act(async () => {
    const hostId = model.state().hostId;
    if (!hostId) throw Error("host_forbidden");
    const result = await controller.manualPairing(hostId);
    if (model.state().hostId !== hostId) return;
    $("manual-comparison").textContent =
      `Compare this code on ${$("target-name").textContent}: ${result.comparisonCode}. Browser key: ${controller.state().fingerprint}. Approve the exact projects on that computer, then refresh.`;
    actionError = "approval_pending";
  });
const requestedHost = new URL(location.href).searchParams.get("host");
if (
  location.hash ||
  new URL(location.href).searchParams.has("code") ||
  new URL(location.href).searchParams.has("token")
)
  history.replaceState(null, "", location.pathname);
render(model.state());
void act(async () => {
  await model.open();
  if (requestedHost && model.state().status === "ready")
    await model.selectHost(requestedHost);
});
