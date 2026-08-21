import { useMemo, useState } from "react";
import { MapPin, Loader2, AlertTriangle, Crosshair, Check, ChevronsUpDown } from "lucide-react";
import { useListGroves, getListGrovesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  getCurrentLocation,
  haversineMeters,
  type DeviceLocation,
} from "@/lib/geo";

export interface PickedGrove {
  id: number;
  name: string;
  groveCode: string;
  distanceMeters: number | null;
}

interface Props {
  value: number | null;
  onChange: (groveId: number | null, grove: PickedGrove | null) => void;
  className?: string;
}

/**
 * GPS-first grove picker. Asks for the device fix, ranks groves by
 * Haversine distance from grove centroids, and pre-selects the nearest
 * one. Workers can override with the manual list (always shown beneath
 * the GPS pick) — covering the case where GPS is denied / unavailable
 * or the centroid hasn't been entered for that grove yet.
 */
export function GrovePicker({ value, onChange, className }: Props) {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: groves, isLoading, error } = useListGroves({
    query: { queryKey: getListGrovesQueryKey(), staleTime: 60_000 },
  });

  async function locate() {
    setLocating(true);
    setLocError(null);
    try {
      const fix = await getCurrentLocation();
      setLocation(fix);
      // Auto-pick the nearest grove on first successful fix so the
      // worker doesn't have to tap again in the common path.
      const ranked = rankGroves(fix, groves ?? []);
      if (ranked.length > 0 && value == null) {
        onChange(ranked[0].id, ranked[0]);
      }
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  }

  const ranked = useMemo(() => rankGroves(location, groves ?? []), [location, groves]);
  const allGroves = (groves ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    groveCode: g.groveCode,
    distanceMeters: null as number | null,
  }));

  const selectedGrove =
    ranked.find((g) => g.id === value) ?? allGroves.find((g) => g.id === value) ?? null;

  return (
    <div className={className}>
      {!location && !locError && (
        <Button
          type="button"
          onClick={locate}
          disabled={locating || isLoading}
          className="w-full h-14 text-base"
          data-testid="button-locate-grove"
        >
          {locating ? (
            <>
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              جارٍ تحديد الموقع…
            </>
          ) : (
            <>
              <Crosshair className="ml-2 h-5 w-5" />
              ابحث عن بستاني
            </>
          )}
        </Button>
      )}

      {locError && (
        <div
          className="mb-3 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm"
          data-testid="loc-error"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              تعذّر استخدام GPS
            </div>
            <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              {locError} — اختر بستاناً يدوياً أدناه.
            </div>
          </div>
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
            data-testid="button-relocate-grove"
          >
            {locating ? "…" : "تحديث"}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ تحميل البساتين…
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          تعذّر تحميل قائمة البساتين. حاول مرة أخرى.
        </div>
      )}

      {ranked.length > 0 && (
        <ul className="space-y-2 mb-3" data-testid="ranked-grove-list">
          {ranked.slice(0, 3).map((g, i) => (
            <GroveOption
              key={g.id}
              grove={g}
              index={i}
              selected={value === g.id}
              onPick={() => onChange(g.id, g)}
            />
          ))}
        </ul>
      )}

      {(locError || allGroves.length > 0) && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-all-groves"
          >
            <span>
              {showAll ? "إخفاء" : "عرض"} كل البساتين ({allGroves.length})
            </span>
            <ChevronsUpDown className="h-3 w-3" />
          </button>
          {showAll && (
            <ul className="space-y-2 mt-3" data-testid="all-grove-list">
              {allGroves.map((g) => (
                <GroveOption
                  key={g.id}
                  grove={g}
                  selected={value === g.id}
                  onPick={() => onChange(g.id, g)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {value != null && selectedGrove == null && (
        <div className="text-xs text-muted-foreground mt-2">
          البستان المختار #{value}
        </div>
      )}
    </div>
  );
}

function rankGroves(
  loc: DeviceLocation | null,
  groves: ReadonlyArray<{
    id: number;
    name: string;
    groveCode: string;
    centroidLat?: number | null;
    centroidLon?: number | null;
  }>,
): PickedGrove[] {
  if (!loc) return [];
  return groves
    .filter(
      (g): g is typeof g & { centroidLat: number; centroidLon: number } =>
        g.centroidLat != null && g.centroidLon != null,
    )
    .map((g) => ({
      id: g.id,
      name: g.name,
      groveCode: g.groveCode,
      distanceMeters: haversineMeters(
        { lat: loc.lat, lon: loc.lon },
        { lat: g.centroidLat, lon: g.centroidLon },
      ),
    }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
}

function GroveOption({
  grove,
  index,
  selected,
  onPick,
}: {
  grove: PickedGrove;
  index?: number;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        data-testid={`grove-option-${grove.id}`}
        className="block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card
          className={cn(
            "transition-colors",
            selected ? "border-primary bg-primary/5" : "hover:border-primary/40",
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
              {selected ? <Check className="h-4 w-4" /> : index != null ? index + 1 : "·"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground truncate">{grove.name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {grove.groveCode}
              </div>
            </div>
            {grove.distanceMeters != null && (
              <div className="text-right shrink-0">
                <div className="text-sm font-mono text-foreground">
                  {formatDistance(grove.distanceMeters)}
                </div>
                <div className="text-[10px] tracking-wider text-muted-foreground">
                  المسافة
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </button>
    </li>
  );
}
