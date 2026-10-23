import { createHash, webcrypto } from "node:crypto";
import { redis, isRedisConfigured } from "@/lib/redisClient";

export interface DeviceProof {
  publicKey: JsonWebKey;
  signature: string;
  nonce: string;
  issuedAt: number;
}

type DeviceResult =
  | { status: "ok"; fingerprint: string }
  | { status: "invalid" | "locked" | "unavailable" };

const bindingKey = (recordId: string) => `ultra-gym:member-device:v1:${recordId}`;

function keyCoordinates(value: unknown): { x: string; y: string } | null {
  if (!value || typeof value !== "object") return null;
  const key = value as JsonWebKey;
  if (key.kty !== "EC" || key.crv !== "P-256" ||
      typeof key.x !== "string" || typeof key.y !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(key.x) || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) return null;
  return { x: key.x, y: key.y };
}

function fingerprint(key: { x: string; y: string }): string {
  return createHash("sha256").update(`${key.x}.${key.y}`).digest("base64url");
}

async function storedKey(recordId: string): Promise<{ x: string; y: string } | null> {
  const value = await redis.get<JsonWebKey | string>(bindingKey(recordId));
  return keyCoordinates(typeof value === "string" ? JSON.parse(value) : value);
}

/** Only a password-verified member may claim the first device. The Redis NX write is atomic. */
export async function claimMemberDevice(recordId: string, input: unknown): Promise<DeviceResult> {
  if (!isRedisConfigured) return { status: "unavailable" };
  if (!input || typeof input !== "object") return { status: "invalid" };
  const proof = input as DeviceProof;
  const key = keyCoordinates(proof.publicKey);
  const now = Math.floor(Date.now() / 1000);
  if (!key || typeof proof.signature !== "string" ||
      !/^[A-Za-z0-9_-]{80,120}$/.test(proof.signature) ||
      typeof proof.nonce !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(proof.nonce) ||
      !Number.isInteger(proof.issuedAt) || Math.abs(now - proof.issuedAt) > 90) {
    return { status: "invalid" };
  }

  try {
    const bound = await storedKey(recordId);
    if (bound && (bound.x !== key.x || bound.y !== key.y)) return { status: "locked" };
    const publicKey = await webcrypto.subtle.importKey(
      "jwk", { kty: "EC", crv: "P-256", x: key.x, y: key.y },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const message = new TextEncoder().encode(`ug-member-login-v1:${proof.nonce}:${proof.issuedAt}`);
    const valid = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, publicKey,
      Buffer.from(proof.signature, "base64url"), message
    );
    if (!valid) return { status: "invalid" };

    const nonceResult = await redis.set(
      `ultra-gym:member-device-nonce:v1:${recordId}:${proof.nonce}`, "1", { nx: true, ex: 180 }
    );
    if (nonceResult !== "OK") return { status: "invalid" };
    if (!bound) {
      const claimed = await redis.set(bindingKey(recordId),
        { kty: "EC", crv: "P-256", x: key.x, y: key.y }, { nx: true });
      if (claimed !== "OK") {
        const winner = await storedKey(recordId);
        if (!winner || winner.x !== key.x || winner.y !== key.y) return { status: "locked" };
      }
    }
    return { status: "ok", fingerprint: fingerprint(key) };
  } catch {
    return { status: "unavailable" };
  }
}

/** Used by authenticated APIs so reset or Redis loss invalidates old member sessions. */
export async function isCurrentMemberDevice(recordId: string, expected: unknown): Promise<boolean> {
  if (!isRedisConfigured || typeof expected !== "string" || !recordId) return false;
  try {
    const key = await storedKey(recordId);
    return Boolean(key && fingerprint(key) === expected);
  } catch {
    return false;
  }
}

export async function resetMemberDevice(recordId: string): Promise<boolean> {
  if (!isRedisConfigured) return false;
  await redis.del(bindingKey(recordId));
  return true;
}
