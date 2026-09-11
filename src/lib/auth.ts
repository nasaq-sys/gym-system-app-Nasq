import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// REMINDER: Add JWT_SECRET=your_super_secret_string_here to your .env.local file.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "ultra-gym-super-secret-jwt-key-change-in-production"
);

const COOKIE_NAME = "gojim_session";
const EXPIRY = "24h"; // 24-hour expiration
const MAX_AGE_SECONDS = 86400; // 1 day (86,400 seconds)

export type SessionRole = "member" | "trainer" | "admin";

export interface SessionPayload {
  memberId: string;
  email: string;
  name: string;
  recordId: string;
  role: SessionRole;
  altRole?: SessionRole;
  altRecordId?: string;
  altMemberId?: string;
  altName?: string;
}

/**
 * Generates a signed JWT with 24-hour expiration using jose.
 */
export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(JWT_SECRET);
  return token;
}

/**
 * Reads and verifies the JWT session from HttpOnly cookies.
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const session = payload as unknown as SessionPayload;
    if (!session.role) session.role = "member";
    return session;
  } catch {
    return null;
  }
}

/**
 * Sets the HttpOnly JWT cookie with Strict security flags.
 */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // Prevents XSS attacks
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    sameSite: "strict", // Prevents CSRF attacks
    path: "/",
    maxAge: MAX_AGE_SECONDS, // 86,400 seconds (24 hours)
  });
}

/**
 * Clears the session cookie on logout.
 */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete("ug_sh_token");
}
