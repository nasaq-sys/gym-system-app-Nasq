"use client";

const DATABASE = "nasaq-member-device";
const STORE = "keys";
const KEY = "first-device";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKeyPair> {
  const database = await openDatabase();
  try {
    const existing = await new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as CryptoKeyPair | undefined);
      request.onerror = () => reject(request.error);
    });
    if (existing?.privateKey && existing.publicKey) return existing;
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
    );
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(pair, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return pair;
  } finally {
    database.close();
  }
}

export async function createDeviceProof() {
  const pair = await getOrCreateKey();
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = new TextEncoder().encode(`ug-member-login-v1:${nonce}:${issuedAt}`);
  const signed = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, message);
  const signature = btoa(String.fromCharCode(...new Uint8Array(signed)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { publicKey, nonce, issuedAt, signature };
}
