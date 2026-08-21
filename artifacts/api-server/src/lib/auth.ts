import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const SESSION_COOKIE = "khalaf_session";

export type Principal =
  | { kind: "worker"; userId: number }
  | { kind: "manager"; userId: number | null };

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year

function getSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET env var is required (>=16 chars) to sign session cookies",
    );
  }
  return s;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payload).digest());
}

/**
 * Sign a session payload. Cookie format is `<payload>.<base64url(hmac)>`.
 * Payload is `manager` or `worker:<id>`.
 */
export function signSession(payload: string): string {
  return `${payload}.${sign(payload)}`;
}

/** Verify a signed cookie value and return the payload, or null if invalid. */
function verifySession(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  // timing-safe compare on equal-length buffers
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return payload;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: false, // proxy is HTTPS in production but the dev preview is HTTP via the same proxy
  maxAge: SESSION_MAX_AGE_SEC * 1000,
};

/** Issue a signed session cookie via Set-Cookie header. */
export function setSessionCookie(res: Response, payload: string): void {
  res.cookie(SESSION_COOKIE, signSession(payload), COOKIE_OPTIONS);
}

/** Clear the session cookie. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Resolve the requesting principal from the signed `khalaf_session` cookie.
 *
 * The cookie payload is `worker:<userId>` or `manager`, but only when the
 * accompanying HMAC signature (made with SESSION_SECRET, which clients do
 * not have) verifies. Unsigned or tampered cookies are rejected, so a
 * client cannot mint a manager session via document.cookie / DevTools.
 *
 * The cookie is HttpOnly, so client JS cannot read or write it; the only
 * way a session is established is via POST /api/session/establish.
 */
export async function resolvePrincipal(req: Request): Promise<Principal | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const payload = verifySession(raw);
  if (!payload) return null;

  if (payload === "manager") {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "manager"), eq(usersTable.active, true)))
      .limit(1);
    return { kind: "manager", userId: user?.id ?? null };
  }
  const m = /^worker:(\d+)$/.exec(payload);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, active: usersTable.active })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!user || !user.active) return null;
  return { kind: "worker", userId: user.id };
}

/**
 * Helper: require any authenticated principal (worker OR manager).
 * Writes a 401 and returns null if the request is unauthenticated.
 */
export async function requireAuthenticated(
  req: Request,
  res: Response,
): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return principal;
}
