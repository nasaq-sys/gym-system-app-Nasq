import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

// Dev-only console logging — no-ops in production so the hot request path
// (this middleware runs on almost every request) doesn't pay for synchronous
// console I/O. Structured production logging goes through logToBetterStack()
// below, which is fire-and-forget via event.waitUntil().
const IS_PROD = process.env.NODE_ENV === "production";
function debugLog(...args: unknown[]) {
  if (!IS_PROD) console.log(...args);
}

// ── Airtable Blacklist — Table & Field IDs ───────────────────────────────
const BLACKLIST_TABLE_ID = "tblVuVK9N2uafKTb9";
const BLACKLIST_IP_FIELD_ID = "fldfatJ18ONtovF6O"; // IP Address

// ── Static fallback IP lists ─────────────────────────────────────────────
const BLOCKED_IPS: string[] = [
  // "203.0.113.50",
];

const BLOCKED_IPS_2: string[] = [
  // "203.0.113.50",
];

// ── In-memory blacklist cache ────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
let cachedBlacklist: string[] | null = null;
let cacheExpiresAt = 0;
let fetchInFlight: Promise<string[]> | null = null;

// ── Helper: Safe JWT Session Extraction (Edge Runtime Compatible) ───────────
interface TokenPayload {
  email?: string;
  role?: string;
  recordId?: string;
}

function extractSessionFromToken(token?: string): TokenPayload | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return null;

    // Convert Base64URL to standard Base64 and add padding for atob in Edge Runtime
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = atob(padded);
    const payload = JSON.parse(decoded);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

// ── 100% Edge-Compatible Background Logger for Better Stack (Logtail) ───
// Uses native fetch() and is executed inside event.waitUntil() so logging
// happens asynchronously in the background and NEVER delays the client response.
async function logToBetterStack(
  level: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const token = process.env.LOGTAIL_SOURCE_TOKEN;
  if (!token) return;

  try {
    const payload = {
      dt: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    await fetch("https://s2677259.eu-central-1a.betterstackdata.com", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[BetterStack Logtail Error]", err);
  }
}

// ── IP extraction ────────────────────────────────────────────────────────
// Strictly extracts the first IP from Netlify's x-nf-client-connection-ip
// header or x-forwarded-for fallback, trimming trailing whitespace.
function getClientIp(request: NextRequest): string {
  const nf = request.headers.get("x-nf-client-connection-ip");
  if (nf) {
    const ip = nf.split(",")[0].trim();
    if (ip) return ip;
  }

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0].trim();
    if (ip) return ip;
  }

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}

// ── Fetch blacklist from Airtable (with timeout & 60s cache) ────────────
async function fetchBlacklistFromAirtable(): Promise<string[]> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_TOKEN;

  if (!baseId || !token) {
    debugLog("[Blacklist] ⚠ Missing env vars — dynamic blacklist disabled.");
    return [];
  }

  const allIps: string[] = [];
  let offset: string | undefined;

  do {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    try {
      const params = new URLSearchParams();
      params.set("fields[]", BLACKLIST_IP_FIELD_ID);
      params.set("pageSize", "100");
      params.set("returnFieldsByFieldId", "true");
      if (offset) params.set("offset", offset);

      const url = `https://api.airtable.com/v0/${baseId}/${BLACKLIST_TABLE_ID}?${params}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        debugLog(`[Blacklist] ❌ Airtable fetch failed: HTTP ${res.status}`);
        break;
      }

      const data = (await res.json()) as {
        records: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      };

      for (const rec of data.records) {
        const rawIp = rec.fields[BLACKLIST_IP_FIELD_ID];
        if (typeof rawIp === "string") {
          const ip = rawIp.trim();
          if (ip) allIps.push(ip);
        }
      }

      offset = data.offset;
    } catch (err) {
      clearTimeout(timeoutId);
      debugLog("[Blacklist] ❌ Airtable fetch error or timeout:", err);
      break;
    }
  } while (offset);

  debugLog(`[Blacklist] ✅ Fetched ${allIps.length} blocked IPs:`, allIps);
  return allIps;
}

// ── Cached blacklist getter (non-blocking) ───────────────────────────────
function getBlacklist(): string[] {
  const now = Date.now();

  if (cachedBlacklist !== null && now < cacheExpiresAt) {
    return cachedBlacklist;
  }

  if (!fetchInFlight) {
    fetchInFlight = fetchBlacklistFromAirtable()
      .then((ips) => {
        cachedBlacklist = ips;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return ips;
      })
      .catch((err) => {
        debugLog("[Blacklist] ❌ Fetch error (cached for 5m):", err);
        cachedBlacklist = [];
        cacheExpiresAt = Date.now() + 300_000; // Cache empty for 5m to avoid repeat timeouts
        return [];
      })
      .finally(() => {
        fetchInFlight = null;
      });
  }

  return cachedBlacklist ?? [];
}

// ── Rate limiting ────────────────────────────────────────────────────────
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX_REQUESTS = 120;

const LOGIN_WINDOW_MS = 60_000; // 1 minute window
const LOGIN_MAX_REQUESTS = 5; // 5 requests per minute

const MAX_TRACKED_KEYS = 5000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function isRateLimited(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > max;
}

function rateLimitResponse(retryAfterSeconds: number, message = "Too many login attempts, please try again later") {
  return NextResponse.json(
    {
      error: "too_many_requests",
      message,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Content-Type": "application/json",
      },
    }
  );
}

// ── Strict Route Whitelist ────────────────────────────────────────────────
// Defines valid route prefixes and exact paths for this application.
// Any request that does NOT match this whitelist is immediately blocked with 403.
const ALLOWED_PATH_PREFIXES = [
  // Application Page Routes
  "/home",
  "/login",
  "/events",
  "/followups",
  "/lost-and-found",
  "/meal-calculator",
  "/my-orders",
  "/notifications",
  "/nutrition",
  "/payment",
  "/profile",
  "/services",
  "/shop",
  "/store",
  "/workouts",
  "/kitchen-display",
  "/trainer",
  "/blocked",

  // API Endpoints
  "/api",

  // Next.js Internals & Static Assets
  "/_next",
  "/assets",
  "/icons",
];

const ALLOWED_EXACT_PATHS = new Set([
  "/",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/manifest.json",
  "/sw.js",
  "/robots.txt",
  "/sitemap.xml",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
]);

// Common static file extensions that may be served from /public
const STATIC_FILE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|webmanifest|css|js|map|json|woff2?|ttf|eot|txt|xml)$/i;

function isAllowedPath(pathname: string): boolean {
  // 1. Root & exact static files
  if (ALLOWED_EXACT_PATHS.has(pathname)) {
    return true;
  }

  // 2. Allowed route prefixes (e.g. /trainer, /home, /api/auth/login)
  for (const prefix of ALLOWED_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // 3. Static assets with valid file extensions
  if (STATIC_FILE_EXTENSIONS.test(pathname)) {
    return true;
  }

  return false;
}

// ── Main middleware ──────────────────────────────────────────────────────
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // ── 0. Strict Route Whitelist (Instant 403 Forbidden) ───────────────
  // Blocks random bot scans (e.g. /foxfan, /columnist, /remindpasswd) before
  // any JWT parsing, database lookups, or heavy Next.js 404 page renders.
  if (!isAllowedPath(pathname)) {
    return new NextResponse("Forbidden - Invalid Route", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const clientIp = getClientIp(request);

  // ── Extract User Session from JWT in Cookies ──────────────────────────
  const token = request.cookies.get("token")?.value || request.cookies.get("gojim_session")?.value;
  const session = extractSessionFromToken(token);
  const userEmail = session?.email || "Guest";
  const userRole = session?.role || "guest";

  // ── Helper to log structured JSON before returning any NextResponse ─
  const withLog = <T extends NextResponse>(res: T): T => {
    debugLog(
      JSON.stringify({
        message: "Incoming Request",
        email: userEmail,
        path: request.nextUrl.pathname,
      })
    );
    return res;
  };

  // ── INFINITE LOOP GUARD ────────────────────────────────────────────
  if (pathname === "/blocked") {
    return withLog(NextResponse.next());
  }

  const userAgent = request.headers.get("user-agent") || "unknown";
  const isUptimeBot = /better\s*stack|uptime/i.test(userAgent);

  // 1. Background log all real user incoming requests (skipping uptime monitoring bots)
  if (!isUptimeBot) {
    event.waitUntil(
      logToBetterStack("info", "Incoming Request", {
        method: request.method,
        pathname,
        ip: clientIp,
        userAgent,
        email: userEmail,
      })
    );
  }

  // ── 2. Static IP block check ───────────────────────────────────────
  if (BLOCKED_IPS.includes(clientIp) || BLOCKED_IPS_2.includes(clientIp)) {
    event.waitUntil(
      logToBetterStack("warn", "🚨 Blocked User Attempt", {
        ip: clientIp,
        pathname,
        reason: "static_list",
        email: userEmail,
      })
    );
    return withLog(NextResponse.redirect(new URL("/blocked", request.url)));
  }

  // ── 3. Dynamic Airtable blacklist check ────────────────────────────
  try {
    const blockedIps = getBlacklist();

    if (blockedIps.includes(clientIp)) {
      // Background log warning event for blocked user attempt
      event.waitUntil(
        logToBetterStack("warn", "🚨 Blocked User Attempt", {
          ip: clientIp,
          pathname,
          reason: "airtable_blacklist",
          email: userEmail,
        })
      );
      return withLog(NextResponse.redirect(new URL("/blocked", request.url)));
    }
  } catch (err) {
    debugLog("[Middleware] ⚠ Blacklist check failed, allowing request:", err);
  }

  // ── 4. Rate limiting (API routes only) ─────────────────────────────
  if (pathname.startsWith("/api/")) {
    if (
      pathname === "/api/auth/login" &&
      isRateLimited(`login:${clientIp}`, LOGIN_WINDOW_MS, LOGIN_MAX_REQUESTS)
    ) {
      event.waitUntil(
        logToBetterStack("warn", "Login rate limit exceeded", {
          ip: clientIp,
          pathname,
          email: userEmail,
        })
      );
      return withLog(rateLimitResponse(Math.ceil(LOGIN_WINDOW_MS / 1000)));
    }

    if (
      pathname === "/api/push/receipt" &&
      isRateLimited(`receipt:${clientIp}`, 60000, 120)
    ) {
      return withLog(rateLimitResponse(60, "Too many receipt requests"));
    }

    if (pathname !== "/api/push/receipt" && isRateLimited(`global:${clientIp}`, GLOBAL_WINDOW_MS, GLOBAL_MAX_REQUESTS)) {
      event.waitUntil(
        logToBetterStack("warn", "Global API rate limit exceeded", {
          ip: clientIp,
          pathname,
          email: userEmail,
        })
      );
      return withLog(rateLimitResponse(Math.ceil(GLOBAL_WINDOW_MS / 1000)));
    }
  }

  // ── 5. Role-Based Access Control (RBAC Guards) ───────────────────
  if (pathname.startsWith("/trainer") || pathname.startsWith("/api/trainer")) {
    if (!session || userRole !== "trainer") {
      if (pathname.startsWith("/api/")) {
        return withLog(
          NextResponse.json({ error: "Forbidden: Trainer access required" }, { status: 403 })
        );
      }
      const redirectUrl = session ? "/home" : `/login?redirect=${encodeURIComponent(pathname)}`;
      return withLog(NextResponse.redirect(new URL(redirectUrl, request.url)));
    }
  }

  // ── 6. Root redirect ───────────────────────────────────────────────
  if (pathname === "/") {
    return withLog(NextResponse.redirect(new URL("/home", request.url)));
  }

  return withLog(NextResponse.next());
}

// ── Matcher ──────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};
