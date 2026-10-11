import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateContract } from "../src/remote/vendor/channelSdk.js";
test("vendored standard SDK provenance matches bytes and forbids runtime code generation", async () => {
  const bytes = await readFile(
      new URL("../src/remote/vendor/channelSdk.js", import.meta.url),
    ),
    provenance = JSON.parse(
      await readFile(
        new URL(
          "../src/remote/vendor/CHANNEL-SDK-PROVENANCE.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    provenance.sdkSha256,
  );
  assert.equal(/\bnew Function\s*\(|\beval\s*\(/.test(bytes.toString()), false);
  assert.equal(provenance.productionEnabled, false);
  assert.equal(provenance.runEnabled, false);
  assert.ok(
    provenance.sourceFiles.every((f) => /^[a-f0-9]{64}$/.test(f.sha256)),
  );
});
test("standalone contract validator rejects privilege/unknown fields and returns an isolated snapshot", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const envelope = {
    version: 1,
    commandId: id,
    grantId: id,
    grantVersion: 1,
    policyVersion: 1,
    hostId: id,
    controllerId: id,
    projectId: "a",
    operation: "conversation.read",
    deadline: new Date(Date.now() + 10000).toISOString(),
    payloadHash: "a".repeat(64),
  };
  const accepted = validateContract("CommandEnvelope", envelope);
  envelope.projectId = "other";
  assert.equal(accepted.projectId, "a");
  for (const patch of [
    { operation: "terminal.exec" },
    { grantVersion: 0 },
    { ownerUserId: id },
    { deadline: "invalid" },
    { payloadHash: "secret" },
  ])
    assert.throws(
      () => validateContract("CommandEnvelope", { ...accepted, ...patch }),
      /invalid_contract/,
    );
});
