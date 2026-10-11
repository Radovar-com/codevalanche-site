import { remoteError } from "./model.js";
export function createBrowserBffClient({
  origin,
  pageOrigin = location.origin,
  configured = false,
  paths = {},
  fetch = globalThis.fetch,
}) {
  const root = new URL(origin || pageOrigin);
  if (
    root.origin !== pageOrigin ||
    root.pathname !== "/" ||
    !(
      root.protocol === "https:" ||
      ["127.0.0.1", "localhost"].includes(root.hostname)
    )
  )
    throw remoteError("origin_forbidden", 403);
  const routes = {
    session: "/bff/session",
    hosts: "/bff/hosts",
    discovery: "/bff/account/discovery",
    login: "/bff/login",
    logout: "/bff/logout",
    keyChallenge: "/bff/key-challenge",
    controller: "/bff/controller",
    controllerEnroll: "/bff/controller/enroll",
    ticket: "/bff/ticket",
    pairingRequest: "/bff/pairing/request",
    manualPairing: "/bff/pairing/manual",
    grantDetail: "/bff/grants/detail",
    receiptResume: "/bff/receipts/resume",
    ...paths,
  };
  let csrfToken = null,
    principal = null,
    generation = 0;
  async function request(name, method = "GET", body) {
    const turn = generation;
    if (!configured || !routes[name])
      throw remoteError("remote_not_configured");
    const url = new URL(routes[name], root);
    if (url.origin !== root.origin || !routes[name].startsWith("/")) {
      throw remoteError("origin_forbidden", 403);
    }
    if (method !== "GET" && !csrfToken) throw remoteError("csrf_required", 403);
    let response;
    try {
      response = await fetch(url.href, {
        method,
        credentials: "same-origin",
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...(method !== "GET"
            ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (turn !== generation) throw remoteError("account_request_superseded");
      if (!response.ok || result?.ok === false) {
        throw remoteError(
          result?.error?.code || "remote_service_unavailable",
          response.status,
        );
      }
      return result?.ok === true ? (result.data ?? result) : result;
    } catch (error) {
      if (error?.code) throw error;
      throw remoteError("remote_service_unavailable");
    }
  }
  return {
    origin: root.origin,
    async session() {
      const turn = ++generation;
      principal = null;
      const data = await request("session");
      if (turn !== generation) throw remoteError("account_request_superseded");
      if (typeof data?.csrfToken !== "string" || !data.csrfToken) {
        throw remoteError("sign_in_required", 401);
      }
      csrfToken = data.csrfToken;
      if (data.authenticated !== true) {
        principal = null;
        throw remoteError("sign_in_required", 401);
      }
      principal = data.principal;
      return { ...data, principal, csrfToken };
    },
    async hosts() {
      if (!principal) throw remoteError("sign_in_required", 401);
      const rows = await request("hosts");
      if (!Array.isArray(rows) || rows.some((row) => !row.ownerUserId))
        throw remoteError("source_binding_unavailable");
      return rows;
    },
    async logout() {
      generation++;
      principal = null;
      try {
        return await request("logout", "POST", {});
      } finally {
        generation++;
        csrfToken = null;
      }
    },
    beginLogin: ({ controllerPublicKey, returnTo = "/remote/" } = {}) => {
      if (
        typeof controllerPublicKey !== "string" ||
        !/^04[a-f0-9]{128}$/.test(controllerPublicKey) ||
        returnTo !== "/remote/"
      )
        throw remoteError("invalid_fields", 400);
      return request("login", "POST", { controllerPublicKey, returnTo });
    },
    keyChallenge: (purpose) => request("keyChallenge", "POST", { purpose }),
    enrollController: (name, keyProof) =>
      request("controllerEnroll", "POST", { name, keyProof }),
    bindController: (controllerId, keyProof) =>
      request("controller", "POST", { controllerId, keyProof }),
    ticket: (keyProof) => request("ticket", "POST", { keyProof }),
    requestPairing: (qr, keyProof) =>
      request("pairingRequest", "POST", { qr, keyProof }),
    requestManualPairing: (hostId, keyProof) =>
      request("manualPairing", "POST", { hostId, keyProof }),
    grantDetail: (hostId, grantId, keyProof) =>
      request("grantDetail", "POST", { hostId, grantId, keyProof }),
    discovery: (keyProof) => request("discovery", "POST", { keyProof }),
    resumeReceipts: (fields) => request("receiptResume", "POST", fields),
  };
}
