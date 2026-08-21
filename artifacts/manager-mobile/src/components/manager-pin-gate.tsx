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
      else if (/503/.test(msg))
        setError("Login disabled");
      else setError(msg || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (authed) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground font-serif">
        Restoring session…
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6 pt-24 font-serif">
      <div className="flex flex-col items-center mb-12">
        <h1 className="text-3xl font-bold text-primary mb-2">زيتون خلف</h1>
        <h2 className="text-xl text-foreground/80 tracking-wide">Manager Access</h2>
      </div>
      
      <form onSubmit={onSubmit} className="flex flex-col space-y-6">
        <div className="space-y-2">
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            className="w-full rounded-md border-b-2 border-primary bg-background/50 px-4 py-4 text-center text-2xl tracking-widest text-foreground placeholder:text-muted-foreground/50 focus:bg-background focus:outline-none"
          />
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={busy || pin.length === 0}
          className="w-full rounded bg-primary px-4 py-4 text-lg font-medium text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
