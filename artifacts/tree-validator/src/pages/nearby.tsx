import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Navigation, RefreshCw, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useListTrees } from "@workspace/api-client-react";
import { MobileShell } from "@/components/layout";
import { formatDistance, haversineMeters, watchLocation, type DeviceLocation } from "@/lib/geo";

const VERIFICATION_LABEL: Record<string, string> = {
  satellite_detected: "Satellite",
  field_verified: "Verified",
  needs_field_check: "Needs check",
  rejected: "Rejected",
  uncertain: "Uncertain",
};
const VERIFICATION_COLOR: Record<string, string> = {
  satellite_detected: "border-amber-300 bg-amber-50 text-amber-800",
  field_verified: "border-emerald-300 bg-emerald-50 text-emerald-800",
  needs_field_check: "border-orange-300 bg-orange-50 text-orange-800",
  rejected: "border-red-300 bg-red-50 text-red-800",
  uncertain: "border-stone-300 bg-stone-50 text-stone-700",
};

export function NearbyPage() {
  const [loc, setLoc] = useState<DeviceLocation | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [watching, setWatching] = useState(true);

  // Live GPS — auto-starts; user can pause if they want to look at a frozen list.
  useEffect(() => {
    if (!watching) return;
    const stop = watchLocation(
      (l) => {
        setLoc(l);
        setLocError(null);
      },
      (err) => setLocError(err.message),
    );
    return stop;
  }, [watching]);

  // Pull a generous slice of trees (the validator is for the local grove).
  // 500 is more than enough for any one site visit; refresh re-runs the query.
  const treesQ = useListTrees({ limit: 500 });

  const sorted = useMemo(() => {
    const trees = treesQ.data?.trees ?? [];
    if (!loc) return trees.map((t) => ({ ...t, _distance: Number.POSITIVE_INFINITY }));
    return [...trees]
      .map((t) => {
        const lat = typeof t.centroidLat === "number" ? t.centroidLat : null;
        const lon = typeof t.centroidLon === "number" ? t.centroidLon : null;
        const distance =
          lat != null && lon != null
            ? haversineMeters({ lat: loc.lat, lon: loc.lon }, { lat, lon })
            : Number.POSITIVE_INFINITY;
        return { ...t, _distance: distance };
      })
      .sort((a, b) => a._distance - b._distance);
  }, [treesQ.data, loc]);

  const visible = sorted.slice(0, 100);

  return (
    <MobileShell
      title="Nearby Trees"
      right={
        <button
          onClick={() => treesQ.refetch()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
          aria-label="Refresh"
          disabled={treesQ.isFetching}
        >
          {treesQ.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      }
    >
      {/* GPS chip */}
      <div className="tv-card mb-3 flex items-center gap-3 px-3 py-2.5">
        <Navigation
          className={`h-5 w-5 ${loc ? "text-primary" : "text-muted-foreground"}`}
        />
        <div className="flex-1 text-xs leading-tight">
          {locError ? (
            <span className="text-destructive">{locError}</span>
          ) : loc ? (
            <>
              <div className="font-mono text-foreground">
                {loc.lat.toFixed(6)}, {loc.lon.toFixed(6)}
              </div>
              <div className="text-muted-foreground">
                ±{Math.round(loc.accuracy)} m · live GPS
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">Locating you…</span>
          )}
        </div>
        <button
          onClick={() => setWatching((w) => !w)}
          className="text-xs text-primary underline"
        >
          {watching ? "Pause" : "Resume"}
        </button>
      </div>

      <Link to="/new" className="tv-btn-primary mb-3 w-full">
        <Plus className="h-5 w-5 mr-2" /> Map a new tree here
      </Link>

      {treesQ.isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : treesQ.isError ? (
        <div className="tv-card p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          Could not load trees from the server.
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.length === 0 && (
            <li className="tv-card p-6 text-center text-sm text-muted-foreground">
              No trees in the database yet.
            </li>
          )}
          {visible.map((t) => {
            const vKey = String(t.verificationStatus ?? "uncertain");
            return (
              <li key={t.id}>
                <Link
                  to={`/tree/${t.id}`}
                  className="tv-card flex items-center gap-3 px-3 py-3 hover:bg-accent/50"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-mono text-xs">
                    {t.treeCode.slice(-4)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate font-medium"
                        style={{ fontFamily: "var(--app-font-serif)" }}
                      >
                        {t.treeCode}
                      </span>
                      {vKey === "field_verified" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t.groveName ?? "—"} · {t.variety} · {t.ancientStatus}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">
                      {formatDistance(t._distance)}
                    </div>
                    <span
                      className={`tv-pill mt-1 ${VERIFICATION_COLOR[vKey] ?? VERIFICATION_COLOR.uncertain}`}
                    >
                      {VERIFICATION_LABEL[vKey] ?? vKey}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </MobileShell>
  );
}
