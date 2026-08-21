import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetBottlingRun,
  useUpdateBottlingRun,
  useDeleteBottlingRun,
  useSetBottlingRunSources,
  useRecomputeBottlingRunOrigins,
  useListOilBatches,
  useListLabResults,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Plus, X, Save, FileText, RotateCw, QrCode, Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SourceDraft = { oilBatchId: number; litersDrawn: number };

export default function BottlingDetailPage() {
  const [, params] = useRoute("/bottling/:id");
  const id = params?.id ? Number(params.id) : 0;
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetBottlingRun(id);
  const { data: oilBatches } = useListOilBatches();
  const { data: labResults } = useListLabResults();
  const updateRun = useUpdateBottlingRun();
  const deleteRun = useDeleteBottlingRun();
  const saveSources = useSetBottlingRunSources();
  const recompute = useRecomputeBottlingRunOrigins();

  const [runCode, setRunCode] = useState("");
  const [bottledAt, setBottledAt] = useState("");
  const [label, setLabel] = useState("");
  const [labelTemplate, setLabelTemplate] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState("");
  const [bottleSizeMl, setBottleSizeMl] = useState("");
  const [bottlesProduced, setBottlesProduced] = useState("");
  const [totalLitersBottled, setTotalLitersBottled] = useState("");
  const [singleTree, setSingleTree] = useState(false);
  const [singleGrove, setSingleGrove] = useState(false);
  const [status, setStatus] = useState("draft");
  const [qualityIds, setQualityIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<SourceDraft[]>([]);

  useEffect(() => {
    if (data) {
      setRunCode(data.runCode);
      setBottledAt(data.bottledAt);
      setLabel(data.label ?? "");
      setLabelTemplate(data.labelTemplate ?? "");
      setLotCode(data.lotCode ?? "");
      setLocation(data.location ?? "");
      setFormat(data.format ?? "");
      setBottleSizeMl(data.bottleSizeMl?.toString() ?? "");
      setBottlesProduced(data.bottlesProduced?.toString() ?? "");
      setTotalLitersBottled(data.totalLitersBottled?.toString() ?? "");
      setSingleTree(data.singleTree);
      setSingleGrove(data.singleGrove);
      setStatus(data.status);
      setQualityIds(data.qualityBasisLabResultIds ?? []);
      setDraft((data.sources ?? []).map((s) => ({ oilBatchId: s.oilBatchId, litersDrawn: s.litersDrawn })));
    }
  }, [data]);

  const oilBatchMap = useMemo(() => {
    const m = new Map<number, { code: string; remaining: number }>();
    for (const b of oilBatches ?? []) {
      m.set(b.id, { code: b.oilBatchCode, remaining: b.volumeRemainingLiters ?? b.volumeLiters ?? 0 });
    }
    return m;
  }, [oilBatches]);

  const draftTotal = draft.reduce((s, d) => s + (Number.isFinite(d.litersDrawn) ? d.litersDrawn : 0), 0);

  if (isLoading || !data) return <div className="p-8"><Skeleton className="h-96" /></div>;

  const onSaveDetails = async () => {
    try {
      await updateRun.mutateAsync({
        id,
        data: {
          runCode,
          bottledAt,
          label: label || null,
          labelTemplate: labelTemplate || null,
          lotCode: lotCode || null,
          location: location || null,
          format: format || null,
          bottleSizeMl: bottleSizeMl ? Number(bottleSizeMl) : null,
          bottlesProduced: bottlesProduced ? Number(bottlesProduced) : null,
          totalLitersBottled: totalLitersBottled ? Number(totalLitersBottled) : null,
          singleTree,
          singleGrove,
          status,
          qualityBasisLabResultIds: qualityIds.length > 0 ? qualityIds : null,
        },
      });
      toast({ title: "Run updated" });
      refetch();
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  const onSaveSources = async () => {
    try {
      await saveSources.mutateAsync({
        id,
        data: {
          sources: draft
            .filter((d) => d.oilBatchId > 0 && d.litersDrawn > 0)
            .map((d) => ({ oilBatchId: d.oilBatchId, litersDrawn: d.litersDrawn })),
        },
      });
      toast({ title: "Sources saved", description: "Bottle origins recomputed." });
      refetch();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        ?? (e as Error).message;
      toast({ title: "Allocation failed", description: String(msg), variant: "destructive" });
    }
  };

  const onRecompute = async () => {
    try {
      await recompute.mutateAsync({ id });
      toast({ title: "Origins recomputed" });
      refetch();
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this bottling run? Allocated oil volume will be returned to its source batches.")) return;
    try {
      await deleteRun.mutateAsync({ id });
      toast({ title: "Bottling run deleted" });
      window.history.back();
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  const toggleQualityId = (lid: number) => {
    setQualityIds((cur) => cur.includes(lid) ? cur.filter((x) => x !== lid) : [...cur, lid]);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/bottling" className="text-sm text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to bottling runs
          </Link>
          <h1 className="text-3xl font-serif font-bold mt-1 font-mono">{data.runCode}</h1>
          <p className="text-muted-foreground">
            Bottled {data.bottledAt}{data.label ? ` · ${data.label}` : ""}{data.lotCode ? ` · lot ${data.lotCode}` : ""}
            {" "}<Badge variant="outline" className="ml-2">{data.status}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/reports/lot-trace/${id}`}>
            <Button variant="outline"><FileText className="h-4 w-4 mr-1" /> Lot trace report</Button>
          </Link>
          <a href={`/api/bottling-runs/${id}/certificate.pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" data-testid="button-certificate-pdf">
              <Download className="h-4 w-4 mr-1" /> Certificate PDF
            </Button>
          </a>
          <Button variant="destructive" onClick={onDelete} data-testid="button-delete-run"><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4" /> Public bottle page
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            <img
              src={`/api/bottling-runs/${id}/qr.svg`}
              alt={`QR code for bottling run ${data.runCode}`}
              className="w-40 h-40 border rounded bg-white p-2"
              data-testid="img-bottling-qr"
            />
            <div className="flex-1 min-w-[260px] space-y-2">
              {data.publicToken ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Token: <span className="font-mono text-foreground">{data.publicToken}</span>
                  </p>
                  <p className="text-sm">
                    Public URL:{" "}
                    <a
                      className="text-primary underline font-mono break-all"
                      href={data.publicUrl ?? `/welcome/bottle/${data.publicToken}`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="link-public-bottle"
                    >
                      {data.publicUrl ?? `/welcome/bottle/${data.publicToken}`}
                    </a>
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = data.publicUrl
                          ?? `${window.location.protocol}//${window.location.host}/welcome/bottle/${data.publicToken}`;
                        void navigator.clipboard?.writeText(url);
                        toast({ title: "Public URL copied", description: url });
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy public URL
                    </Button>
                    <a href={`/api/bottling-runs/${id}/qr.svg`} download={`${data.runCode}-qr.svg`}>
                      <Button size="sm" variant="outline">
                        <Download className="h-3 w-3 mr-1" /> Download QR (SVG)
                      </Button>
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No public token assigned yet. Save the run to generate one.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Print the QR onto the bottle label or shipper. Scanning it opens a sanitized
                public dossier with grove breakdown, contributing trees and lab quality flags —
                no internal IDs or notes are exposed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Run details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label>Run code</Label><Input value={runCode} onChange={(e) => setRunCode(e.target.value)} /></div>
          <div><Label>Bottled date</Label><Input type="date" value={bottledAt} onChange={(e) => setBottledAt(e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="bottled">Bottled</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="recalled">Recalled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Lot code</Label><Input value={lotCode} onChange={(e) => setLotCode(e.target.value)} /></div>
          <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div><Label>Label template</Label><Input value={labelTemplate} onChange={(e) => setLabelTemplate(e.target.value)} placeholder="e.g. heritage-souri" /></div>
          <div>
            <Label>Format</Label>
            <Select value={format || "none"} onValueChange={(v) => setFormat(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="select-format"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="250ml">250 mL</SelectItem>
                <SelectItem value="500ml">500 mL</SelectItem>
                <SelectItem value="750ml">750 mL</SelectItem>
                <SelectItem value="1L">1 L</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Bottle size (mL)</Label><Input type="number" value={bottleSizeMl} onChange={(e) => setBottleSizeMl(e.target.value)} /></div>
          <div><Label>Bottles produced</Label><Input type="number" value={bottlesProduced} onChange={(e) => setBottlesProduced(e.target.value)} /></div>
          <div><Label>Total L bottled</Label><Input type="number" step="0.1" value={totalLitersBottled} onChange={(e) => setTotalLitersBottled(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Khalaf Mill bottling line A" /></div>
          <div className="flex items-center gap-4 md:col-span-3 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={singleTree} onCheckedChange={(v) => setSingleTree(v === true)} data-testid="check-single-tree" /> Single tree
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={singleGrove} onCheckedChange={(v) => setSingleGrove(v === true)} data-testid="check-single-grove" /> Single grove
            </label>
          </div>
          <div className="md:col-span-3">
            <Label>Quality basis lab results</Label>
            <div className="mt-1 flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded p-2">
              {(labResults ?? []).length === 0 && <span className="text-xs text-muted-foreground">No lab results available.</span>}
              {(labResults ?? []).map((l) => (
                <label key={l.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                  <Checkbox checked={qualityIds.includes(l.id)} onCheckedChange={() => toggleQualityId(l.id)} />
                  #{l.id} {l.sampleDate ?? ""} {l.labName ?? ""}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              When set, only these lab results appear on the lot trace report. Leave empty to use all lab results from the contributing oil batches.
            </p>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={onSaveDetails}><Save className="h-4 w-4 mr-1" /> Save details</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Oil sources</span>
            <span className="text-sm text-muted-foreground font-normal">Total allocated: <span className="font-mono">{draftTotal.toFixed(2)} L</span></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">Add one or more oil batches to draw from.</p>
          )}
          {draft.map((row, i) => {
            const meta = oilBatchMap.get(row.oilBatchId);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 border rounded p-2" data-testid={`source-row-${i}`}>
                <div className="flex-1 min-w-[220px]">
                  <Label className="text-xs">Oil batch</Label>
                  <Select
                    value={row.oilBatchId > 0 ? String(row.oilBatchId) : ""}
                    onValueChange={(v) => setDraft((d) => d.map((r, idx) => idx === i ? { ...r, oilBatchId: Number(v) } : r))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select oil batch" /></SelectTrigger>
                    <SelectContent>
                      {(oilBatches ?? []).map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.oilBatchCode} ({(b.volumeRemainingLiters ?? b.volumeLiters ?? 0).toFixed(1)} L remaining)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label className="text-xs">Liters drawn</Label>
                  <Input
                    type="number" step="0.01"
                    value={row.litersDrawn}
                    onChange={(e) => setDraft((d) => d.map((r, idx) => idx === i ? { ...r, litersDrawn: Number(e.target.value) } : r))}
                    data-testid={`input-liters-${i}`}
                  />
                </div>
                {meta && <div className="text-xs text-muted-foreground">{meta.code}</div>}
                <Button variant="ghost" size="sm" onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setDraft((d) => [...d, { oilBatchId: 0, litersDrawn: 0 }])}>
              <Plus className="h-4 w-4 mr-1" /> Add source
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onRecompute} data-testid="button-recompute-origins">
                <RotateCw className="h-4 w-4 mr-1" /> Recompute origins
              </Button>
              <Button onClick={onSaveSources} data-testid="button-save-sources">
                <Save className="h-4 w-4 mr-1" /> Save sources & recompute
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tree-level origins ({data.origins?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!data.origins || data.origins.length === 0) ? (
            <p className="p-4 text-sm text-muted-foreground">No origins computed yet. Save sources above to populate.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tree</TableHead>
                  <TableHead>Grove</TableHead>
                  <TableHead className="text-right">Contribution (kg)</TableHead>
                  <TableHead className="text-right">Share %</TableHead>
                  <TableHead className="text-right">Est. bottles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.origins].sort((a, b) => b.sharePct - a.sharePct).map((o) => {
                  const estBottles = data.bottlesProduced != null
                    ? (data.bottlesProduced * o.sharePct) / 100
                    : null;
                  return (
                    <TableRow key={o.id} data-testid={`origin-row-${o.id}`}>
                      <TableCell><Link href={`/trees/${o.treeId}`} className="font-mono text-primary underline">{o.treeCode ?? `#${o.treeId}`}</Link></TableCell>
                      <TableCell>{o.groveName ?? (o.groveId != null ? `#${o.groveId}` : "—")}</TableCell>
                      <TableCell className="text-right font-mono">{o.contributionKg.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{o.sharePct.toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-mono">{estBottles != null ? estBottles.toFixed(2) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
