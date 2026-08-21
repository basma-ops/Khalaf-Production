import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MapPin, Plus } from "lucide-react";
import {
  useCreateTree,
  useListGroves,
  type CreateTreeRequest,
} from "@workspace/api-client-react";
import { MobileShell } from "@/components/layout";
import { getCurrentLocation, type DeviceLocation } from "@/lib/geo";

const TREE_TYPES = ["olive", "fig", "carob", "other", "unknown"] as const;
const VARIETIES = ["Souri", "other", "unknown"] as const;
const ANCIENT = ["none", "candidate", "verified", "unknown"] as const;

export function NewTreePage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const grovesQ = useListGroves();
  const create = useCreateTree();

  const [loc, setLoc] = useState<DeviceLocation | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);

  const [groveId, setGroveId] = useState<number | "">("");
  const [treeCode, setTreeCode] = useState("");
  const [treeType, setTreeType] = useState<(typeof TREE_TYPES)[number]>("olive");
  const [variety, setVariety] = useState<(typeof VARIETIES)[number]>("Souri");
  const [ancientStatus, setAncientStatus] = useState<(typeof ANCIENT)[number]>("none");
  const [estimatedAgeClass, setEstimatedAgeClass] = useState("");
  const [fieldTag, setFieldTag] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Take a single GPS reading on mount; user can re-fetch if they walk to a new spot.
  useEffect(() => {
    let cancelled = false;
    async function fix() {
      setLocating(true);
      setLocError(null);
      try {
        const l = await getCurrentLocation();
        if (cancelled) return;
        setLoc(l);
      } catch (e) {
        if (cancelled) return;
        setLocError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLocating(false);
      }
    }
    void fix();
    return () => {
      cancelled = true;
    };
  }, []);

  // Default the grove to the first one as soon as it loads.
  useEffect(() => {
    if (groveId === "" && grovesQ.data && grovesQ.data.length > 0) {
      setGroveId(grovesQ.data[0]!.id);
    }
  }, [grovesQ.data, groveId]);

  // Suggest a tree code based on time so the worker isn't forced to invent one.
  useEffect(() => {
    if (treeCode) return;
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 12);
    setTreeCode(`FLD-${stamp}`);
  }, [treeCode]);

  async function refreshLocation() {
    setLocating(true);
    setLocError(null);
    try {
      const l = await getCurrentLocation();
      setLoc(l);
    } catch (e) {
      setLocError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!loc) {
      setError("Cannot create a tree without a GPS fix.");
      return;
    }
    if (groveId === "" || !Number.isFinite(groveId)) {
      setError("Please choose a grove.");
      return;
    }
    const body: CreateTreeRequest = {
      treeCode: treeCode.trim(),
      groveId: Number(groveId),
      treeType,
      variety,
      ancientStatus,
      estimatedAgeClass: estimatedAgeClass.trim() || null,
      centroidLat: loc.lat,
      centroidLon: loc.lon,
      pointGeojson: {
        type: "Point",
        coordinates: [loc.lon, loc.lat],
      },
      crownGeojson: null,
      crownAreaM2: null,
      crownDiameterM: null,
      fieldTag: fieldTag.trim() || null,
      notes: notes.trim() || null,
      verificationStatus: "field_verified",
    };
    try {
      const created = await create.mutateAsync({ data: body });
      await qc.invalidateQueries({ queryKey: ["/api/trees"] });
      navigate(`/tree/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <MobileShell title="New tree mapping" back="/">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="tv-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Location</span>
          </div>
          {locError && (
            <p className="text-sm text-destructive flex items-start gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              {locError}
            </p>
          )}
          {loc ? (
            <>
              <div className="font-mono text-sm">
                {loc.lat.toFixed(6)}, {loc.lon.toFixed(6)}
              </div>
              <div className="text-xs text-muted-foreground">
                ±{Math.round(loc.accuracy)} m
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {locating ? "Locating you…" : "No fix yet."}
            </p>
          )}
          <button
            type="button"
            onClick={refreshLocation}
            disabled={locating}
            className="tv-btn-secondary w-full mt-3"
          >
            {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : "Re-take GPS reading"}
          </button>
        </div>

        <div className="tv-card p-3 space-y-3">
          <Field label="Tree code (unique)">
            <input
              className="tv-input"
              required
              value={treeCode}
              onChange={(e) => setTreeCode(e.target.value)}
            />
          </Field>
          <Field label="Grove">
            <select
              className="tv-input"
              required
              value={groveId === "" ? "" : String(groveId)}
              onChange={(e) =>
                setGroveId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">— select —</option>
              {(grovesQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.groveCode})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                className="tv-input"
                value={treeType}
                onChange={(e) => setTreeType(e.target.value as typeof treeType)}
              >
                {TREE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Variety">
              <select
                className="tv-input"
                value={variety}
                onChange={(e) => setVariety(e.target.value as typeof variety)}
              >
                {VARIETIES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Ancient status">
              <select
                className="tv-input"
                value={ancientStatus}
                onChange={(e) =>
                  setAncientStatus(e.target.value as typeof ancientStatus)
                }
              >
                {ANCIENT.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Estimated age class">
              <input
                className="tv-input"
                placeholder="e.g. >300y"
                value={estimatedAgeClass}
                onChange={(e) => setEstimatedAgeClass(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Field tag">
            <input
              className="tv-input"
              placeholder="Optional physical label"
              value={fieldTag}
              onChange={(e) => setFieldTag(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <textarea
              className="tv-input min-h-[70px]"
              placeholder="Anything notable about this tree?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={create.isPending || !loc}
          className="tv-btn-primary w-full"
        >
          {create.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Plus className="h-5 w-5 mr-2" /> Create tree at this GPS
            </>
          )}
        </button>
        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
        <p className="text-center text-xs text-muted-foreground pb-4">
          You can attach photos right after the tree is created.
        </p>
      </form>
    </MobileShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="tv-label">{label}</span>
      {children}
    </label>
  );
}
