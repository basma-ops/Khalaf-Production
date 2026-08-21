import { useEffect, useState, type ReactNode } from "react";
import { establishSession, getSessionMe } from "@workspace/api-client-react";

export function ManagerPinGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getSessionMe()
      .then((me) => {
        if (cancelled) return;
        if (me.kind === "manager") setAuthed(true);
      })
      .catch(() => {})
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
      else if (/503/.test(msg)) setError("Manager login disabled on the server");
      else setError(msg || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (authed) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6 pt-20">
      <div className="flex flex-col items-center mb-10">
        <div className="text-3xl font-semibold text-primary mb-1" style={{ fontFamily: "var(--app-font-serif)" }}>
          خَلَف
        </div>
        <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "var(--app-font-serif)" }}>
          Tree Validator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manager PIN required
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col space-y-5">
        <div>
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-md border-2 border-primary/40 bg-card px-4 py-4 text-center text-2xl tracking-[0.4em] focus:border-primary focus:outline-none"
          />
          {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <button type="submit" disabled={busy || pin.length === 0} className="tv-btn-primary">
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>

      <p className="mt-auto pb-8 pt-12 text-center text-xs text-muted-foreground">
        Khalaf Olive Groves · Field Tools
      </p>
    </div>
  );
}
