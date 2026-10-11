import {
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
  Aes256Gcm,
} from "@hpke/core";
// Same pinned RFC9180 suite as the Sol4 possession verifier. Production channel stays sealed.
export const possessionSuite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});
