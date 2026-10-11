// The selected host and immutable server grant own every operation.
export function createRemoteOperations({ relay, resolveGrant }) {
  let selected = null,
    grant = null,
    epoch = 0,
    connected = false,
    opening = null;
  const check = (turn) => {
    if (turn !== epoch) throw Error("account_request_superseded");
  };
  const ensure = (context) => {
    if (
      !selected ||
      context.hostId !== selected.hostId ||
      context.grant?.grantId !== grant?.grantId ||
      context.grant?.grantVersion !== grant?.grantVersion ||
      context.grant?.policyVersion !== grant?.policyVersion ||
      !grant.projectIds.includes(context.projectId)
    )
      throw Error("grant_revoked");
  };
  function cancelPending() {
    epoch++;
    connected = false;
    opening = null;
    relay.close();
  }
  async function connect(turn) {
    check(turn);
    if (connected) return;
    if (opening) return opening;
    const target = { ...selected },
      currentGrant = structuredClone(grant);
    const work = (async () => {
      await relay.connect();
      check(turn);
      await relay.openGrant(currentGrant, target.hostPublicKey);
      check(turn);
      connected = true;
    })();
    opening = work;
    try {
      await work;
    } finally {
      if (opening === work) opening = null;
    }
  }
  async function command(context, operation, payload, commandId) {
    ensure(context);
    const turn = epoch;
    await connect(turn);
    check(turn);
    ensure(context);
    const result = await relay.command({
      projectId: context.projectId,
      operation,
      payload: structuredClone(payload),
      ...(commandId ? { commandId } : {}),
    });
    check(turn);
    ensure(context);
    return result;
  }
  return {
    cancelPending,
    clear() {
      cancelPending();
      selected = null;
      grant = null;
    },
    async grant(hostId, fingerprint) {
      cancelPending();
      const turn = epoch;
      selected = null;
      grant = null;
      const input = await resolveGrant(hostId, fingerprint);
      check(turn);
      const result = structuredClone(input);
      grant = result.grant;
      selected = { hostId, hostPublicKey: result.hostPublicKey };
      await connect(turn);
      check(turn);
      return structuredClone(grant);
    },
    async projects(hostId, currentGrant) {
      if (
        hostId !== selected?.hostId ||
        currentGrant.grantId !== grant?.grantId
      )
        throw Error("grant_revoked");
      const turn = epoch,
        snapshot = structuredClone(grant),
        result = [];
      for (const projectId of snapshot.projectIds) {
        const reply = await command(
          { hostId, projectId, grant: snapshot },
          "project.list",
          {},
        );
        check(turn);
        for (const project of reply.projects || []) {
          if (
            snapshot.projectIds.includes(project.projectId) &&
            !result.some((p) => p.projectId === project.projectId)
          )
            result.push(structuredClone(project));
        }
      }
      return result;
    },
    async conversations(input) {
      const context = structuredClone(input);
      const reply = await command(context, "conversation.read", {});
      return reply.conversations || [];
    },
    async readConversation(input) {
      const context = structuredClone(input);
      return await command(context, "conversation.read", {
        conversationId: context.conversationId,
      });
    },
    async stop(input) {
      const context = structuredClone(input);
      const reply = await command(context, "run.stop", {}, context.commandId);
      return {
        commandId: context.commandId,
        status: reply.status === "confirmed" ? "confirmed" : "indeterminate",
      };
    },
  };
}
