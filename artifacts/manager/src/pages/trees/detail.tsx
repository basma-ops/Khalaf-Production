import { useRoute, Link } from "wouter";
import {
  useGetTree,
  useGetTreeTimeline,
  useGetTreePhotoTimeline,
  useListTasks,
  useListTreeGeometryRecords,
  useListBottlingRunsForTree,
  useListSensorStreams,
  type PhotoLibraryItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Camera, Eye, MapPin, ClipboardList, TrendingUp, Ruler, Wine, Radio } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AnalysisCard } from "@/components/analysis-card";
import { ManagerFlagButton } from "@/components/manager-flag-dialog";
import { TreeQrCard } from "@/components/tree-qr-card";
import { useMemo } from "react";

function Stat({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid?: string }) {
  return (
    <div className="border rounded-md p-3" data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export default function TreeDetail() {
  const [, params] = useRoute("/trees/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { data: tree, isLoading } = useGetTree(id);
  const { data: timeline } = useGetTreeTimeline(id);
  const { data: photos } = useGetTreePhotoTimeline(id);
  const { data: tasks } = useListTasks({ treeId: id });
  const { data: geometry } = useListTreeGeometryRecords({ treeId: id, limit: 100 });
  const { data: bottlingRuns } = useListBottlingRunsForTree(id);
  const { data: sensorStreams } = useListSensorStreams({
    attachedEntityType: "tree",
    attachedEntityId: id,
  });
  const tasksFromAnalysis = useMemo(
    () =>
      (tasks ?? []).filter((t) =>
        /photo analysis result|analysis result #/i.test(
          `${(t as { description?: string }).description ?? ""} ${(t as { title?: string }).title ?? ""}`,
        ),
      ),
    [tasks],
  );
  // Manager-confirmed analyses only. Visual signals require human
  // confirmation before they roll up to a tree-level health timeline —
  // the auto-analysis is intentionally cautious and a single unreviewed
  // result must never drive a "trend".
  const confirmedAnalyzedPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.latestAnalysis?.reviewStatus === "confirmed"),
    [photos],
  );
  // Show the timeline only once we have at least three confirmed
  // analyses — fewer than that is not enough to interpret responsibly.
  const VISUAL_HEALTH_MIN_CONFIRMED = 3;
  const visualHealthSeries = useMemo(() => {
    return confirmedAnalyzedPhotos
      .map((p) => {
        const a = p.latestAnalysis!;
        return {
          id: p.id,
          date: new Date(p.uploadedAt).toLocaleDateString(),
          purpose: p.purpose,
          // Greenness 0..1 → drives the bar.
          greenness: typeof a.canopyGreennessScore === "number" ? a.canopyGreennessScore : null,
          yellowing: a.yellowingSignal ?? null,
          density: a.canopyDensity ?? null,
          summary: a.summary ?? "",
        };
      })
      .reverse();
  }, [confirmedAnalyzedPhotos]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-96" /></div>;
  if (!tree) return <div className="p-8"><h1 className="text-2xl font-bold">Tree not found</h1></div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/trees" className="text-sm text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to trees
          </Link>
          <h1 className="text-3xl font-serif font-bold mt-1 font-mono">{tree.treeCode}</h1>
          <p className="text-muted-foreground">
            {(tree as { variety?: string }).variety ?? "Souri"} ·{" "}
            {(tree as { groveName?: string }).groveName ?? `Grove #${(tree as { groveId?: number }).groveId ?? "?"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Health: {Math.round(((tree as { currentHealthIndex?: number }).currentHealthIndex ?? 0) * 100)}%</Badge>
          {(() => {
            const vs = (tree as { verificationStatus?: string | null }).verificationStatus ?? null;
            if (!vs) return null;
            const palette: Record<string, string> = {
              field_verified: "bg-emerald-600 text-emerald-50",
              satellite_detected: "bg-slate-200 text-slate-800",
              needs_field_check: "bg-amber-500 text-amber-50",
              rejected: "bg-rose-600 text-rose-50",
            };
            const label: Record<string, string> = {
              field_verified: "Field verified",
              satellite_detected: "Satellite only",
              needs_field_check: "Needs field check",
              rejected: "Rejected",
            };
            return (
              <Badge data-testid="badge-verification-status" className={palette[vs] ?? "bg-slate-200 text-slate-800"}>
                {label[vs] ?? vs}
              </Badge>
            );
          })()}
          {((tree as unknown) as { plantedYear?: number }).plantedYear && (
            <Badge variant="outline">Planted {((tree as unknown) as { plantedYear?: number }).plantedYear}</Badge>
          )}
          <ManagerFlagButton entityType="tree" entityId={id} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="photos" data-testid="tab-photos">
            <Camera className="h-4 w-4 mr-1" /> Photos &amp; Visual Analysis ({photos?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <TrendingUp className="h-4 w-4 mr-1" /> Visual Health ({confirmedAnalyzedPhotos.length})
          </TabsTrigger>
          <TabsTrigger value="growth" data-testid="tab-growth">
            <Ruler className="h-4 w-4 mr-1" /> Growth ({geometry?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="bottles" data-testid="tab-bottles">
            <Wine className="h-4 w-4 mr-1" /> Bottles ({bottlingRuns?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks">
            <ClipboardList className="h-4 w-4 mr-1" /> Tasks from Analysis ({tasksFromAnalysis.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4 space-y-4">
          <TreeQrCard
            treeId={id}
            treeCode={tree.treeCode}
            groveName={(tree as { groveName?: string | null }).groveName ?? null}
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4" /> Sensors attached to this tree
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!sensorStreams || sensorStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-tree-sensors">
                  No sensor streams attached. Register one from the{" "}
                  <Link href="/sensors" className="text-primary underline">Sensors page</Link>.
                </p>
              ) : (
                <div className="space-y-2">
                  {sensorStreams.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-3 border rounded p-2 text-sm"
                      data-testid={`tree-sensor-${s.id}`}
                    >
                      <Link href={`/sensors/${s.id}`} className="font-mono text-primary underline">
                        {s.name ?? `Stream #${s.id}`}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">{s.kind}</Badge>
                      <span className="text-xs text-muted-foreground">every {s.sampleIntervalSeconds}s</span>
                      <span className="ml-auto font-mono text-sm">
                        {s.lastValueNumeric != null ? `${s.lastValueNumeric} ${s.unit}` : "—"}
                      </span>
                      {s.status !== "active" ? <Badge variant="secondary">{s.status}</Badge> :
                        s.isStale ? <Badge className="bg-amber-500 text-amber-50">stale</Badge> :
                        <Badge className="bg-emerald-600 text-emerald-50">live</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Tree summary</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Code</div>
                <div className="font-mono font-semibold">{tree.treeCode}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Variety</div>
                <div>{(tree as { variety?: string }).variety ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Latest photo</div>
                <div>{photos && photos.length > 0 ? new Date(photos[0].uploadedAt).toLocaleDateString() : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Photos on file</div>
                <div>{photos?.length ?? 0}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="pt-4 space-y-4">
          {(!photos || photos.length === 0) && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No photos yet for this tree. Field workers can capture photos from the Field App.
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(photos ?? []).map((p: PhotoLibraryItem) => (
              <Card key={p.id} data-testid={`card-tree-photo-${p.id}`}>
                <CardContent className="p-3 space-y-3">
                  <div className="flex gap-3">
                    <a href={p.fileUrl} target="_blank" rel="noreferrer">
                      <img
                        src={p.thumbnailUrl ?? p.fileUrl}
                        alt={p.originalFileName ?? ""}
                        className="h-32 w-32 rounded object-cover bg-muted"
                      />
                    </a>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{p.purpose.replace(/_/g, " ")}</Badge>
                        {p.gpsLat != null && p.gpsLon != null && (
                          <Badge variant="outline" className="text-[10px]"><MapPin className="h-3 w-3 mr-1" /> GPS</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(p.uploadedAt).toLocaleString()}
                        {p.uploadedByName && <> · by {p.uploadedByName}</>}
                      </div>
                      {p.latestAnalysis?.summary && (
                        <p className="text-xs italic text-foreground/90 line-clamp-3">"{p.latestAnalysis.summary}"</p>
                      )}
                    </div>
                  </div>
                  {p.latestAnalysis && (
                    <AnalysisCard result={p.latestAnalysis} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="health" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Visual health timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {confirmedAnalyzedPhotos.length < VISUAL_HEALTH_MIN_CONFIRMED ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-health-gated"
                >
                  Visual health needs at least {VISUAL_HEALTH_MIN_CONFIRMED}{" "}
                  manager-confirmed analyses before it plots a trend. So far:{" "}
                  {confirmedAnalyzedPhotos.length}/{VISUAL_HEALTH_MIN_CONFIRMED}{" "}
                  confirmed. Review photos in the queue to confirm them.
                </p>
              ) : (
                <div className="space-y-2">
                  {visualHealthSeries.map((s) => {
                    const yellowingClass =
                      s.yellowing === "moderate"
                        ? "bg-amber-500"
                        : s.yellowing === "strong"
                          ? "bg-amber-700"
                          : s.yellowing === "mild"
                            ? "bg-amber-300"
                            : "bg-emerald-500";
                    const densityLabel = s.density
                      ? s.density.replace(/_/g, " ")
                      : "—";
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 text-sm"
                        data-testid={`health-row-${s.id}`}
                      >
                        <span className="w-24 text-xs text-muted-foreground">
                          {s.date}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {s.purpose.replace(/_/g, " ")}
                        </Badge>
                        <div
                          className="flex-1 h-2 bg-muted rounded overflow-hidden"
                          title={`Canopy greenness ${
                            s.greenness != null
                              ? Math.round(s.greenness * 100) + "%"
                              : "—"
                          }`}
                        >
                          <div
                            className="h-full bg-emerald-600"
                            style={{
                              width: `${
                                s.greenness != null
                                  ? Math.round(s.greenness * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="w-14 text-right font-mono text-xs">
                          {s.greenness != null
                            ? `${Math.round(s.greenness * 100)}%`
                            : "—"}
                        </span>
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${yellowingClass}`}
                          title={`Yellowing: ${s.yellowing ?? "none"}`}
                        />
                        <span
                          className="w-24 text-[10px] text-muted-foreground capitalize text-right"
                          title="Canopy density"
                        >
                          {densityLabel}
                        </span>
                      </div>
                    );
                  })}
                  <div className="pt-2 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" /> canopy greenness
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> yellowing signal
                    </span>
                    <span>· canopy density label on the right</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="growth" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="h-4 w-4" /> Geometry measurements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!geometry || geometry.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No measurements recorded yet. Field workers can log them via the "Measure" action in the Field App.
                </p>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    // Latest record is first (list is desc by observedAt).
                    const latest = geometry[0];
                    const canopy = latest?.canopyDiameterM ?? null;
                    const height = latest?.treeHeightM ?? null;
                    // Cylinder approximation: V ≈ π × (D/2)² × H (m³).
                    const vol = canopy != null && height != null
                      ? Math.PI * Math.pow(canopy / 2, 2) * height
                      : null;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat label="Latest canopy Ø" value={canopy != null ? `${canopy.toFixed(2)} m` : "—"} />
                        <Stat label="Latest height" value={height != null ? `${height.toFixed(2)} m` : "—"} />
                        <Stat label="Latest trunk Ø" value={latest?.trunkDiameterMm != null ? `${latest.trunkDiameterMm.toFixed(1)} mm` : "—"} />
                        <Stat label="Crown volume (est.)" value={vol != null ? `${vol.toFixed(1)} m³` : "—"} hint="cylinder ≈ π·(D/2)²·H" testid="stat-crown-volume" />
                      </div>
                    );
                  })()}
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <LineChart data={[...geometry].reverse().map((g) => ({
                        date: g.observedAt,
                        trunkMm: g.trunkDiameterMm,
                        canopyM: g.canopyDiameterM,
                        heightM: g.treeHeightM,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), "MMM d, yy")} fontSize={11} />
                        <YAxis yAxisId="mm" orientation="left" fontSize={11} label={{ value: "Trunk (mm)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                        <YAxis yAxisId="m" orientation="right" fontSize={11} label={{ value: "Canopy / Height (m)", angle: 90, position: "insideRight", fontSize: 10 }} />
                        <Tooltip labelFormatter={(d) => format(new Date(String(d)), "MMM d, yyyy")} />
                        <Legend />
                        <Line yAxisId="mm" type="monotone" dataKey="trunkMm" name="Trunk Ø (mm)" stroke="#b45309" strokeWidth={2} />
                        <Line yAxisId="m" type="monotone" dataKey="canopyM" name="Canopy Ø (m)" stroke="#2563eb" strokeWidth={2} />
                        <Line yAxisId="m" type="monotone" dataKey="heightM" name="Height (m)" stroke="#16a34a" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-6 gap-2 text-xs uppercase tracking-wider text-muted-foreground border-b pb-2">
                    <div>Date</div>
                    <div className="text-right">Trunk Ø (mm)</div>
                    <div className="text-right">Canopy Ø (m)</div>
                    <div className="text-right">Height (m)</div>
                    <div className="text-right">Crown (m²)</div>
                    <div>Notes</div>
                  </div>
                  {geometry.map((g) => (
                    <div key={g.id} className="grid grid-cols-6 gap-2 text-sm py-1.5 border-b last:border-0" data-testid={`growth-row-${g.id}`}>
                      <div className="text-xs text-muted-foreground">{format(new Date(g.observedAt), "MMM d, yyyy")}</div>
                      <div className="text-right font-mono">{g.trunkDiameterMm != null ? g.trunkDiameterMm.toFixed(1) : "—"}</div>
                      <div className="text-right font-mono">{g.canopyDiameterM != null ? g.canopyDiameterM.toFixed(2) : "—"}</div>
                      <div className="text-right font-mono">{g.treeHeightM != null ? g.treeHeightM.toFixed(2) : "—"}</div>
                      <div className="text-right font-mono">{g.observedCrownAreaM2 != null ? g.observedCrownAreaM2.toFixed(2) : "—"}</div>
                      <div className="text-xs text-muted-foreground truncate" title={g.notes ?? ""}>{g.notes ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bottles" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wine className="h-4 w-4" /> Bottling runs containing this tree's oil
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!bottlingRuns || bottlingRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bottling runs traceable to this tree yet.</p>
              ) : (
                <div className="space-y-2">
                  {bottlingRuns.map((b) => (
                    <div key={b.bottlingRunId} className="border rounded p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`bottle-row-${b.bottlingRunId}`}>
                      <div className="flex-1 min-w-[200px]">
                        <Link href={`/bottling/${b.bottlingRunId}`} className="font-mono text-primary underline">{b.runCode}</Link>
                        <div className="text-xs text-muted-foreground">
                          Bottled {b.bottledAt}{b.label ? ` · ${b.label}` : ""}{b.lotCode ? ` · lot ${b.lotCode}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Tree share</div>
                        <div className="font-mono font-bold">{b.sharePct.toFixed(2)}%</div>
                      </div>
                      {b.estimatedBottlesShare != null && (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Est. bottles ({b.bottleSizeMl ?? "?"} mL)</div>
                          <div className="font-mono font-bold">{b.estimatedBottlesShare.toFixed(2)} / {b.bottlesProduced ?? "?"}</div>
                        </div>
                      )}
                      <Link href={`/reports/lot-trace/${b.bottlingRunId}`} className="text-xs text-primary underline">Lot trace →</Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Tasks created from photo analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasksFromAnalysis.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tasks have been created from a photo analysis result for this tree yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {tasksFromAnalysis.map((t) => {
                    const tt = t as {
                      id: number;
                      title?: string;
                      description?: string;
                      priority?: string;
                      status?: string;
                      taskType?: string;
                    };
                    return (
                      <div
                        key={tt.id}
                        className="rounded border p-3 text-sm"
                        data-testid={`task-from-analysis-${tt.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{tt.title ?? `Task #${tt.id}`}</div>
                          <div className="flex gap-1">
                            {tt.priority && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {tt.priority}
                              </Badge>
                            )}
                            {tt.status && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {tt.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {tt.description && (
                          <p className="text-xs text-muted-foreground mt-1">{tt.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <Card>
            <CardHeader><CardTitle><Eye className="inline h-4 w-4 mr-1" /> Visit & event timeline</CardTitle></CardHeader>
            <CardContent>
              {!timeline || (timeline as { events?: unknown[] }).events?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
              ) : (
                <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded">{JSON.stringify(timeline, null, 2).slice(0, 2000)}</pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
