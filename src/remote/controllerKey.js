const databaseName = "codevalanche-remote-controller-v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("identities");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("controller_storage_unavailable"));
  });
}
async function metadata(keyPair) {
  if (
    keyPair.privateKey.extractable ||
    keyPair.privateKey.algorithm.name !== "ECDH"
  )
    throw new Error("controller_key_invalid");
  const publicBytes = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return {
    keyPair,
    publicKey: hex(publicBytes),
    fingerprint: hex(await crypto.subtle.digest("SHA-256", publicBytes)),
  };
}
export async function loadControllerIdentity(
  userId,
  { expectedFingerprint } = {},
) {
  if (!uuid.test(userId || "")) throw new Error("sign_in_required");
  const db = await openDatabase();
  try {
    const withBinding = async (result) => {
      const binding = await new Promise((resolve, reject) => {
        const request = db
          .transaction("identities", "readonly")
          .objectStore("identities")
          .get(`binding:${userId}:${result.fingerprint}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(Error("controller_storage_unavailable"));
      });
      return {
        ...result,
        controllerId: uuid.test(binding?.controllerId || "")
          ? binding.controllerId
          : null,
      };
    };
    const saved = await new Promise((resolve, reject) => {
      const transaction = db.transaction("identities", "readonly"),
        request = transaction.objectStore("identities").get(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("controller_storage_unavailable"));
    });
    if (saved) {
      const result = await metadata(saved);
      if (!expectedFingerprint || result.fingerprint === expectedFingerprint)
        return withBinding(result);
    }
    if (expectedFingerprint) {
      const pending = await new Promise((resolve, reject) => {
        const request = db
          .transaction("identities", "readonly")
          .objectStore("identities")
          .get("pending-login");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new Error("controller_storage_unavailable"));
      });
      if (
        !pending ||
        (await metadata(pending)).fingerprint !== expectedFingerprint
      )
        throw new Error("controller_key_changed");
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("identities", "readwrite"),
          store = transaction.objectStore("identities");
        store.put(pending, userId);
        store.put(userId, "last-account");
        store.delete("pending-login");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(new Error("controller_storage_unavailable"));
      });
      return withBinding(await metadata(pending));
    }
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    // Competing tabs serialize the final read+insert; only the persisted winner is used.
    const winner = await new Promise((resolve, reject) => {
      const transaction = db.transaction("identities", "readwrite"),
        store = transaction.objectStore("identities"),
        request = store.get(userId);
      let current;
      request.onsuccess = () => {
        current = request.result || keyPair;
        if (!request.result) store.put(keyPair, userId);
      };
      transaction.oncomplete = () => resolve(current);
      transaction.onerror = () =>
        reject(new Error("controller_storage_unavailable"));
    });
    return withBinding(await metadata(winner));
  } finally {
    db.close();
  }
}
export async function saveControllerBinding(
  userId,
  fingerprint,
  controllerId,
  current = () => {},
) {
  if (
    !uuid.test(userId) ||
    !uuid.test(controllerId) ||
    !/^[a-f0-9]{64}$/.test(fingerprint)
  )
    throw Error("controller_key_invalid");
  const db = await openDatabase();
  try {
    current();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("identities", "readwrite"),
        store = tx.objectStore("identities");
      try {
        current();
        store.put({ controllerId }, `binding:${userId}:${fingerprint}`);
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(Error("controller_storage_unavailable"));
    });
    current();
  } finally {
    db.close();
  }
}
export async function prepareControllerLogin({ fresh = false } = {}) {
  const db = await openDatabase();
  try {
    const read = (key) =>
      new Promise((resolve, reject) => {
        const request = db
          .transaction("identities", "readonly")
          .objectStore("identities")
          .get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new Error("controller_storage_unavailable"));
      });
    if (!fresh) {
      const account = await read("last-account");
      if (uuid.test(account || "")) {
        const saved = await read(account);
        if (saved) return metadata(saved);
      }
      const pending = await read("pending-login");
      if (pending) return metadata(pending);
    }
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("identities", "readwrite");
      transaction.objectStore("identities").put(keyPair, "pending-login");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("controller_storage_unavailable"));
    });
    return metadata(keyPair);
  } finally {
    db.close();
  }
}
