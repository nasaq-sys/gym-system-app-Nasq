import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionRole } from "@/lib/auth";

// Shared secret key for cryptographic signature verification
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "ultra-gym-super-secret-jwt-key-change-in-production"
);

const COOKIE_NAMES = ["token", "gojim_session"];

export interface AuthUser {
  memberId: string;
  email: string;
  name: string;
  recordId: string;
  role: SessionRole;
  altRole?: SessionRole;
  altRecordId?: string;
  altMemberId?: string;
  altName?: string;
  [key: string]: unknown;
}

/**
 * Extracts and cryptographically verifies the JWT token from incoming API requests.
 * Checks the `Authorization: Bearer <token>` header first, then falls back to HttpOnly cookies.
 * 
 * Returns the decoded and validated `AuthUser` payload if the signature is valid and not expired.
 * Returns `null` if the token is missing, expired, malformed, or forged.
 */
export async function verifyApiRequest(
  request?: Request | NextRequest
): Promise<AuthUser | null> {
  try {
    let token: string | undefined;

    // 1. Try extracting from Authorization: Bearer <token> header
    if (request?.headers) {
      const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
    } else {
      try {
        const reqHeaders = await headers();
        const authHeader = reqHeaders.get("authorization") || reqHeaders.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.slice(7).trim();
        }
      } catch {
        // headers() not available in this context
      }
    }

    // 2. Try extracting from request cookies (if NextRequest)
    if (!token && request && "cookies" in request && typeof (request as NextRequest).cookies?.get === "function") {
      for (const name of COOKIE_NAMES) {
        const cookieVal = (request as NextRequest).cookies.get(name)?.value;
        if (cookieVal) {
          token = cookieVal;
          break;
        }
      }
    }

    // 3. Fallback: Try extracting from next/headers cookies()
    if (!token) {
      try {
        const cookieStore = await cookies();
        for (const name of COOKIE_NAMES) {
          const cookieVal = cookieStore.get(name)?.value;
          if (cookieVal) {
            token = cookieVal;
            break;
          }
        }
      } catch {
        // cookies() not available in this context
      }
    }

    if (!token) {
      return null;
    }

    // 4. Cryptographically verify the signature and expiration against JWT_SECRET
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!payload || typeof payload !== "object") {
      return null;
    }

    // Normalize and cast payload to AuthUser
    const user: AuthUser = {
      memberId: (payload.memberId as string) || (payload.id as string) || (payload.sub as string) || "",
      email: (payload.email as string) || "",
      name: (payload.name as string) || "",
      recordId: (payload.recordId as string) || (payload.id as string) || "",
      role: (payload.role as SessionRole) || "member",
      altRole: payload.altRole as SessionRole | undefined,
      altRecordId: payload.altRecordId as string | undefined,
      altMemberId: payload.altMemberId as string | undefined,
      altName: payload.altName as string | undefined,
      ...payload,
    };

    return user;
  } catch {
    // Verification failed (e.g. signature mismatch, expired token, malformed token)
    return null;
  }
}
