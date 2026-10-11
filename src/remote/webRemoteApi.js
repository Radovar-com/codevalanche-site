import { createRemoteOperations } from "./remoteOperations.js";
import { grantBindingBytes } from "./vendor/channelSdk.js";
export function createWebRemoteApi({ bff, controller, relay }) {
  let discovery = null,
    epoch = 0;
  const operations = createRemoteOperations({
    relay,
    resolveGrant: async (hostId, fingerprint) => {
      const turn = epoch;
      if (fingerprint !== controller.context().fingerprint)
        throw Error("controller_key_changed");
      const d = await controller.discovery();
      if (turn !== epoch) throw Error("account_request_superseded");
      const host = d.hosts.find((h) => h.hostId === hostId),
        grant = host?.approvedGrants.find(
          (g) => Date.parse(g.expiresAt) > Date.now(),
        );
      if (!host || !grant) throw Error("controller_approval_required");
      const details = await controller.grant(hostId, grant.grantId);
      if (turn !== epoch) throw Error("account_request_superseded");
      if (
        new TextDecoder().decode(grantBindingBytes(details.grant)) !==
        new TextDecoder().decode(grantBindingBytes(grant))
      )
        throw Error("channel_grant_changed");
      return details;
    },
  });
  return {
    ...bff,
    ...operations,
    clear() {
      epoch++;
      operations.clear();
    },
    async session() {
      const turn = ++epoch;
      operations.clear();
      discovery = null;
      const session = await controller.open();
      if (turn !== epoch) throw Error("account_request_superseded");
      if (!controller.state().controllerId)
        await controller.enroll("Web browser");
      if (turn !== epoch) throw Error("account_request_superseded");
      return session;
    },
    async hosts() {
      const turn = epoch;
      const d = await controller.discovery();
      if (turn !== epoch) throw Error("account_request_superseded");
      discovery = d;
      return d.hosts.map((h) => ({
        hostId: h.hostId,
        ownerUserId: d.ownerUserId,
        name: h.name,
        platform: h.platform,
        online:
          h.presence?.state === "online"
            ? true
            : h.presence?.state === "offline"
              ? false
              : null,
        remoteEnabled: h.remoteEnabled,
        fingerprint: h.hostKeyFingerprint,
      }));
    },
    async grant(hostId, fingerprint) {
      const host = discovery?.hosts.find((h) => h.hostId === hostId);
      if (!host?.approvedGrants.length) return null;
      return await operations.grant(hostId, fingerprint);
    },
  };
}
