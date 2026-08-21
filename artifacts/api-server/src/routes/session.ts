import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { setSessionCookie, clearSessionCookie, resolvePrincipal } from "../lib/auth";

const router: IRouter = Router();

type EstablishBody =
  | { kind: "manager"; pin: string }
  | { kind: "worker"; userId: number };

function parseEstablishBody(body: unknown): EstablishBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.kind === "manager") {
    if (typeof b.pin !== "string" || b.pin.length === 0) return null;
    return { kind: "manager", pin: b.pin };
  }
  if (b.kind === "worker") {
    const userId = Number(b.userId);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return { kind: "worker", userId };
  }
  return null;
}

// Constant-time PIN compare; rejects if MANAGER_PIN is unset (<4 chars).
function verifyManagerPin(submitted: string): boolean {
  const expected = process.env["MANAGER_PIN"];
  if (!expected || expected.length < 4) return false;
  const max = Math.max(expected.length, submitted.length);
  const a = Buffer.alloc(max);
  const b = Buffer.alloc(max);
  Buffer.from(submitted).copy(a);
  Buffer.from(expected).copy(b);
  return submitted.length === expected.length && timingSafeEqual(a, b);
}

/**
 * POST /api/session/establish
 *
 * Issues an HttpOnly, HMAC-signed session cookie. This is the ONLY way a
 * client can obtain a session — document.cookie writes can no longer mint
 * a usable token because verifySession rejects anything without a valid
 * HMAC made with the server-side SESSION_SECRET.
 *
 * The endpoint validates that the requested identity actually exists in
 * the users table with the matching role; that's what ties cookie
 * issuance to a real user record (so e.g. you can't establish
 * `worker:99999` and then start uploading). For `kind: manager` the
 * server picks the active manager user; we don't accept arbitrary userIds
 * here because the manager UI is single-tenant.
 *
 * NOTE: this endpoint does NOT require a password — the project has no
 * user-credential model, identity is selection-based. The security
 * benefits over the previous design are: (a) the cookie cannot be forged
 * client-side; (b) HttpOnly prevents XSS exfiltration; (c) every
 * issuance touches the server and validates the user record.
 */
router.post("/session/establish", async (req: Request, res: Response) => {
  const parsed = parseEstablishBody(req.body);
  if (!parsed) {
    res.status(400).json({
      error:
        "Invalid body — expected {kind: 'manager', pin: <string>} or {kind: 'worker', userId: <int>}",
    });
    return;
  }
  if (parsed.kind === "manager") {
    if (!process.env["MANAGER_PIN"]) {
      res.status(503).json({
        error: "Manager login is disabled: MANAGER_PIN env secret is not configured",
      });
      return;
    }
    if (!verifyManagerPin(parsed.pin)) {
      res.status(401).json({ error: "Invalid manager PIN" });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "manager"), eq(usersTable.active, true)))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "No active manager user is configured" });
      return;
    }
    setSessionCookie(res, "manager");
    res.json({ kind: "manager", userId: user.id });
    return;
  }
  // worker
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, active: usersTable.active })
    .from(usersTable)
    .where(eq(usersTable.id, parsed.userId))
    .limit(1);
  if (!user || !user.active) {
    res.status(404).json({ error: "Worker not found or inactive" });
    return;
  }
  if (user.role === "manager") {
    res.status(400).json({
      error: "Cannot establish a worker session for a manager user; use kind: 'manager'",
    });
    return;
  }
  setSessionCookie(res, `worker:${user.id}`);
  res.json({ kind: "worker", userId: user.id });
});

/** POST /api/session/logout — clear the cookie. */
router.post("/session/logout", (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** GET /api/session/me — echoes the current principal (or 401). */
router.get("/session/me", async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(principal);
});

export default router;
