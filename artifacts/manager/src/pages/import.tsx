import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  useListPhotoBatches,
  useCreatePhotoBatch,
  useGetPhotoBatch,
  useListGroves,
  useListTrees,
  getListPhotoBatchesQueryKey,
  getGetPhotoBatchQueryKey,
  getExportBatchResultsUrl,
  type PhotoBatchRich,
  type CreatePhotoBatchRequestContext,
  type FinalizeUploadRequestPurpose,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { uploadPhoto } from "@/lib/usePhotoUpload";
import {
  enqueueRow,
  listQueueForBatch,
  listRememberedBatches,
  rememberBatch,
  forgetBatch,
  updateRow as updateQueueRow,
  deleteRow as deleteQueueRow,
  clearDoneForBatch,
  purgeRowsByStatus,
  makeRowId,
  type ImportQueueRow,
} from "@/lib/import-queue-db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnalysisCard } from "@/components/analysis-card";
import { Link } from "wouter";
import {
  Upload,
  FolderOpen,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

const PURPOSE_OPTIONS: { value: NonNullable<FinalizeUploadRequestPurpose>; label: string }[] = [
  { value: "general", label: "General tree review" },
  { value: "pre_harvest", label: "Pre-harvest tree" },
  { value: "box", label: "Harvest box" },
  { value: "pest", label: "Pest check" },
  { value: "disease", label: "Disease check" },
  { value: "damage", label: "Damage / anomaly" },
  { value: "pruning_before", label: "Pruning — before" },
  { value: "pruning_after", label: "Pruning — after" },
  { value: "growth", label: "Growth tracking" },
];

const CONTEXT_OPTIONS: { value: NonNullable<CreatePhotoBatchRequestContext>; label: string }[] = [
  { value: "general_tree_review", label: "General tree review" },
  { value: "harvest_pre_tree", label: "Harvest — pre-tree" },
  { value: "harvest_box", label: "Harvest — boxes" },
  { value: "pest_or_disease_check", label: "Pest / disease check" },
  { value: "pruning_assessment", label: "Pruning assessment" },
  { value: "damage_or_anomaly", label: "Damage / anomaly" },
];

const ACCEPTED_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

type FileStatus = "queued" | "uploading" | "done" | "failed";
type QueueItem = {
  id: string;
  file: File | Blob;
  fileName: string;
  fileSize: number;
  status: FileStatus;
  error?: string;
  mediaId?: number;
  retryCount: number;
  // Per-row metadata captured the first time the row was enqueued.
  // Resume must use these (not the current form defaults) so a manager
  // who edits the form after closing the tab doesn't relabel the
  // previously-queued photos.
  rowPurpose?: string;
  rowGroveId?: number | null;
  rowTreeId?: number | null;
};

function rowToQueueItem(r: ImportQueueRow): QueueItem {
  return {
    id: r.id,
    file: r.blob,
    fileName: r.fileName,
    fileSize: r.fileSizeBytes,
    status: r.status === "uploading" ? "queued" : r.status,
    error: r.error,
    mediaId: r.mediaId,
    retryCount: r.retryCount,
    rowPurpose: r.purpose,
    rowGroveId: r.groveId,
    rowTreeId: r.treeId,
  };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: batches } = useListPhotoBatches();
  const { data: groves } = useListGroves();
  const { data: trees } = useListTrees();
  const create = useCreatePhotoBatch();

  // Batch metadata form
  const [batchName, setBatchName] = useState("");
  const [batchContext, setBatchContext] =
    useState<NonNullable<CreatePhotoBatchRequestContext>>("general_tree_review");
  const [batchNotes, setBatchNotes] = useState("");
  const [defaultPurpose, setDefaultPurpose] =
    useState<NonNullable<FinalizeUploadRequestPurpose>>("general");
  const [defaultGroveId, setDefaultGroveId] = useState<string>("none");
  const [defaultTreeId, setDefaultTreeId] = useState<string>("none");

  // Upload queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // On mount: if a previous tab left a batch with queued, uploading, or
  // failed rows in IndexedDB, surface it AND automatically resume
  // draining so the manager doesn't have to click "Start" again.
  // Failed rows still wait for an explicit per-row Retry — only rows
  // that hadn't yet finished a first attempt are auto-drained.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remembered = await listRememberedBatches();
      for (const b of remembered) {
        const rows = await listQueueForBatch(b.batchId);
        if (rows.length === 0) {
          // Fully drained: clean up so we don't keep nagging.
          await forgetBatch(b.batchId);
          continue;
        }
        if (cancelled) return;
        setActiveBatchId(b.batchId);
        setQueue(rows.map(rowToQueueItem));
        const pending = rows.filter((r) => r.status !== "done").length;
        const failed = rows.filter((r) => r.status === "failed").length;
        setResumeNotice(
          `Resumed import "${b.name}" — ${pending} pending${
            failed ? `, ${failed} previously failed (tap Retry)` : ""
          }. Drain in progress…`,
        );

        // Auto-resume drain. We only replay rows that were left in
        // "queued" or "uploading" state (the latter means a tab was
        // closed mid-PUT — re-presigning + re-PUTting is safe). Rows
        // marked "failed" require explicit per-row Retry so we don't
        // silently re-hit a server-side error in a loop.
        const toDrain = rows.filter(
          (r) => r.status === "queued" || r.status === "uploading",
        );
        if (toDrain.length > 0) {
          setIsUploading(true);
          try {
            for (const r of toDrain) {
              if (cancelled) return;
              const item: QueueItem = rowToQueueItem(r);
              await uploadRow(
                { ...item, status: "queued" },
                b.batchId,
                r.purpose ?? "general",
                r.groveId ?? null,
                r.treeId ?? null,
              );
            }
            queryClient.invalidateQueries({
              queryKey: getGetPhotoBatchQueryKey(b.batchId),
            });
            queryClient.invalidateQueries({
              queryKey: getListPhotoBatchesQueryKey(),
            });
            // Same cleanup as the manual Start path so successful
            // auto-resumes don't leave stale "Resumed import" banners
            // or completed rows lingering in IndexedDB.
            try {
              const after = await listQueueForBatch(b.batchId);
              const stillFailed = after.some((r) => r.status === "failed");
              const stillPending = after.some(
                (r) => r.status === "queued" || r.status === "uploading",
              );
              await clearDoneForBatch(b.batchId);
              if (!stillFailed && !stillPending) {
                await forgetBatch(b.batchId);
                if (!cancelled) {
                  setActiveBatchId(null);
                  setQueue([]);
                  setResumeNotice(null);
                }
              }
            } catch (err) {
              console.warn("import-queue: auto-resume cleanup failed", err);
            }
          } finally {
            if (!cancelled) setIsUploading(false);
          }
        }
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load IndexedDB rows whenever the active batch changes (e.g. the
  // manager clicks a row in "Recent batches").
  const refreshQueueFromDb = useCallback(async (batchId: number | null) => {
    if (batchId == null) return;
    const rows = await listQueueForBatch(batchId);
    setQueue(rows.map(rowToQueueItem));
  }, []);

  // When a batch is active and analysis is in flight, poll the detail.
  const { data: detail } = useGetPhotoBatch(activeBatchId ?? 0);
  useEffect(() => {
    if (!activeBatchId) return;
    const stillAnalyzing =
      detail?.batch &&
      detail.batch.totalItems > 0 &&
      detail.batch.analyzedItems < detail.batch.totalItems;
    const recentlyUploading = isUploading;
    if (!stillAnalyzing && !recentlyUploading) return;
    const t = window.setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: getGetPhotoBatchQueryKey(activeBatchId),
      });
      queryClient.invalidateQueries({ queryKey: getListPhotoBatchesQueryKey() });
    }, 3000);
    return () => window.clearInterval(t);
  }, [activeBatchId, detail, isUploading, queryClient]);

  const recentBatches = useMemo(
    () => (batches ?? []).slice(0, 6),
    [batches],
  );
  const items = detail?.items ?? [];

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const incoming = Array.from(files).filter((f) => {
      if (!ACCEPTED_TYPES.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
        toast({
          title: "Skipped non-image file",
          description: `${f.name} is not a supported image type.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });
    if (incoming.length === 0) return;
    setQueue((q) => [
      ...q,
      ...incoming.map<QueueItem>((file) => ({
        id: makeRowId(),
        file,
        fileName: file.name,
        fileSize: file.size,
        status: "queued",
        retryCount: 0,
      })),
    ]);
  }

  async function removeFromQueue(id: string) {
    return purgeOne(id);
  }


  async function clearQueue() {
    setQueue((q) => q.filter((it) => it.status === "uploading"));
    if (activeBatchId != null) {
      // Purge everything except in-flight uploads from IndexedDB so the
      // next resume isn't haunted by Blobs the manager already
      // dismissed in the UI.
      try {
        await purgeRowsByStatus(activeBatchId, ["queued", "failed", "done"]);
      } catch {}
    }
  }

  // Permanently drop a single row (queued or failed) from both UI state
  // and IndexedDB. Used by the per-row "Clear" / "Remove" controls.
  async function purgeOne(id: string) {
    setQueue((q) => q.filter((it) => it.id !== id));
    try {
      await deleteQueueRow(id);
    } catch {}
  }

  // Drain a single row through the presign → PUT → finalize pipeline,
  // updating both React state and IndexedDB so the resume path always
  // sees current status.
  async function uploadRow(
    item: QueueItem,
    batchId: number,
    purpose: string,
    groveIdNum: number | null,
    treeIdNum: number | null,
  ): Promise<boolean> {
    setQueue((q) =>
      q.map((it) => (it.id === item.id ? { ...it, status: "uploading" } : it)),
    );
    // Persist the "uploading" transition immediately so a tab close
    // mid-PUT leaves a durable signal — the resume effect will then
    // re-queue this row instead of assuming it succeeded.
    try {
      await updateQueueRow({
        id: item.id,
        batchId,
        fileName: item.fileName,
        contentType: item.file.type || "image/jpeg",
        fileSizeBytes: item.fileSize,
        blob: item.file,
        status: "uploading",
        retryCount: item.retryCount,
        purpose,
        groveId: groveIdNum,
        treeId: treeIdNum,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn("import-queue: failed to persist uploading state", err);
    }
    try {
      const res = await uploadPhoto({
        file: item.file,
        originalFileName: item.fileName,
        contentType: item.file.type || "image/jpeg",
        fileSizeBytes: item.fileSize,
        purpose: purpose as FinalizeUploadRequestPurpose,
        treeId: treeIdNum,
        groveId: groveIdNum,
        batchId,
        analysisProvider: "auto",
      });
      setQueue((q) =>
        q.map((it) =>
          it.id === item.id
            ? { ...it, status: "done", mediaId: res.media?.id, error: undefined }
            : it,
        ),
      );
      // Mirror to IndexedDB as "done" so we don't replay it on resume.
      try {
        await updateQueueRow({
          id: item.id,
          batchId,
          fileName: item.fileName,
          contentType: item.file.type || "image/jpeg",
          fileSizeBytes: item.fileSize,
          blob: item.file,
          status: "done",
          retryCount: item.retryCount,
          mediaId: res.media?.id,
          purpose,
          groveId: groveIdNum,
          treeId: treeIdNum,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn("import-queue: failed to persist done state", err);
      }
      queryClient.invalidateQueries({
        queryKey: getGetPhotoBatchQueryKey(batchId),
      });
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      setQueue((q) =>
        q.map((it) =>
          it.id === item.id
            ? { ...it, status: "failed", error: msg, retryCount: it.retryCount + 1 }
            : it,
        ),
      );
      try {
        await updateQueueRow({
          id: item.id,
          batchId,
          fileName: item.fileName,
          contentType: item.file.type || "image/jpeg",
          fileSizeBytes: item.fileSize,
          blob: item.file,
          status: "failed",
          retryCount: item.retryCount + 1,
          error: msg,
          purpose,
          groveId: groveIdNum,
          treeId: treeIdNum,
          createdAt: Date.now(),
        });
      } catch (err2) {
        console.warn("import-queue: failed to persist failed state", err2);
      }
      return false;
    }
  }

  async function startImport() {
    const queued = queue.filter((it) => it.status === "queued");
    if (queued.length === 0) {
      toast({ title: "Add some photos first", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      // Reuse the active batch ONLY when it was resumed from IndexedDB
      // (i.e. has persisted queue rows). If the manager just clicked an
      // old batch in "Recent batches" to inspect it, activeBatchId is
      // set but no rows exist locally — in that case we still mint a
      // fresh batch so new uploads don't accidentally land in a
      // historical batch.
      const persisted =
        activeBatchId != null
          ? await listQueueForBatch(activeBatchId)
          : [];
      const canReuse = activeBatchId != null && persisted.length > 0;
      let batchId = canReuse ? activeBatchId! : null;
      let batchName_: string;
      if (batchId == null) {
        const name =
          batchName.trim() ||
          `Import ${new Date().toLocaleString()} (${queued.length} photo${queued.length === 1 ? "" : "s"})`;
        const trimmedNotes = batchNotes.trim();
        const batch = await create.mutateAsync({
          data: {
            name,
            context: batchContext,
            ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          },
        });
        queryClient.invalidateQueries({ queryKey: getListPhotoBatchesQueryKey() });
        batchId = batch.id;
        batchName_ = batch.name;
        setActiveBatchId(batch.id);
      } else {
        batchName_ =
          batches?.find((b) => b.id === batchId)?.name ?? `Batch ${batchId}`;
      }
      await rememberBatch(batchId, batchName_);

      const groveIdNum =
        defaultGroveId !== "none" ? Number(defaultGroveId) : null;
      const treeIdNum =
        defaultTreeId !== "none" ? Number(defaultTreeId) : null;

      // Persist the queued rows to IndexedDB BEFORE starting uploads so
      // a tab-close mid-import has a complete snapshot to resume from.
      for (const item of queued) {
        try {
          await enqueueRow({
            id: item.id,
            batchId,
            fileName: item.fileName,
            contentType: item.file.type || "image/jpeg",
            fileSizeBytes: item.fileSize,
            blob: item.file,
            status: "queued",
            retryCount: item.retryCount,
            purpose: defaultPurpose,
            groveId: groveIdNum,
            treeId: treeIdNum,
          });
        } catch {}
      }

      let okCount = 0;
      let failCount = 0;
      for (const item of queued) {
        // Use the row's own captured metadata for resumed rows; new
        // rows fall back to the current form defaults (which were the
        // values active when they were enqueued a moment ago).
        const purpose = item.rowPurpose ?? defaultPurpose;
        const grove = item.rowGroveId !== undefined ? item.rowGroveId : groveIdNum;
        const tree = item.rowTreeId !== undefined ? item.rowTreeId : treeIdNum;
        const ok = await uploadRow(item, batchId, purpose, grove, tree);
        if (ok) okCount++;
        else failCount++;
      }
      queryClient.invalidateQueries({ queryKey: getListPhotoBatchesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetPhotoBatchQueryKey(batchId),
      });
      // Auto-prune fully-completed rows from IndexedDB so the local
      // store doesn't grow unbounded. If every row succeeded, also
      // forget the batch entirely so the next page load doesn't show
      // a stale "resumed import" banner.
      try {
        await clearDoneForBatch(batchId);
        if (failCount === 0) await forgetBatch(batchId);
      } catch (err) {
        console.warn("import-queue: cleanup after drain failed", err);
      }
      toast({
        title: `Import complete`,
        description: `${okCount} uploaded${failCount ? `, ${failCount} failed (retry available per row)` : ""}.`,
      });
      setResumeNotice(null);
    } catch (err) {
      toast({
        title: "Could not create import batch",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }

  // Per-row manual retry — used after a batch finishes with failures,
  // or to re-attempt a row that was left "failed" from a previous tab.
  // Always replays with the row's originally-captured metadata so a
  // mid-session form edit can never relabel an old photo.
  async function retryRow(item: QueueItem) {
    if (activeBatchId == null) return;
    const groveIdNum = defaultGroveId !== "none" ? Number(defaultGroveId) : null;
    const treeIdNum = defaultTreeId !== "none" ? Number(defaultTreeId) : null;
    const purpose = item.rowPurpose ?? defaultPurpose;
    const grove = item.rowGroveId !== undefined ? item.rowGroveId : groveIdNum;
    const tree = item.rowTreeId !== undefined ? item.rowTreeId : treeIdNum;
    setIsUploading(true);
    try {
      await uploadRow({ ...item, status: "queued" }, activeBatchId, purpose, grove, tree);
      queryClient.invalidateQueries({
        queryKey: getGetPhotoBatchQueryKey(activeBatchId),
      });
    } finally {
      setIsUploading(false);
    }
  }

  function downloadExport(format: "csv" | "json") {
    if (!activeBatchId) return;
    window.open(getExportBatchResultsUrl(activeBatchId, { format }), "_blank");
  }

  // Drag & drop handlers
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === el) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer?.files ?? null);
    };
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queuedCount = queue.filter((it) => it.status === "queued").length;
  const doneCount = queue.filter((it) => it.status === "done").length;
  const failedCount = queue.filter((it) => it.status === "failed").length;
  const totalToUpload = queuedCount + doneCount + failedCount + (isUploading ? 0 : 0);
  const progressPct =
    totalToUpload === 0
      ? 0
      : Math.round(((doneCount + failedCount) / totalToUpload) * 100);

  const treeOptions = useMemo(() => {
    const list = trees?.trees ?? [];
    if (defaultGroveId === "none") return list.slice(0, 200);
    const gid = Number(defaultGroveId);
    return list.filter((t) => t.groveId === gid).slice(0, 200);
  }, [trees, defaultGroveId]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Upload className="h-7 w-7 text-primary" />
            Import Center
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Batch-upload tree photos for AI analysis. Each import creates a
            named batch — analysis results are stored with the photos and can
            be reviewed in the photo analysis queue.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/photo-analysis">
            <Button variant="outline" data-testid="link-review-queue">
              <ExternalLink className="h-4 w-4 mr-1" /> Review queue
            </Button>
          </Link>
          <Link href="/photos">
            <Button variant="outline" data-testid="link-photo-library">
              <ExternalLink className="h-4 w-4 mr-1" /> Photo library
            </Button>
          </Link>
        </div>
      </div>

      {resumeNotice && (
        <div
          className="rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 px-4 py-2 text-sm text-sky-800 dark:text-sky-200 flex items-center justify-between gap-3"
          data-testid="resume-notice"
        >
          <span>{resumeNotice}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setResumeNotice(null)}
            data-testid="button-dismiss-resume"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: batch form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Batch details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="batch-name">Batch name</Label>
              <Input
                id="batch-name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. North field — May survey"
                disabled={isUploading}
                data-testid="input-batch-name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-generated from date if blank.
              </p>
            </div>

            <div>
              <Label>Context</Label>
              <Select
                value={batchContext}
                onValueChange={(v) =>
                  setBatchContext(v as NonNullable<CreatePhotoBatchRequestContext>)
                }
                disabled={isUploading}
              >
                <SelectTrigger data-testid="select-batch-context">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Default photo purpose</Label>
              <Select
                value={defaultPurpose}
                onValueChange={(v) =>
                  setDefaultPurpose(v as NonNullable<FinalizeUploadRequestPurpose>)
                }
                disabled={isUploading}
              >
                <SelectTrigger data-testid="select-default-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Link to grove (optional)</Label>
              <Select
                value={defaultGroveId}
                onValueChange={(v) => {
                  setDefaultGroveId(v);
                  setDefaultTreeId("none");
                }}
                disabled={isUploading}
              >
                <SelectTrigger data-testid="select-default-grove">
                  <SelectValue placeholder="No grove" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grove</SelectItem>
                  {(groves ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Link to specific tree (optional)</Label>
              <Select
                value={defaultTreeId}
                onValueChange={setDefaultTreeId}
                disabled={isUploading || treeOptions.length === 0}
              >
                <SelectTrigger data-testid="select-default-tree">
                  <SelectValue
                    placeholder={
                      treeOptions.length === 0
                        ? "No trees available"
                        : "No specific tree"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific tree</SelectItem>
                  {treeOptions.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.treeCode}
                      {t.variety ? ` — ${t.variety}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {defaultGroveId === "none" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Select a grove to filter tree options.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="batch-notes">Notes</Label>
              <Textarea
                id="batch-notes"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="Optional context for whoever reviews this batch."
                rows={3}
                disabled={isUploading}
                data-testid="input-batch-notes"
              />
            </div>
          </CardContent>
        </Card>

        {/* Right: dropzone + queue */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Photos to import</span>
              {queue.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {queue.length} file{queue.length === 1 ? "" : "s"} ·{" "}
                  {formatBytes(queue.reduce((a, b) => a + b.fileSize, 0))}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              ref={dropRef}
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20 hover:bg-muted/40"
              }`}
              data-testid="dropzone"
            >
              <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-3 font-medium">
                Drag & drop photos here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                JPG, PNG, WebP, HEIC — multiple files supported
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                data-testid="input-files"
              />
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-browse"
              >
                <Upload className="h-4 w-4 mr-1" /> Browse files
              </Button>
            </div>

            {queue.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-2 text-sm">
                    <Badge variant="outline">{queuedCount} queued</Badge>
                    {doneCount > 0 && (
                      <Badge className="bg-emerald-600 text-white">
                        {doneCount} uploaded
                      </Badge>
                    )}
                    {failedCount > 0 && (
                      <Badge variant="destructive">{failedCount} failed</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearQueue}
                      disabled={isUploading || queuedCount === 0}
                      data-testid="button-clear-queue"
                    >
                      Clear queued
                    </Button>
                    <Button
                      onClick={startImport}
                      disabled={isUploading || queuedCount === 0}
                      data-testid="button-start-import"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Importing…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" /> Start import (
                          {queuedCount})
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {(isUploading || progressPct > 0) && (
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div
                      className="h-2 bg-primary transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto border rounded divide-y">
                  {queue.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 p-2 text-sm"
                      data-testid={`queue-row-${it.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono truncate">{it.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(it.fileSize)}
                          {it.retryCount > 0 ? ` · attempt ${it.retryCount + 1}` : ""}
                          {it.error ? ` — ${it.error}` : ""}
                        </div>
                      </div>
                      {it.status === "queued" && (
                        <Badge variant="outline">Queued</Badge>
                      )}
                      {it.status === "uploading" && (
                        <Badge className="bg-sky-600 text-white">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Uploading
                        </Badge>
                      )}
                      {it.status === "done" && (
                        <Badge className="bg-emerald-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                      {it.status === "failed" && (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                      {it.status === "queued" && !isUploading && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => purgeOne(it.id)}
                          data-testid={`button-remove-${it.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {it.status === "failed" && !isUploading && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryRow(it)}
                            data-testid={`button-retry-${it.id}`}
                          >
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => purgeOne(it.id)}
                            data-testid={`button-discard-${it.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {it.status === "done" && !isUploading && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => purgeOne(it.id)}
                          data-testid={`button-clear-done-${it.id}`}
                          title="Remove from local queue (already uploaded)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active batch results */}
      {activeBatchId && detail?.batch && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  Results — {detail.batch.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {detail.batch.analyzedItems} of {detail.batch.totalItems}{" "}
                  analyzed
                  {detail.batch.analyzedItems < detail.batch.totalItems &&
                    " — analysis runs in the background"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport("csv")}
                  data-testid="button-export-csv"
                >
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport("json")}
                  data-testid="button-export-json"
                >
                  <Download className="h-4 w-4 mr-1" /> JSON
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {items.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((r) => (
                  <AnalysisCard key={r.id} result={r} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent batches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent import batches</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No batches yet. Your first import will appear here.
            </p>
          ) : (
            <div className="divide-y border rounded">
              {recentBatches.map((b: PhotoBatchRich) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setActiveBatchId(b.id);
                    refreshQueueFromDb(b.id);
                  }}
                  className={`w-full text-left p-3 hover:bg-muted/40 flex items-center justify-between gap-3 ${
                    activeBatchId === b.id ? "bg-muted/40" : ""
                  }`}
                  data-testid={`batch-row-${b.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString()} ·{" "}
                      {b.context.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center text-sm">
                    <Badge variant="outline">
                      {b.analyzedItems}/{b.totalItems} analyzed
                    </Badge>
                    {(b.needsVerificationCount ?? 0) > 0 && (
                      <Badge className="bg-amber-600 text-white">
                        {b.needsVerificationCount} need verify
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
