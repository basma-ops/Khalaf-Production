import { useEffect, useRef, useState } from "react";
import {
  useListPhotoBatches,
  useCreatePhotoBatch,
  useGetPhotoBatch,
  type PhotoBatchRich,
  type PhotoAnalysisResultRich,
  getListPhotoBatchesQueryKey,
  getGetPhotoBatchQueryKey,
  getExportBatchResultsUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { uploadPhoto } from "@/lib/usePhotoUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisCard } from "@/components/analysis-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Beaker, Download, Upload } from "lucide-react";
import { Link } from "wouter";

const TEST_FILES = [
  "000067100011_1777738544547.JPG",
  "1_(312_of_466)_1777738544545.JPG",
  "1_(312_of_467_1777738544547.JPG",
  "1_(313_of_466)_1777738544547.JPG",
  "1_(318_of_466)_1777738544547.JPG",
  "dd916e88-ea8f-4007-b8f8-5a781118f3db_1777738544548.JPG",
  "IMG_1624_1777738544548.JPG",
  "IMG_1628_1777738544548.JPG",
  "IMG_1631_1777738544549.JPG",
  "IMG_1632_1777738544549.JPG",
  "IMG_2094_1777738544549.JPG",
  "IMG_4547_1777738544550.JPG",
  "IMG_4548_1777738544550.JPG",
  "IMG_6597_1777738544550.JPG",
  "SMALL_OLIV0108_1777738544551.JPG",
  "SMALL_OLIV0113_1777738544551.JPG",
];

/**
 * Roll up an analyzed batch into the cautious-signal counts the test page
 * surfaces. Counts are deliberately framed as "possible signals" — none of
 * these numbers are diagnostic on their own; they map directly to what the
 * vision pipeline records.
 */
function aggregate(items: PhotoAnalysisResultRich[]) {
  const counts = {
    usable: 0,
    lowQuality: 0,
    canopyStress: 0,
    pruningNeed: 0,
    pestDamage: 0,
    needsVerification: 0,
  };
  const cueMap = new Map<string, number>();
  for (const it of items) {
    const isLow = it.imageQuality === "poor" || it.imageQuality === "unusable";
    if (isLow) counts.lowQuality++;
    else counts.usable++;

    // Canopy stress = any visible greenness/yellowing/drought signal.
    const yellowing = it.yellowingSignal ?? "none";
    const drought = it.droughtStressVisualSignal ?? "none";
    const greennessLow =
      typeof it.canopyGreennessScore === "number" && it.canopyGreennessScore < 0.4;
    if (
      (yellowing && yellowing !== "none") ||
      (drought && drought !== "none") ||
      greennessLow
    ) {
      counts.canopyStress++;
    }

    // Pruning need: anything the vision pass didn't explicitly mark "none".
    const pruning = it.pruningNeedSignal ?? "none";
    if (pruning && pruning !== "none") counts.pruningNeed++;

    // Pest / damage: any pest cue or visible fruit damage signal.
    const cues = (it.possiblePestOrDiseaseCues as Array<{ cue: string }>) ?? [];
    const fruitDamage = it.fruitDamageSignal ?? "none";
    if (cues.length > 0 || (fruitDamage && fruitDamage !== "none")) counts.pestDamage++;

    if (it.needsFieldVerification === "yes") counts.needsVerification++;

    for (const c of cues) cueMap.set(c.cue, (cueMap.get(c.cue) ?? 0) + 1);
  }
  return { counts, cueMap };
}

export default function PhotoAnalysisTestPage() {
  const { data: batches } = useListPhotoBatches();
  const create = useCreatePhotoBatch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Auto-select latest test batch on first load
  useEffect(() => {
    if (activeBatchId == null && batches && batches.length > 0) {
      setActiveBatchId(batches[0].id);
    }
  }, [batches, activeBatchId]);

  const { data: detail, isLoading } = useGetPhotoBatch(activeBatchId ?? 0);
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!progress || !activeBatchId) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetPhotoBatchQueryKey(activeBatchId) });
    }, 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [progress, activeBatchId, queryClient]);

  const items = detail?.items ?? [];
  const agg = aggregate(items);

  async function runTestBatch() {
    setProgress({ done: 0, total: TEST_FILES.length, current: TEST_FILES[0] });
    const batch = await create.mutateAsync({
      data: {
        name: `Test batch ${new Date().toLocaleString()}`,
        context: "general_tree_review",
        notes: "Auto-generated 16-photo test batch using attached_assets/*.JPG",
      },
    });
    queryClient.invalidateQueries({ queryKey: getListPhotoBatchesQueryKey() });
    setActiveBatchId(batch.id);
    let done = 0;
    for (const fname of TEST_FILES) {
      try {
        setProgress({ done, total: TEST_FILES.length, current: fname });
        const url = `/attached_assets/${encodeURIComponent(fname)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch ${fname}: ${res.status}`);
        const blob = await res.blob();
        await uploadPhoto({
          file: blob,
          originalFileName: fname,
          contentType: blob.type || "image/jpeg",
          fileSizeBytes: blob.size,
          purpose: "general",
          batchId: batch.id,
          analysisProvider: "auto",
        });
        done++;
        queryClient.invalidateQueries({ queryKey: getGetPhotoBatchQueryKey(batch.id) });
      } catch (err) {
        toast({
          title: `Failed: ${fname}`,
          description: (err as Error).message,
          variant: "destructive",
        });
      }
    }
    setProgress(null);
    toast({ title: `Test batch complete (${done}/${TEST_FILES.length})` });
    queryClient.invalidateQueries({ queryKey: getGetPhotoBatchQueryKey(batch.id) });
  }

  async function uploadCustomFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setProgress({ done: 0, total: arr.length, current: arr[0].name });
    let batchId = activeBatchId;
    if (!batchId) {
      const batch = await create.mutateAsync({
        data: {
          name: `Custom upload ${new Date().toLocaleString()}`,
          context: "general_tree_review",
          notes: `Manager-picked ${arr.length} photo(s)`,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListPhotoBatchesQueryKey() });
      batchId = batch.id;
      setActiveBatchId(batch.id);
    }
    let done = 0;
    for (const file of arr) {
      try {
        setProgress({ done, total: arr.length, current: file.name });
        await uploadPhoto({
          file,
          originalFileName: file.name,
          contentType: file.type || "image/jpeg",
          fileSizeBytes: file.size,
          purpose: "general",
          batchId,
          analysisProvider: "auto",
        });
        done++;
        queryClient.invalidateQueries({ queryKey: getGetPhotoBatchQueryKey(batchId) });
      } catch (err) {
        toast({ title: `Failed: ${file.name}`, description: (err as Error).message, variant: "destructive" });
      }
    }
    setProgress(null);
    toast({ title: `Custom upload complete (${done}/${arr.length})` });
    queryClient.invalidateQueries({ queryKey: getGetPhotoBatchQueryKey(batchId) });
    if (customInputRef.current) customInputRef.current.value = "";
  }

  function downloadExport(format: "csv" | "json") {
    if (!activeBatchId) return;
    // window.open (not fetch) so the browser triggers a real download.
    window.open(getExportBatchResultsUrl(activeBatchId, { format }), "_blank");
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <Beaker className="h-6 w-6 text-primary" />
          16-photo Visual Analysis Test
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Runs the Visual Tree Intelligence pipeline against the 16 sample images bundled at{" "}
          <code className="text-xs">attached_assets/*.JPG</code>. Use this page to verify cautious
          language, signal coverage, and review queue behavior end-to-end.
        </p>
        <Link href="/photo-analysis" className="text-sm text-primary underline" data-testid="link-back-to-review">
          ← Back to review queue
        </Link>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Test batch controls</CardTitle>
            <div className="flex gap-2 items-center">
              <Select
                value={activeBatchId ? String(activeBatchId) : ""}
                onValueChange={(v) => setActiveBatchId(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[280px]" data-testid="select-batch">
                  <SelectValue placeholder="Pick batch…" />
                </SelectTrigger>
                <SelectContent>
                  {(batches ?? []).map((b: PhotoBatchRich) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={runTestBatch} disabled={!!progress || create.isPending} data-testid="button-run-test">
                <Upload className="h-4 w-4 mr-1" />
                Run new 16-photo test
              </Button>
              <input
                ref={customInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadCustomFiles(e.target.files)}
                data-testid="input-custom-files"
              />
              <Button
                variant="outline"
                onClick={() => customInputRef.current?.click()}
                disabled={!!progress || create.isPending}
                data-testid="button-upload-custom"
              >
                <Upload className="h-4 w-4 mr-1" /> Upload your own photos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {progress && (
            <div className="rounded border bg-muted/20 p-3 text-sm">
              Uploading {progress.done + 1} of {progress.total}: <span className="font-mono">{progress.current}</span>
              <div className="h-2 mt-2 rounded bg-muted overflow-hidden">
                <div
                  className="h-2 bg-primary transition-all"
                  style={{ width: `${((progress.done + 1) / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {detail?.batch && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <div className="rounded border p-3" data-testid="stat-usable">
                <div className="text-xs text-muted-foreground">Usable</div>
                <div className="text-2xl font-bold text-emerald-700">{agg.counts.usable}</div>
                <div className="text-[10px] text-muted-foreground">image_quality OK</div>
              </div>
              <div className="rounded border p-3" data-testid="stat-low-quality">
                <div className="text-xs text-muted-foreground">Low quality</div>
                <div className="text-2xl font-bold text-muted-foreground">{agg.counts.lowQuality}</div>
                <div className="text-[10px] text-muted-foreground">blurry / unusable</div>
              </div>
              <div className="rounded border p-3" data-testid="stat-canopy-stress">
                <div className="text-xs text-muted-foreground">Canopy stress</div>
                <div className="text-2xl font-bold text-amber-700">{agg.counts.canopyStress}</div>
                <div className="text-[10px] text-muted-foreground">greenness · yellowing · drought</div>
              </div>
              <div className="rounded border p-3" data-testid="stat-pruning-need">
                <div className="text-xs text-muted-foreground">Pruning need</div>
                <div className="text-2xl font-bold text-sky-700">{agg.counts.pruningNeed}</div>
                <div className="text-[10px] text-muted-foreground">visible signal</div>
              </div>
              <div className="rounded border p-3" data-testid="stat-pest-damage">
                <div className="text-xs text-muted-foreground">Pest / damage</div>
                <div className="text-2xl font-bold text-purple-800">{agg.counts.pestDamage}</div>
                <div className="text-[10px] text-muted-foreground">cues · fruit damage</div>
              </div>
              <div className="rounded border p-3" data-testid="stat-needs-verification">
                <div className="text-xs text-muted-foreground">Needs verification</div>
                <div className="text-2xl font-bold text-amber-700">{agg.counts.needsVerification}</div>
                <div className="text-[10px] text-muted-foreground">treat as possible signal</div>
              </div>
            </div>
          )}
          {agg.cueMap.size > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-semibold">Pest/disease cues seen:</span>
              {Array.from(agg.cueMap.entries()).map(([cue, count]) => (
                <Badge key={cue} variant="outline" className="bg-purple-50 text-purple-800 border-purple-300">
                  {cue.replace(/_/g, " ")} × {count}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadExport("csv")} disabled={!activeBatchId} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadExport("json")} disabled={!activeBatchId}>
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && [...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        {items.map((r) => (
          <AnalysisCard key={r.id} result={r} />
        ))}
        {!isLoading && items.length === 0 && !progress && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="p-12 text-center text-muted-foreground">
              No items yet — click "Run new 16-photo test" above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
