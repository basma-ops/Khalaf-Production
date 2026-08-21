import { useOutbox } from "@/hooks/use-outbox";
import { CloudOff, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small chip in the field app header that surfaces the offline outbox
 * state: a green "synced" tick when nothing is queued, an amber "X في
 * الانتظار" badge with a manual retry button when items are waiting,
 * and a red "غير متصل" pill when the device reports offline. Clicking
 * the chip triggers a manual drain — useful when the network just
 * returned but the periodic poll hasn't fired yet.
 */
export function SyncIndicator() {
  const { items, online, draining, retry } = useOutbox();
  const pendingCount = items.length;
  const hasFailures = items.some((i) => i.retryCount > 0);

  if (!online) {
    return (
      <button
        type="button"
        onClick={retry}
        className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/30"
        data-testid="sync-indicator"
        aria-label="غير متصل"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>غير متصل{pendingCount > 0 ? ` · ${pendingCount}` : ""}</span>
      </button>
    );
  }

  if (pendingCount === 0 && !draining) {
    return (
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        data-testid="sync-indicator"
        aria-label="متصل"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>متصل</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={draining}
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border",
        hasFailures
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40"
          : "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
      )}
      data-testid="sync-indicator"
      aria-label={`${pendingCount} في الانتظار — اضغط لإعادة المزامنة`}
    >
      {draining ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      <span>
        {pendingCount} {pendingCount === 1 ? "في الانتظار" : "في الانتظار"}
      </span>
    </button>
  );
}
