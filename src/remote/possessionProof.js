// RFC9180 possession challenge only; this is not a channel handshake or Run authorization.
// The caller supplies the reviewed @hpke/core P256/HKDF-SHA256/AES256GCM suite.
const unhex = (value) => {
  if (
    typeof value !== "string" ||
    value.length % 2 ||
    !/^[a-f0-9]+$/.test(value)
  )
    throw new Error("key_proof_invalid");
  return Uint8Array.from(value.match(/../g), (x) => parseInt(x, 16));
};
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export async function solvePossessionChallenge({
  challenge,
  identity,
  principal,
  purpose,
  suite,
}) {
  if (!suite) throw new Error("channel_unqualified");
  if (
    identity.keyPair.privateKey.extractable ||
    typeof challenge?.info !== "string" ||
    challenge.info.length > 4096 ||
    challenge.ttlMs !== 60000
  )
    throw new Error("key_proof_invalid");
  let info;
  try {
    info = JSON.parse(challenge.info);
  } catch {
    throw new Error("key_proof_invalid");
  }
  const expected = [
    "Codevalanche key possession RFC9180 v1",
    challenge.challengeId,
    principal.userId,
    principal.sessionId,
    identity.fingerprint,
    purpose,
  ];
  if (JSON.stringify(info) !== JSON.stringify(expected))
    throw new Error("key_proof_invalid");
  const context = await suite.createRecipientContext({
    recipientKey: identity.keyPair,
    enc: unhex(challenge.enc),
    info: new TextEncoder().encode(challenge.info),
  });
  const secret = await context.open(unhex(challenge.ciphertext));
  if (secret.byteLength !== 32) throw new Error("key_proof_invalid");
  return { challengeId: challenge.challengeId, response: hex(secret) };
}
