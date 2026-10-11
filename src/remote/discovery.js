import { validateContract } from "./vendor/channelSdk.js";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Bind only the producer's account-scoped discovery DTO. No ownership enrichment.
export function validateDiscovery(input, context) {
  const d = structuredClone(input);
  if (
    !context.principal ||
    !context.controllerId ||
    d?.ownerUserId !== context.principal.userId ||
    d.controllerId !== context.controllerId ||
    d.controllerKeyFingerprint !== context.fingerprint ||
    !Number.isSafeInteger(d.policyVersion) ||
    d.policyVersion < 1 ||
    !Array.isArray(d.hosts) ||
    d.hosts.length > 100 ||
    !["complete", "partial"].includes(d.coverage?.status)
  )
    throw Error("source_binding_unavailable");
  const seen = new Set();
  for (const h of d.hosts) {
    if (
      !uuid.test(h.hostId) ||
      seen.has(h.hostId) ||
      !/^([a-f0-9]{64})$/.test(h.hostKeyFingerprint) ||
      typeof h.remoteEnabled !== "boolean" ||
      !Array.isArray(h.approvedGrants)
    )
      throw Error("source_binding_unavailable");
    seen.add(h.hostId);
    for (const candidate of h.approvedGrants) {
      const g = validateContract("RemoteGrant", candidate);
      if (
        g.ownerUserId !== d.ownerUserId ||
        g.hostId !== h.hostId ||
        g.controllerId !== d.controllerId ||
        g.controllerKeyFingerprint !== d.controllerKeyFingerprint ||
        g.hostKeyFingerprint !== h.hostKeyFingerprint ||
        g.policyVersion !== d.policyVersion ||
        Date.parse(g.expiresAt) <= Date.now()
      )
        throw Error("grant_revoked");
    }
  }
  return d;
}
