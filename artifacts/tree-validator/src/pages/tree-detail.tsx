import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  Save,
  XCircle,
  HelpCircle,
} from "lucide-react";
// Web-Mercator (EPSG:3857) bounds of /api/static/imagery/display.png (7884×5301).
// Mirrors lib/db/src/imagery-bounds.json — kept inline so this artifact has
// no source dependency on @workspace/db (matches grove-map.tsx convention).
const IMAGERY = {
  west: 3936889.7347657396,
  south: 3883482.4080727594,
  east: 3941648.844538485,
  north: 3886682.115734134,
  width: 7884,
  height: 5301,
};
const R = 6378137;
function projLon(lon: number): number {
  return (lon * Math.PI) / 180 * R;
}
function projLat(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
}
import {
  useGetTree,
  useUpdateTree,
  useGetTreePhotoTimeline,
  type UpdateTreeRequest,
} from "@workspace/api-client-react";
import { MobileShell } from "@/components/layout";
import { PhotoUploader } from "@/components/photo-uploader";
import { deleteTree } from "@/lib/api";
import { formatDistance, getCurrentLocation, haversineMeters } from "@/lib/geo";

const TREE_TYPES = ["olive", "fig", "carob", "other", "unknown"] as const;
const VARIETIES = ["Souri", "other", "unknown"] as const;
const ANCIENT = ["none", "candidate", "verified", "unknown"] as const;
const VERIFICATION = [
  "satellite_detected",
  "field_verified",
  "needs_field_check",
  "rejected",
  "uncertain",
] as const;

export function TreeDetailPage() {
  const [, params] = useRoute<{ id: string }>("/tree/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const treeQ = useGetTree(id);
  const photosQ = useGetTreePhotoTimeline(id);
  const update = useUpdateTree();

  const [form, setForm] = useState<UpdateTreeRequest>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);

  // Initialise the form when the tree loads.
  useEffect(() => {
    if (!treeQ.data) return;
    const t = treeQ.data;
    setForm({
      treeType: String(t.treeType),
      variety: String(t.variety),
      ancientStatus: String(t.ancientStatus),
      verificationStatus: String(t.verificationStatus),
      currentAlertStatus: String(t.currentAlertStatus),
      estimatedAgeClass: t.estimatedAgeClass ?? null,
      fieldTag: t.fieldTag ?? null,
      notes: t.notes ?? null,
    });
  }, [treeQ.data]);

  // Live distance to this tree from the worker's current GPS.
  useEffect(() => {
    if (!treeQ.data?.centroidLat || !treeQ.data?.centroidLon) return;
    let cancelled = false;
    void getCurrentLocation()
      .then((loc) => {
        if (cancelled) return;
        const d = haversineMeters(
          { lat: loc.lat, lon: loc.lon },
          { lat: treeQ.data!.centroidLat!, lon: treeQ.data!.centroidLon! },
        );
        setDistance(d);
      })
      .catch(() => {
        /* ignore — distance is informational only */
      });
    return () => {
      cancelled = true;
    };
  }, [treeQ.data]);

  const photos = useMemo(
    () =>
      (photosQ.data ?? []).filter((p) =>
        Boolean(p.thumbnailUrl ?? p.fileUrl),
      ),
    [photosQ.data],
  );

  if (!Number.isFinite(id)) {
    return (
      <MobileShell title="Invalid tree" back="/">
        <div className="tv-card p-4 text-sm text-destructive">Bad tree id.</div>
      </MobileShell>
    );
  }
  if (treeQ.isLoading) {
    return (
      <MobileShell title="Loading…" back="/">
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </MobileShell>
    );
  }
  if (treeQ.isError || !treeQ.data) {
    return (
      <MobileShell title="Tree" back="/">
        <div className="tv-card p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          Could not load this tree.
        </div>
      </MobileShell>
    );
  }
  const t = treeQ.data;

  async function onSave() {
    setError(null);
    try {
      await update.mutateAsync({ id, data: form });
      setSavedAt(Date.now());
      await qc.invalidateQueries({ queryKey: [`/api/trees/${id}`] });
      await qc.invalidateQueries({ queryKey: ["/api/trees"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteTree(id);
      await qc.invalidateQueries({ queryKey: ["/api/trees"] });
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  async function quickVerify() {
    await setVerificationStatus("field_verified");
  }

  async function setVerificationStatus(
    status: "field_verified" | "rejected" | "needs_field_check",
  ) {
    setError(null);
    setForm((f) => ({ ...f, verificationStatus: status }));
    try {
      await update.mutateAsync({
        id,
        data: { ...form, verificationStatus: status },
      });
      setSavedAt(Date.now());
      await qc.invalidateQueries({ queryKey: [`/api/trees/${id}`] });
      await qc.invalidateQueries({ queryKey: ["/api/trees"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <MobileShell title={t.treeCode} back="/">
      {/* Identity card */}
      <div className="tv-card mb-3 p-3">
        <div className="flex items-baseline justify-between">
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--app-font-serif)" }}
          >
            {t.treeCode}
          </h2>
          {distance != null && (
            <span className="font-mono text-sm">
              {formatDistance(distance)}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t.groveName ?? "—"}
        </div>
        {t.centroidLat != null && t.centroidLon != null && (
          <div className="mt-2 font-mono text-xs text-muted-foreground">
            {t.centroidLat.toFixed(6)}, {t.centroidLon.toFixed(6)}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => void setVerificationStatus("field_verified")}
            disabled={update.isPending}
            className="tv-btn-primary"
            data-testid="button-confirm-tree"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Confirm
          </button>
          <button
            onClick={() => void setVerificationStatus("needs_field_check")}
            disabled={update.isPending}
            className="tv-btn-secondary"
            data-testid="button-needs-revisit-tree"
          >
            <HelpCircle className="h-4 w-4 mr-1" />
            Revisit
          </button>
          <button
            onClick={() => void setVerificationStatus("rejected")}
            disabled={update.isPending}
            className="tv-btn-danger"
            data-testid="button-reject-tree"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Current: <span className="font-mono">{t.verificationStatus}</span>
        </p>
      </div>

      {/* Satellite vs ground side-by-side */}
      <SatelliteVsGroundCard
        lat={t.centroidLat ?? null}
        lon={t.centroidLon ?? null}
        treeCode={t.treeCode}
        groundUrl={photos[0]?.thumbnailUrl ?? photos[0]?.fileUrl ?? null}
      />

      {/* Edit form */}
      <div className="tv-card mb-3 p-3 space-y-3">
        <h3 className="text-sm font-semibold">Tree details</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              className="tv-input"
              value={form.treeType ?? "unknown"}
              onChange={(e) => setForm({ ...form, treeType: e.target.value })}
            >
              {TREE_TYPES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Variety">
            <select
              className="tv-input"
              value={form.variety ?? "unknown"}
              onChange={(e) => setForm({ ...form, variety: e.target.value })}
            >
              {VARIETIES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Ancient status">
            <select
              className="tv-input"
              value={form.ancientStatus ?? "unknown"}
              onChange={(e) => setForm({ ...form, ancientStatus: e.target.value })}
            >
              {ANCIENT.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Verification">
            <select
              className="tv-input"
              value={form.verificationStatus ?? "uncertain"}
              onChange={(e) => setForm({ ...form, verificationStatus: e.target.value })}
            >
              {VERIFICATION.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Estimated age class">
          <input
            className="tv-input"
            placeholder="e.g. >300y, 100-300y, <100y"
            value={form.estimatedAgeClass ?? ""}
            onChange={(e) =>
              setForm({ ...form, estimatedAgeClass: e.target.value || null })
            }
          />
        </Field>
        <Field label="Field tag (physical label)">
          <input
            className="tv-input"
            placeholder="e.g. metal tag #A-12"
            value={form.fieldTag ?? ""}
            onChange={(e) =>
              setForm({ ...form, fieldTag: e.target.value || null })
            }
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="tv-input min-h-[80px]"
            placeholder="What did you observe in person?"
            value={form.notes ?? ""}
            onChange={(e) =>
              setForm({ ...form, notes: e.target.value || null })
            }
          />
        </Field>
        <button
          type="button"
          onClick={onSave}
          disabled={update.isPending}
          className="tv-btn-primary w-full"
        >
          {update.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Save className="h-5 w-5 mr-2" /> Save changes
            </>
          )}
        </button>
        {savedAt && (
          <p className="text-center text-xs text-emerald-700">Saved.</p>
        )}
      </div>

      {/* Photos */}
      <div className="tv-card mb-3 p-3 space-y-3">
        <h3 className="text-sm font-semibold">Photos ({photos.length})</h3>
        <PhotoUploader
          treeId={id}
          groveId={t.groveId ?? null}
          onUploaded={() => photosQ.refetch()}
        />
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.slice(0, 9).map((p) => (
              <a
                key={p.id}
                href={p.fileUrl ?? p.thumbnailUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded bg-muted"
              >
                <img
                  src={p.thumbnailUrl ?? p.fileUrl ?? ""}
                  alt={p.originalFileName ?? ""}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="tv-card p-3 space-y-3 border-destructive/20">
        <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
        <p className="text-xs text-muted-foreground">
          Removing a tree mapping is permanent. Only do this if the tree
          does not actually exist on the ground (e.g. a satellite false
          positive). Existing photos stay in the library but become unlinked.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="tv-btn-danger w-full"
          >
            <Trash2 className="h-5 w-5 mr-2" /> Delete tree mapping
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">
              Permanently delete {t.treeCode}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="tv-btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="tv-btn-danger"
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-center text-sm text-destructive">{error}</p>
      )}
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

function SatelliteVsGroundCard({
  lat,
  lon,
  treeCode,
  groundUrl,
}: {
  lat: number | null;
  lon: number | null;
  treeCode: string;
  groundUrl: string | null;
}) {
  // Compute crop position from tree centroid → image pixel coordinates.
  // Web-mercator projection of the centroid, then map into the image's
  // pixel grid using the imagery's WM bounds + IMAGERY.width/height.
  const tile = useMemo(() => {
    if (lat == null || lon == null) return null;
    const x = projLon(lon);
    const y = projLat(lat);
    if (x < IMAGERY.west || x > IMAGERY.east || y < IMAGERY.south || y > IMAGERY.north) {
      return null;
    }
    const px = ((x - IMAGERY.west) / (IMAGERY.east - IMAGERY.west)) * IMAGERY.width;
    const py = ((IMAGERY.north - y) / (IMAGERY.north - IMAGERY.south)) * IMAGERY.height;
    return { px, py };
  }, [lat, lon]);

  const TILE = 220; // displayed square px
  const SCALE = 3.0; // upscale orthomosaic for legibility
  const bgW = IMAGERY.width * SCALE;
  const bgH = IMAGERY.height * SCALE;

  return (
    <div className="tv-card mb-3 p-3 space-y-2">
      <h3 className="text-sm font-semibold">Satellite vs. ground</h3>
      <p className="text-[11px] text-muted-foreground">
        Compare what the satellite saw against what's actually in front of you.
        If the canopy doesn't match, mark Reject or Revisit above.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Satellite (orthomosaic)
          </div>
          <div
            className="relative overflow-hidden rounded border bg-muted mx-auto"
            style={{ width: TILE, height: TILE }}
            data-testid="tile-satellite"
          >
            {tile ? (
              <>
                <div
                  aria-label={`Satellite tile centred on ${treeCode}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: 'url("/api/static/imagery/display.png")',
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${bgW}px ${bgH}px`,
                    backgroundPosition: `${TILE / 2 - tile.px * SCALE}px ${
                      TILE / 2 - tile.py * SCALE
                    }px`,
                  }}
                />
                {/* Crosshair on tree centroid */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="h-6 w-6 rounded-full border-2 border-amber-400 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]" />
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-[11px] italic text-muted-foreground">
                Tree centroid is outside the orthomosaic footprint.
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Ground (latest photo)
          </div>
          <div
            className="relative overflow-hidden rounded border bg-muted mx-auto"
            style={{ width: TILE, height: TILE }}
            data-testid="tile-ground"
          >
            {groundUrl ? (
              <img
                src={groundUrl}
                alt={`Latest field photo of ${treeCode}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-[11px] italic text-muted-foreground">
                No field photo yet — capture one below.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
