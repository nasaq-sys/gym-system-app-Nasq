import assert from "node:assert/strict";
import { test } from "node:test";
import { issueAttendanceQr, verifyAttendanceQr } from "../src/lib/attendanceQrToken.ts";

const secret = "test-secret-which-is-longer-than-thirty-two-characters";
const member = "rec12345678901234";
const start = 1_800_000_000_000;

test("member QR changes at each 25-second boundary and expires exactly there", () => {
  const first = issueAttendanceQr(member, secret, start);
  assert.equal(first.token, issueAttendanceQr(member, secret, start + 24_999).token);
  assert.notEqual(first.token, issueAttendanceQr(member, secret, start + 25_000).token);
  assert.equal(verifyAttendanceQr(first.token, secret, start)?.id, member);
  assert.equal(verifyAttendanceQr(first.token, secret, start + 24_999)?.id, member);
  assert.equal(verifyAttendanceQr(first.token, secret, start + 25_000), null);
});

test("forged or wrong-secret passes are rejected", () => {
  const token = issueAttendanceQr(member, secret, start).token;
  assert.equal(verifyAttendanceQr(token, `${secret}-wrong`, start), null);
  const changed = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(verifyAttendanceQr(changed, secret, start), null);
  assert.equal(verifyAttendanceQr("UG1.invalid.invalid", secret, start), null);
});
