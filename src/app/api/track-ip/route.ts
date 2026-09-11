import { NextResponse, type NextRequest } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { z } from "zod";

const trackIpSchema = z.object({
  recordId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[^<>]*$/, "HTML tags and scripts (<, >) are forbidden")
    .optional(),
  userRole: z
    .string()
    .trim()
    .max(50)
    .regex(/^[^<>]*$/, "HTML tags and scripts (<, >) are forbidden")
    .optional(),
});

// ── Airtable Table IDs & Field IDs ────────────────────────────────────────
// Using stable IDs (not display names) so renaming a column in Airtable
// never silently breaks the integration.
const ROLE_TABLE_MAP = {
  Trainer: {
    tableId: "tblX4JoUcSKbZ1zL0",   // المدربين
    ipFieldId: "fldxAFd198BuAa9Yk",  // IP Address
  },
  Employee: {
    tableId: "tblp4eASKZzgQEskh",   // الموظفين
    ipFieldId: "fldN9zni5pHpNOotJ",  // IP Address
  },
  Trainee: {
    tableId: "tblkOSsxXCCcfsMMI",   // المتدربين
    ipFieldId: "fld9UAauFeIiNxSsl",  // IP Address
  },
} as const;

type UserRole = keyof typeof ROLE_TABLE_MAP;

function normalizeRole(role: string): UserRole | null {
  const r = role.toLowerCase();
  if (r === "trainer") return "Trainer";
  if (r === "admin" || r === "employee" || r === "staff") return "Employee";
  if (r === "member" || r === "trainee") return "Trainee";
  return null;
}

/**
 * Extracts the real client IP from request headers.
 * Priority: Netlify's dedicated header → x-forwarded-for (first hop) → x-real-ip → "unknown".
 */
function extractClientIp(request: NextRequest): string {
  const nf = request.headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// ── Route Handler ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_TOKEN;

    if (!baseId || !token) {
      console.error("[track-ip] Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN env vars.");
      return NextResponse.json(
        { error: "server_config", message: "Server misconfigured." },
        { status: 500 }
      );
    }

    // ── Zero Trust Authenticated User or Body Payload ────────────────
    const user = await verifyApiRequest(request);

    const rawBody = await request.json().catch(() => null);
    const validation = trackIpSchema.safeParse(rawBody || {});
    if (!validation.success) {
      return NextResponse.json(
        { error: "validation_failed", message: "Invalid payload." },
        { status: 400 }
      );
    }

    const recordId = validation.data.recordId || (user ? user.recordId : "");
    const roleStr = validation.data.userRole || (user ? user.role : "");

    if (!recordId) {
      return NextResponse.json(
        { error: "missing_field", message: "recordId is required or user must be logged in." },
        { status: 400 }
      );
    }

    const userRole = normalizeRole(roleStr);
    if (!userRole) {
      return NextResponse.json(
        {
          error: "invalid_role",
          message: `userRole must be one of: Trainer, Employee, Trainee (or admin/trainer/member).`,
        },
        { status: 400 }
      );
    }

    // ── Extract client IP ──────────────────────────────────────────────
    const { tableId, ipFieldId } = ROLE_TABLE_MAP[userRole];
    const clientIp = extractClientIp(request);

    if (clientIp === "unknown") {
      // Nothing useful to store — succeed silently rather than error.
      return NextResponse.json({ success: true, ip: null, skipped: true });
    }

    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`;

    // ── Smart Check: Fetch currently stored IP to avoid redundant writes ─
    try {
      const getRes = await fetch(airtableUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (getRes.ok) {
        const recordData = await getRes.json();
        const storedIp =
          recordData?.fields?.[ipFieldId] ||
          recordData?.fields?.["IP Address"] ||
          null;

        // If the stored IP is identical to the client IP, skip the Airtable write entirely!
        if (storedIp === clientIp) {
          return NextResponse.json({
            success: true,
            ip: clientIp,
            updated: false,
            message: "IP is identical. Database write skipped.",
          });
        }
      }
    } catch (readErr) {
      console.warn("[track-ip] Could not verify existing IP before patch:", readErr);
    }

    // ── PATCH the new IP into Airtable ──────────────────────────────────
    const patchRes = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          [ipFieldId]: clientIp,
        },
      }),
    });

    if (!patchRes.ok) {
      const errBody = await patchRes.json().catch(() => ({}));
      const errMsg =
        (errBody as { error?: { message?: string } })?.error?.message ||
        `HTTP ${patchRes.status}`;
      console.error(`[track-ip] Airtable PATCH failed for ${userRole} ${recordId}: ${errMsg}`);
      return NextResponse.json(
        { error: "airtable_error", message: errMsg },
        { status: patchRes.status >= 500 ? 502 : patchRes.status }
      );
    }

    return NextResponse.json({ success: true, ip: clientIp, updated: true });
  } catch (err) {
    console.error("[track-ip] Unexpected error:", err);
    return NextResponse.json(
      { error: "internal", message: "Internal server error." },
      { status: 500 }
    );
  }
}
