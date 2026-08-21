import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2, AlertTriangle, Crosshair, Check, List } from "lucide-react";
import {
  useGetTreesMapData,
  getGetTreesMapDataQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  getCurrentLocation,
  haversineMeters,
  type DeviceLocation,
} from "@/lib/geo";

interface NearbyTree {
  id: number;
  treeCode: string;
  groveId: number;
  centroidLat: number;
  centroidLon: number;
  distanceMeters: number;
}

function rankTrees(
  loc: DeviceLocation | null,
  trees:
    | ReadonlyArray<{
        id: number;
        treeCode: string;
        groveId: number;
        centroidLat?: number | null;
        centroidLon?: number | null;
      }>
    | null,
  limit: number,
): NearbyTree[] {
  if (!loc || !trees) return [];
  return trees
    .filter(
      (t): t is typeof t & { centroidLat: number; centroidLon: number } =>
        t.centroidLat != null && t.centroidLon != null,
    )
    .map((t) => ({
      id: t.id,
      treeCode: t.treeCode,
      groveId: t.groveId,
      centroidLat: t.centroidLat,
      centroidLon: t.centroidLon,
      distanceMeters: haversineMeters(
        { lat: loc.lat, lon: loc.lon },
        { lat: t.centroidLat, lon: t.centroidLon },
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

interface Props {
  /** Currently selected tree id (controlled). */
  value: number | null;
  onChange: (treeId: number | null, tree: NearbyTree | null) => void;
  /** How many nearest trees to surface. Defaults to 5. */
  limit?: number;
  className?: string;
}

/**
 * GPS-first tree picker with manual fallback. Asks the device for a fix,
 * fetches the lightweight /trees/map-data endpoint, and lists the N nearest
 * trees. If GPS is denied or no trees have centroids, the worker can fall
 * back to a flat "all trees" list to pick one manually.
 *
 * Selection is controlled by the parent so this component can be reused
 * inside larger forms (e.g. a photo-with-side flow) without owning the
 * downstream submit state.
 */
export function TreePicker({ value, onChange, limit = 5, className }: Props) {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const autoPickedRef = useRef(false);

  const { data: trees, isLoading: treesLoading, error: treesError } =
    useGetTreesMapData(undefined, {
      query: {
        queryKey: getGetTreesMapDataQueryKey(),
        staleTime: 60_000,
      },
    });

  async function locate() {
    setLocating(true);
    setLocError(null);
    try {
      const fix = await getCurrentLocation();
      setLocation(fix);
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  }

  const nearest: NearbyTree[] = useMemo(
    () => rankTrees(location, trees ?? null, limit),
    [location, trees, limit],
  );

  // Auto-pick the nearest tree exactly once after both the GPS fix and the
  // tree registry resolve. Using an effect (not the locate() callback) means
  // it works regardless of which one finishes first.
  useEffect(() => {
    if (autoPickedRef.current) return;
    if (value != null) return;
    if (nearest.length === 0) return;
    autoPickedRef.current = true;
    onChange(nearest[0].id, nearest[0]);
  }, [nearest, value, onChange]);

  const allTrees = useMemo(
    () =>
      (trees ?? [])
        .slice()
        .sort((a, b) => a.treeCode.localeCompare(b.treeCode)),
    [trees],
  );

  // Manual fallback should appear when GPS isn't usable: either the worker
  // denied permission, or the tree registry has no centroids to rank against.
  const showManualFallback =
    showAll ||
    !!locError ||
    (location != null && !treesLoading && !treesError && nearest.length === 0);

  return (
    <div className={className}>
      {!location && (
        <Button
          type="button"
          onClick={locate}
          disabled={locating}
          className="w-full h-14 text-base"
          data-testid="button-locate-me"
        >
          {locating ? (
            <>
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              جارٍ تحديد الموقع…
            </>
          ) : (
            <>
              <Crosshair className="ml-2 h-5 w-5" />
              ابحث عن أقرب شجرة
            </>
          )}
        </Button>
      )}

      {locError && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          data-testid="loc-error"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{locError}</span>
        </div>
      )}

      {location && (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">
              {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
            </span>
            <span>· ±{Math.round(location.accuracy)} m</span>
          </span>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="text-primary hover:underline"
            data-testid="button-relocate"
          >
            {locating ? "…" : "تحديث"}
          </button>
        </div>
      )}

      {(location || showManualFallback) && treesLoading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ تحميل الأشجار…
        </div>
      )}

      {(location || showManualFallback) && treesError && (
        <div className="text-sm text-destructive">
          تعذّر تحميل قائمة الأشجار. حاول مرة أخرى.
        </div>
      )}

      {location && !treesLoading && !treesError && nearest.length === 0 && !showAll && (
        <div className="text-sm text-muted-foreground py-4 text-center">
          لا توجد أشجار بإحداثيات GPS ضمن النطاق.
        </div>
      )}

      {nearest.length > 0 && !showAll && (
        <ul className="space-y-2" data-testid="nearest-list">
          {nearest.map((t, i) => {
            const selected = value === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onChange(t.id, t)}
                  aria-pressed={selected}
                  data-testid={`tree-option-${t.id}`}
                  className="block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card
                    className={cn(
                      "transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/40",
                    )}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-md border flex items-center justify-center font-semibold text-sm shrink-0",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {selected ? <Check className="h-4 w-4" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground truncate">
                          {t.treeCode}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          بستان #{t.groveId}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono text-foreground">
                          {formatDistance(t.distanceMeters)}
                        </div>
                        <div className="text-[10px] tracking-wider text-muted-foreground">
                          المسافة
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showManualFallback && !treesLoading && !treesError && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs uppercase tracking-[0.18em] text-primary hover:underline flex items-center gap-1.5"
            data-testid="button-toggle-all-trees"
          >
            <List className="h-3.5 w-3.5" />
            {showAll ? "إخفاء القائمة الكاملة" : "عرض كل الأشجار"}
          </button>

          {showAll && allTrees.length > 0 && (
            <ul
              className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1"
              data-testid="all-trees-list"
            >
              {allTrees.map((t) => {
                const selected = value === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onChange(t.id, {
                          id: t.id,
                          treeCode: t.treeCode,
                          groveId: t.groveId,
                          centroidLat: t.centroidLat ?? 0,
                          centroidLon: t.centroidLon ?? 0,
                          distanceMeters: 0,
                        })
                      }
                      aria-pressed={selected}
                      data-testid={`tree-all-option-${t.id}`}
                      className="block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Card
                        className={cn(
                          "transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/40",
                        )}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-md border flex items-center justify-center shrink-0",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {selected ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <MapPin className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-foreground truncate">
                              {t.treeCode}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              بستان #{t.groveId}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
