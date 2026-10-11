import test from "node:test";
import assert from "node:assert/strict";
import { possessionSuite as suite } from "../src/remote/hpkeSuite.js";
import { solvePossessionChallenge } from "../src/remote/possessionProof.js";
test("standard RFC9180 possession response binds actual non-exportable browser key to exact purpose/actor/session", async () => {
  const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ),
    publicBytes = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const hex = (value) => Buffer.from(value).toString("hex"),
    identity = {
      keyPair,
      fingerprint: hex(await crypto.subtle.digest("SHA-256", publicBytes)),
    },
    principal = {
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
    purpose = "enroll-controller",
    challengeId = crypto.randomUUID(),
    info = JSON.stringify([
      "Codevalanche key possession RFC9180 v1",
      challengeId,
      principal.userId,
      principal.sessionId,
      identity.fingerprint,
      purpose,
    ]);
  const context = await suite.createSenderContext({
      recipientPublicKey: keyPair.publicKey,
      info: new TextEncoder().encode(info),
    }),
    nonce = crypto.getRandomValues(new Uint8Array(32)),
    challenge = {
      challengeId,
      info,
      enc: hex(context.enc),
      ciphertext: hex(await context.seal(nonce)),
      ttlMs: 60000,
    };
  const response = await solvePossessionChallenge({
    challenge,
    identity,
    principal,
    purpose,
    suite,
  });
  assert.equal(response.response, hex(nonce));
  await assert.rejects(
    () =>
      solvePossessionChallenge({
        challenge,
        identity,
        principal: { ...principal, userId: "foreign" },
        purpose,
        suite,
      }),
    /key_proof_invalid/,
  );
  await assert.rejects(() =>
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  );
});
