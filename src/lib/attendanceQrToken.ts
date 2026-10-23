import { createHmac, timingSafeEqual } from "node:crypto";

export interface AttendanceQrPayload {
  v: number;
  id: string;
  iat: number;
  exp: number;
}

/** One signed token for each member and exact 25-second window. */
export function issueAttendanceQr(recordId: string, secret: string, nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 25_000) * 25;
  const expiresAt = issuedAt + 25;
  const payload = Buffer.from(JSON.stringify({ v: 1, id: recordId, iat: issuedAt, exp: expiresAt }))
    .toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `UG1.${payload}.${signature}`, expiresAt };
}

/** Returns null for forged, malformed, early, expired or legacy 30-second passes. */
export function verifyAttendanceQr(token: string, secret: string, nowMs = Date.now()): AttendanceQrPayload | null {
  const match = /^UG1\.([A-Za-z0-9_-]{20,300})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const expected = createHmac("sha256", secret).update(match[1]).digest();
  const provided = Buffer.from(match[2], "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  let pass: AttendanceQrPayload;
  try { pass = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")); }
  catch { return null; }
  const now = Math.floor(nowMs / 1000);
  if (!pass || pass.v !== 1 || !/^rec[A-Za-z0-9]+$/.test(pass.id) ||
      !Number.isInteger(pass.iat) || !Number.isInteger(pass.exp) ||
      pass.iat % 25 !== 0 || pass.exp !== pass.iat + 25 ||
      now < pass.iat || now >= pass.exp) return null;
  return pass;
}
