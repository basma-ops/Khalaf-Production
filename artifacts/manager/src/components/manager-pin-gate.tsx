import { useEffect, useState, type ReactNode } from "react";
import { establishSession, getSessionMe } from "@workspace/api-client-react";

// Lock screen: exchanges the MANAGER_PIN for an HMAC-signed HttpOnly
// session cookie. The cookie itself is the session — we never persist
// the PIN client-side. On reload we ask the server (`/session/me`)
// whether the cookie is still valid; only when it isn't do we prompt.
export function ManagerPinGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount, restore the session via the cookie (no PIN replay).
  useEffect(() => {
    let cancelled = false;
    void getSessionMe()
      .then((me) => {
        if (cancelled) return;
        if (me.kind === "manager") setAuthed(true);
      })
      .catch(() => {
        /* 401 → user must enter the PIN */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      await establishSession({ kind: "manager", pin });
      setPin("");
      setAuthed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/401/.test(msg)) setError("Incorrect PIN");
      else if (/503/.test(msg))
        setError("Manager login is disabled — MANAGER_PIN secret is not configured");
      else setError(msg || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (authed) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring manager session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        data-testid="manager-pin-gate"
      >
        <div>
          <h1 className="text-xl font-serif font-semibold text-foreground tracking-tight">Manager sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the manager PIN to access Khalaf Olive Groves.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Manager PIN"
          className="w-full rounded border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="manager-pin-input"
        />
        {error && (
          <p className="text-sm text-destructive" data-testid="manager-pin-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || pin.length === 0}
          className="w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="manager-pin-submit"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
