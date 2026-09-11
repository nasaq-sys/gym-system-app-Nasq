import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  getRecordsByFilter,
  getRecordById,
  updateRecord,
  type AirtableRecord,
} from "@/lib/airtable";
import {
  createSession,
  setSessionCookie,
  type SessionPayload,
  type SessionRole,
} from "@/lib/auth";
import { TABLES, MEMBER_FIELDS, TRAINER_FIELDS, STAFF_FIELDS } from "@/lib/constants";
import { getFromRedis, setInRedis, type CachedUserData } from "@/lib/redisClient";
import { triggerRedisErrorAlert } from "@/lib/alerts";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rateLimit";

// ── IP Tracking — Table IDs & Field IDs ──────────────────────────────────
// Maps session roles to the correct Airtable table/field for storing the
// user's IP on login. Uses stable IDs (not display names) so renaming a
// column in Airtable never breaks IP tracking silently.
const IP_TRACKING_MAP: Record<SessionRole, { tableId: string; ipFieldId: string }> = {
  trainer: {
    tableId: "tblX4JoUcSKbZ1zL0",   // المدربين
    ipFieldId: "fldxAFd198BuAa9Yk",  // IP Address
  },
  admin: {
    tableId: "tblp4eASKZzgQEskh",   // الموظفين
    ipFieldId: "fldN9zni5pHpNOotJ",  // IP Address
  },
  member: {
    tableId: "tblkOSsxXCCcfsMMI",   // المتدربين
    ipFieldId: "fld9UAauFeIiNxSsl",  // IP Address
  },
};

/**
 * Fire-and-forget: PATCH the client's IP into the authenticated user's
 * Airtable record only if it has changed from the currently stored IP.
 * Runs after login succeeds — failure here must never block or break the
 * login flow itself, so errors are caught and logged.
 */
async function trackLoginIp(
  role: SessionRole,
  recordId: string,
  request: Request,
  existingStoredIp?: string | null
): Promise<void> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  if (!baseId || !token) return;

  // Extract the real client IP — same priority as middleware:
  // Netlify's dedicated header → x-forwarded-for → x-real-ip
  const headers = request.headers;
  const ip =
    headers.get("x-nf-client-connection-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    null;
  if (!ip) return;

  const { tableId, ipFieldId } = IP_TRACKING_MAP[role];

  // Smart Check: If the IP in Airtable is already identical to current IP, skip PATCH write entirely!
  if (existingStoredIp && existingStoredIp === ip) {
    return;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { [ipFieldId]: ip } }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error(
      `[track-ip] PATCH failed for ${role} ${recordId}:`,
      (errBody as { error?: { message?: string } })?.error?.message || res.status
    );
  }
}

const BC_PREFIX = /^\$2[aby]\$/;

function genericError() {
  return NextResponse.json(
    { error: "invalid_credentials", message: "Invalid email or password" },
    { status: 401 }
  );
}

/**
 * Verifies `password` against the record's stored password field, migrating
 * a legacy plaintext password to a bcrypt hash on first successful login.
 */
async function verifyAndMigrate(
  table: string,
  record: AirtableRecord,
  passwordField: string,
  password: string
): Promise<boolean> {
  const storedRaw = record.fields[passwordField];
  const stored = Array.isArray(storedRaw) ? storedRaw[0] : storedRaw;
  const storedPassword = stored == null ? "" : String(stored);

  if (BC_PREFIX.test(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }
  if (storedPassword === "") return false;

  const valid = password === storedPassword;
  if (valid) {
    try {
      const hash = await bcrypt.hash(storedPassword, 10);
      record.fields[passwordField] = hash;
      await updateRecord(table, record.id, { [passwordField]: hash });
    } catch (error) {
      console.error("Password hash migration failed:", error);
    }
  }
  return valid;
}

async function findByIdentifier(
  table: string,
  emailField: string,
  phoneField: string,
  identifier: string
): Promise<AirtableRecord | null> {
  const trimmed = identifier.trim();
  const safeIdentifier = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (trimmed.includes("@")) {
    const filterFormula = `REGEX_MATCH({${emailField}}, "(?i)^${safeIdentifier}$")`;
    const records = await getRecordsByFilter(table, filterFormula, {
      maxRecords: 1,
    });
    return records[0] ?? null;
  }

  // Digits extraction for phone matching
  const digitsOnly = trimmed.replace(/\D/g, "");
  const patterns: string[] = [
    `REGEX_MATCH({${emailField}}, "(?i)^${safeIdentifier}$")`,
    `REGEX_MATCH({${phoneField}}, "${safeIdentifier}")`,
  ];

  if (digitsOnly.length >= 7) {
    const last9 = digitsOnly.slice(-9);
    patterns.push(`REGEX_MATCH({${phoneField}}, "${digitsOnly}")`);
    if (last9 !== digitsOnly) {
      patterns.push(`REGEX_MATCH({${phoneField}}, "${last9}")`);
    }
  }

  const filterFormula = `OR(${patterns.join(", ")})`;
  const records = await getRecordsByFilter(table, filterFormula, {
    maxRecords: 1,
  });
  return records[0] ?? null;
}

interface Candidate {
  role: SessionRole;
  table: string;
  emailField: string;
  phoneField: string;
  passwordField: string;
}

const CANDIDATES: Candidate[] = [
  {
    role: "member",
    table: TABLES.MEMBERS,
    emailField: MEMBER_FIELDS.EMAIL,
    phoneField: MEMBER_FIELDS.PHONE,
    passwordField: MEMBER_FIELDS.PASSWORD,
  },
  {
    role: "trainer",
    table: TABLES.TRAINERS,
    emailField: TRAINER_FIELDS.EMAIL,
    phoneField: TRAINER_FIELDS.PHONE,
    passwordField: TRAINER_FIELDS.PASSWORD,
  },
  {
    role: "admin",
    table: TABLES.STAFF,
    emailField: STAFF_FIELDS.EMAIL,
    phoneField: STAFF_FIELDS.PHONE,
    passwordField: STAFF_FIELDS.PASSWORD,
  },
];

function firstLinkedId(value: unknown): string | undefined {
  return Array.isArray(value) && value.length ? String(value[0]) : undefined;
}

export async function POST(request: Request) {
  try {
    // ── In-Memory Rate Limiting: 5 requests / min per IP (Brute-Force Protection)
    const clientIp =
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { isLimited, resetInSeconds } = checkRateLimit(`login:${clientIp}`, {
      windowMs: 60_000,
      maxRequests: 5,
    });

    if (isLimited) {
      return createRateLimitResponse(
        "Too many login attempts, please try again later",
        resetInSeconds
      );
    }

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const rawIdentifier =
      typeof body?.identifier === "string"
        ? body.identifier.trim()
        : typeof body?.email === "string"
          ? body.email.trim()
          : "";
    const password = typeof body?.password === "string" ? body.password : "";

    // ── Immediate Testing Mechanism (?test_redis_error=true) ────────────────
    const isTestRedisError =
      url.searchParams.get("test_redis_error") === "true" ||
      body?.test_redis_error === true;

    if (isTestRedisError) {
      console.warn("[Test Mode] Simulating Redis failure and triggering alert email via SMTP...");
      await triggerRedisErrorAlert(
        new Error("Simulated Redis Connection/Quota Error (Triggered via ?test_redis_error=true)"),
        "User Login Route (/api/auth/login)",
        true // forceSend: bypasses 1-hour cooldown for testing
      );
    }

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { message: "Email/phone and password are required" },
        { status: 400 }
      );
    }

    const isEmail = rawIdentifier.includes("@");
    const digitsOnly = rawIdentifier.replace(/\D/g, "");
    const cacheKey = isEmail
      ? `user_auth_${rawIdentifier.toLowerCase().trim()}`
      : digitsOnly.length >= 7
        ? `user_auth_phone_${digitsOnly.slice(-9)}`
        : `user_auth_${rawIdentifier.toLowerCase().trim()}`;

    // ── STEP 1: Cache Check (Upstash Redis < 5ms) ──────────────────────────
    // Skipped if in simulated test error mode
    const cachedUser = isTestRedisError ? null : await getFromRedis<CachedUserData>(cacheKey);

    if (cachedUser) {
      let isMatch = false;
      if (BC_PREFIX.test(cachedUser.passwordHash)) {
        isMatch = await bcrypt.compare(password, cachedUser.passwordHash);
      } else {
        isMatch = password === cachedUser.passwordHash;
      }

      if (isMatch) {
        // Automatically upgrade legacy plaintext passwords to bcrypt hash in Redis & Airtable
        if (!BC_PREFIX.test(cachedUser.passwordHash)) {
          try {
            const hash = await bcrypt.hash(password, 10);
            cachedUser.passwordHash = hash;
            await updateRecord(cachedUser.table, cachedUser.id, {
              [cachedUser.passwordField]: hash,
            });
            await setInRedis(cacheKey, cachedUser, 86400);
          } catch (e) {
            console.error("[Redis Auth] Password migration error:", e);
          }
        }

        const sessionPayload: SessionPayload = {
          memberId: cachedUser.memberId,
          email: cachedUser.email,
          name: cachedUser.name,
          recordId: cachedUser.id,
          role: cachedUser.role,
          altRole: cachedUser.altRole,
          altRecordId: cachedUser.altRecordId,
          altMemberId: cachedUser.altMemberId,
          altName: cachedUser.altName,
        };

        const token = await createSession(sessionPayload);
        await setSessionCookie(token);

        trackLoginIp(
          cachedUser.role,
          cachedUser.id,
          request,
          cachedUser.existingStoredIp
        ).catch((err) => console.error("[track-ip] Unhandled error:", err));

        return NextResponse.json({
          success: true,
          source: "cache",
          data: {
            name: cachedUser.name,
            email: cachedUser.email,
            memberId: sessionPayload.memberId,
            recordId: sessionPayload.recordId,
            role: cachedUser.role,
            altRole: cachedUser.altRole,
          },
        });
      }
    }

    // ── STEP 2: Airtable Fallback (Cache Miss or New User or Changed Password) ─
    let role: SessionRole | null = null;
    let record: AirtableRecord | null = null;
    let matchedCandidate: Candidate | null = null;

    // The three identifier lookups are independent read-only Airtable
    // queries, so run them concurrently instead of one-after-another —
    // sequentially, a wrong-password or non-member login (which never
    // matches on the first table) paid the full round-trip latency of
    // all three candidates stacked. Password verification/migration can
    // write to Airtable, so that part stays sequential and in the same
    // member > trainer > admin priority order as before.
    const foundByCandidate = await Promise.all(
      CANDIDATES.map((c) =>
        findByIdentifier(c.table, c.emailField, c.phoneField, rawIdentifier)
      )
    );

    for (let i = 0; i < CANDIDATES.length; i++) {
      const c = CANDIDATES[i];
      const found = foundByCandidate[i];
      if (!found) continue;
      const valid = await verifyAndMigrate(c.table, found, c.passwordField, password);
      if (!valid) continue;
      role = c.role;
      record = found;
      matchedCandidate = c;
      break;
    }

    if (!role || !record || !matchedCandidate) {
      return genericError();
    }

    let name = "";
    let idValue = "";
    let userEmail = "";
    let userPhone = "";

    if (role === "member") {
      name =
        (record.fields[MEMBER_FIELDS.NAME] as string) ||
        (record.fields["Name"] as string) ||
        "Member";
      idValue = (record.fields[MEMBER_FIELDS.ID] as string) || record.id;
      userEmail = (record.fields[MEMBER_FIELDS.EMAIL] as string) || "";
      userPhone = (record.fields[MEMBER_FIELDS.PHONE] as string) || "";
    } else if (role === "trainer") {
      name = (record.fields[TRAINER_FIELDS.NAME] as string) || "Trainer";
      idValue = (record.fields[TRAINER_FIELDS.ID] as string) || record.id;
      userEmail = (record.fields[TRAINER_FIELDS.EMAIL] as string) || "";
      userPhone = (record.fields[TRAINER_FIELDS.PHONE] as string) || "";
    } else {
      name = (record.fields[STAFF_FIELDS.NAME] as string) || "Staff";
      idValue = record.id;
      userEmail = (record.fields[STAFF_FIELDS.EMAIL] as string) || "";
      userPhone = (record.fields[STAFF_FIELDS.PHONE] as string) || "";
    }

    const finalEmail = userEmail || (isEmail ? rawIdentifier : "");

    let altRole: SessionRole | undefined;
    let altRecordId: string | undefined;
    let altMemberId: string | undefined;
    let altName: string | undefined;

    try {
      if (role === "trainer") {
        const staffId = firstLinkedId(record.fields[TRAINER_FIELDS.LINKED_STAFF]);
        if (staffId) {
          const staffRecord = await getRecordById(TABLES.STAFF, staffId);
          altRole = "admin";
          altRecordId = staffRecord.id;
          altMemberId = staffRecord.id;
          altName = (staffRecord.fields[STAFF_FIELDS.NAME] as string) || name;
        }
      } else if (role === "admin") {
        const trainerId = firstLinkedId(record.fields[STAFF_FIELDS.LINKED_TRAINER]);
        if (trainerId) {
          const trainerRecord = await getRecordById(TABLES.TRAINERS, trainerId);
          altRole = "trainer";
          altRecordId = trainerRecord.id;
          altMemberId =
            (trainerRecord.fields[TRAINER_FIELDS.ID] as string) || trainerRecord.id;
          altName = (trainerRecord.fields[TRAINER_FIELDS.NAME] as string) || name;
        }
      }
    } catch (error) {
      console.error("Alt-role link lookup failed:", error);
    }

    const { ipFieldId } = IP_TRACKING_MAP[role];
    const existingStoredIp =
      (record.fields[ipFieldId] as string) ||
      (record.fields["IP Address"] as string) ||
      null;

    // ── STEP 3: Write-Through Cache Population (24h TTL) ───────────────────
    if (!isTestRedisError) {
      const storedRaw = record.fields[matchedCandidate.passwordField];
      const storedPw = Array.isArray(storedRaw) ? storedRaw[0] : storedRaw;
      const finalPasswordHash = storedPw == null ? "" : String(storedPw);

      const userCacheData: CachedUserData = {
        id: record.id,
        memberId: idValue,
        name,
        email: finalEmail,
        phone: userPhone,
        role,
        passwordHash: finalPasswordHash,
        table: matchedCandidate.table,
        passwordField: matchedCandidate.passwordField,
        existingStoredIp,
        altRole,
        altRecordId,
        altMemberId,
        altName,
      };

      setInRedis(cacheKey, userCacheData, 86400).catch((err) =>
        console.error("[Redis Cache-Aside Set Warning]", err)
      );

      // Also prime dual login keys if both exist
      if (finalEmail && isEmail === false) {
        setInRedis(`user_auth_${finalEmail.toLowerCase().trim()}`, userCacheData, 86400).catch(() => { });
      }
      const recordPhoneDigits = userPhone.replace(/\D/g, "");
      if (recordPhoneDigits.length >= 7) {
        setInRedis(`user_auth_phone_${recordPhoneDigits.slice(-9)}`, userCacheData, 86400).catch(() => { });
      }
    }

    // ── STEP 4: Session Creation & Response ──────────────────────────────────
    const sessionPayload: SessionPayload = {
      memberId: idValue,
      email: finalEmail,
      name,
      recordId: record.id,
      role,
      altRole,
      altRecordId,
      altMemberId,
      altName,
    };

    const token = await createSession(sessionPayload);
    await setSessionCookie(token);

    trackLoginIp(role, record.id, request, existingStoredIp).catch((err) =>
      console.error("[track-ip] Unhandled error:", err)
    );

    return NextResponse.json({
      success: true,
      source: "airtable",
      test_alert_triggered: isTestRedisError ? true : undefined,
      data: {
        name,
        email: finalEmail,
        memberId: sessionPayload.memberId,
        recordId: sessionPayload.recordId,
        role,
        altRole,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
