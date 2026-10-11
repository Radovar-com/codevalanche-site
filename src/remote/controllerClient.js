import {
  loadControllerIdentity,
  saveControllerBinding,
} from "./controllerKey.js";
import { solvePossessionChallenge } from "./possessionProof.js";
import { possessionSuite } from "./hpkeSuite.js";
import { validateDiscovery } from "./discovery.js";
export function createBrowserController({
  bff,
  loadIdentity = loadControllerIdentity,
  solve = solvePossessionChallenge,
  saveBinding = saveControllerBinding,
}) {
  let generation = 0,
    session = null,
    identity = null,
    controllerId = null;
  const current = (turn) => {
    if (turn !== generation) throw new Error("account_request_superseded");
  };
  async function proof(purpose) {
    const turn = generation;
    if (!session || !identity) throw new Error("sign_in_required");
    const challenge = await bff.keyChallenge(purpose);
    current(turn);
    const result = await solve({
      challenge,
      identity,
      principal: session.principal,
      purpose,
      suite: possessionSuite,
    });
    current(turn);
    return result;
  }
  return {
    state: () => ({
      principal: session?.principal ? { ...session.principal } : null,
      fingerprint: identity?.fingerprint ?? null,
      controllerId,
    }),
    context: () => ({
      principal: session?.principal ? { ...session.principal } : null,
      fingerprint: identity?.fingerprint ?? null,
      controllerId,
      keyPair: identity?.keyPair ? { ...identity.keyPair } : null,
      csrfToken: session?.csrfToken ?? null,
    }),
    proof,
    clear() {
      generation++;
      session = null;
      identity = null;
      controllerId = null;
    },
    async open() {
      const turn = ++generation;
      session = null;
      identity = null;
      controllerId = null;
      const next = await bff.session();
      current(turn);
      const key = await loadIdentity(next.principal.userId, {
        expectedFingerprint: next.controllerKeyFingerprint,
      });
      current(turn);
      if (key.fingerprint !== next.controllerKeyFingerprint)
        throw new Error("controller_key_changed");
      session = structuredClone(next);
      identity = { ...key, keyPair: key.keyPair ? { ...key.keyPair } : null };
      controllerId = next.controllerId ?? null;
      if (!controllerId && key.controllerId) {
        const keyProof = await proof(`browser-bind:${key.controllerId}`);
        current(turn);
        let result;
        try {
          result = await bff.bindController(key.controllerId, keyProof);
        } catch (error) {
          current(turn);
          if (
            ["peer_identity_mismatch", "controller_required"].includes(
              error?.code || error?.message,
            )
          )
            throw Error("controller_key_changed");
          throw error;
        }
        current(turn);
        if (
          result.controllerId !== key.controllerId ||
          result.controllerKeyFingerprint !== key.fingerprint
        )
          throw Error("controller_key_changed");
        controllerId = result.controllerId;
      }
      return next;
    },
    async enroll(name = "This browser") {
      const turn = generation;
      const keyProof = await proof("enroll-controller");
      current(turn);
      const result = await bff.enrollController(
        String(name).slice(0, 80),
        keyProof,
      );
      current(turn);
      if (
        result.ownerUserId !== session.principal.userId ||
        result.fingerprint !== identity.fingerprint
      )
        throw new Error("controller_key_changed");
      controllerId = result.controllerId;
      await saveBinding(
        session.principal.userId,
        identity.fingerprint,
        controllerId,
        () => current(turn),
      );
      current(turn);
      return result;
    },
    async pairing(qr) {
      const turn = generation;
      if (!controllerId || qr.ownerUserId !== session?.principal.userId)
        throw new Error("controller_approval_required");
      const keyProof = await proof(
        `pairing-request:${qr.pairingRequestId}:${controllerId}`,
      );
      current(turn);
      const result = await bff.requestPairing(qr, keyProof);
      current(turn);
      return result;
    },
    async manualPairing(hostId) {
      const turn = generation;
      if (!controllerId) throw new Error("controller_approval_required");
      const keyProof = await proof(
        `pairing-manual-request:${hostId}:${controllerId}`,
      );
      current(turn);
      const result = await bff.requestManualPairing(hostId, keyProof);
      current(turn);
      return result;
    },
    async grant(hostId, grantId) {
      const turn = generation;
      if (!controllerId) throw new Error("controller_approval_required");
      const keyProof = await proof(
        `grant-detail:${grantId}:${hostId}:${controllerId}`,
      );
      current(turn);
      const result = await bff.grantDetail(hostId, grantId, keyProof);
      current(turn);
      return result;
    },
    async discovery() {
      const turn = generation;
      if (!controllerId) throw new Error("controller_approval_required");
      const context = {
        principal: { ...session.principal },
        controllerId,
        fingerprint: identity.fingerprint,
      };
      const keyProof = await proof(`account-discovery:${controllerId}`);
      current(turn);
      const result = await bff.discovery(keyProof);
      current(turn);
      return validateDiscovery(result, context);
    },
    async ticket() {
      const turn = generation;
      if (!controllerId) throw new Error("controller_approval_required");
      const keyProof = await proof(
        `ticket-issue:local-remote:browser:${bff.origin}`,
      );
      current(turn);
      const result = await bff.ticket(keyProof);
      current(turn);
      return result;
    },
  };
}
