import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, AlertTriangle, Upload, Brain, Image as ImageIcon, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { uploadPhoto, PhotoQueuedOfflineError } from "@/lib/usePhotoUpload";
import { analyzePhotoQuality, type PhotoQuality } from "@/lib/photo-quality";
import { REPORT_TYPE_OPTIONS, reportTypeLabel } from "@/lib/report-types";
import {
  type FinalizeUploadRequestPurpose,
  type FinalizeUploadRequestPhotoSide,
  type FinalizeUploadRequestReportType,
  type PhotoLibraryItem,
} from "@workspace/api-client-react";

// Order matches a clockwise compass walk + the two non-cardinal views
// reviewers commonly want to disambiguate (canopy from below, trunk
// close-up). Kept here so the same labels appear on every form that
// embeds PhotoCapture.
const PHOTO_SIDE_OPTIONS: { value: FinalizeUploadRequestPhotoSide; label: string }[] = [
  { value: "N", label: "شمال" },
  { value: "E", label: "شرق" },
  { value: "S", label: "جنوب" },
  { value: "W", label: "غرب" },
  { value: "canopy", label: "التاج" },
  { value: "trunk", label: "الجذع" },
];

interface Props {
  purpose: FinalizeUploadRequestPurpose;
  treeId?: number | null;
  groveId?: number | null;
  zone?: string | null;
  workerId?: number | null;
  linkedEntityType?: string | null;
  linkedEntityId?: number | null;
  label?: string;
  /**
   * If true, render a 6-button selector (N/E/S/W/Canopy/Trunk) above the
   * shutter button. The capture button is disabled until the worker picks
   * one — this is what makes the resulting Media row queryable by side.
   * Default false to keep PhotoCapture a drop-in for existing forms that
   * don't care which side was photographed.
   */
  requireSide?: boolean;
  /**
   * If true, render the "Report type" dropdown + a free-form notes field
   * inline. The shutter is disabled until a report type is picked. This
   * is what makes a single photo upload act as a complete field report
   * (replacing the old per-kind forms).
   */
  requireReport?: boolean;
  onUploaded?: (media: PhotoLibraryItem) => void;
  onPendingChange?: (pending: boolean) => void;
  className?: string;
}

type Stage = "uploaded" | "analyzing" | "analyzed" | "needs_review" | "failed" | "queued_offline";

interface Row {
  key: string;
  fileName: string;
  stage: Stage;
  media?: PhotoLibraryItem;
  error?: string;
  /** Client-side capture-quality check (blur / brightness / GPS). */
  quality?: PhotoQuality;
}

function StageBadge({ stage }: { stage: Stage }) {
  const map: Record<Stage, { label: string; className: string; Icon: typeof Upload }> = {
    uploaded: {
      label: "تم الرفع",
      className: "text-blue-700 dark:text-blue-400",
      Icon: Upload,
    },
    analyzing: {
      label: "جارٍ التحليل…",
      className: "text-violet-700 dark:text-violet-400",
      Icon: Brain,
    },
    analyzed: {
      label: "تم التحليل",
      className: "text-green-700 dark:text-green-400",
      Icon: CheckCircle2,
    },
    needs_review: {
      label: "بحاجة للمراجعة",
      className: "text-amber-700 dark:text-amber-400",
      Icon: AlertTriangle,
    },
    queued_offline: {
      label: "محفوظة بدون شبكة — ستُرفع لاحقاً",
      className: "text-sky-700 dark:text-sky-400",
      Icon: CloudOff,
    },
    failed: {
      label: "فشل الرفع",
      className: "text-destructive",
      Icon: AlertTriangle,
    },
  };
  const { label, className, Icon } = map[stage];
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${className}`} data-testid={`stage-${stage}`}>
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

export function PhotoCapture(props: Props) {
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState(false);
  const [side, setSide] = useState<FinalizeUploadRequestPhotoSide | null>(null);
  const [reportType, setReportType] = useState<FinalizeUploadRequestReportType | null>(
    props.requireReport ? "general" : null,
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    props.onPendingChange?.(pending);
  }, [pending, props]);

  function pickCamera() {
    cameraInputRef.current?.click();
  }
  function pickGallery() {
    galleryInputRef.current?.click();
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPending(true);
    // Snapshot the form state at submit time so a slow upload + a late
    // edit can't mislabel the row.
    const submittedNotes = notes.trim() || null;
    const submittedReportType = reportType;
    const submittedSide = side;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Stage 0: on-device quality check (blur / brightness / GPS).
      // We never block the upload on this — the warnings are surfaced
      // as a non-blocking chip on the row so the worker can decide to
      // retake.
      let quality: PhotoQuality | undefined;
      try {
        quality = await analyzePhotoQuality(file);
      } catch {
        // Best-effort: missing OffscreenCanvas / EXIF parser → no chip.
      }
      // Stage 1: uploaded — file is being PUT to storage / finalized.
      setRows((prev) => [{ key, fileName: file.name, stage: "uploaded", quality }, ...prev]);
      try {
        const res = await uploadPhoto({
          file,
          originalFileName: file.name,
          contentType: file.type || "image/jpeg",
          fileSizeBytes: file.size,
          purpose: props.purpose,
          treeId: props.treeId ?? null,
          groveId: props.groveId ?? null,
          zone: props.zone ?? null,
          photoSide: submittedSide,
          reportType: submittedReportType,
          caption: submittedNotes,
          linkedEntityType: props.linkedEntityType ?? null,
          linkedEntityId: props.linkedEntityId ?? null,
        });
        // Stage 2: analyzing — finalize has returned; show the analysis pass.
        updateRow(key, { stage: "analyzing", media: res.media });
        const verdict: Stage =
          res.media.latestAnalysis?.needsFieldVerification === "yes"
            ? "needs_review"
            : "analyzed";
        await new Promise((r) => setTimeout(r, 250));
        updateRow(key, { stage: verdict });
        props.onUploaded?.(res.media);
      } catch (err) {
        if (err instanceof PhotoQueuedOfflineError) {
          updateRow(key, { stage: "queued_offline" });
          toast({
            title: "تم الحفظ بدون شبكة",
            description: `${file.name} ستُرفع تلقائياً عند عودة الاتصال`,
          });
          continue;
        }
        const msg = (err as Error).message;
        updateRow(key, { stage: "failed", error: msg });
        toast({ title: `فشل الرفع: ${file.name}`, description: msg, variant: "destructive" });
      }
    }
    setPending(false);
    // Notes get cleared after a successful submit so the next upload starts
    // fresh. Report type stays sticky — workers usually file a few in a row.
    setNotes("");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  const sideRequired = props.requireSide ?? false;
  const reportRequired = props.requireReport ?? false;
  const captureDisabled =
    pending ||
    (sideRequired && side == null) ||
    (reportRequired && reportType == null);

  return (
    <div className={props.className}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid="input-photo-capture"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid="input-photo-gallery"
      />

      {reportRequired && (
        <div className="mb-3 space-y-3" data-testid="report-meta">
          <div>
            <label
              htmlFor="report-type-select"
              className="text-xs tracking-[0.18em] text-muted-foreground mb-2 block"
            >
              نوع التقرير
            </label>
            <select
              id="report-type-select"
              value={(reportType ?? "") as string}
              onChange={(e) => setReportType(e.target.value as FinalizeUploadRequestReportType)}
              className="w-full h-11 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="select-report-type"
            >
              {REPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value ?? ""}>
                  {o.label}
                </option>
              ))}
            </select>
            {reportType && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                {REPORT_TYPE_OPTIONS.find((o) => o.value === reportType)?.hint}
              </div>
            )}
          </div>
          <div>
            <label
              htmlFor="report-notes"
              className="text-xs tracking-[0.18em] text-muted-foreground mb-2 block"
            >
              ملاحظات (اختيارية)
            </label>
            <Textarea
              id="report-notes"
              rows={3}
              placeholder="ماذا يحدث في هذه الصورة؟"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-report-notes"
            />
          </div>
        </div>
      )}

      {sideRequired && (
        <div className="mb-3" data-testid="photo-side-selector">
          <div className="text-xs tracking-[0.18em] text-muted-foreground mb-2">
            جهة الشجرة
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {PHOTO_SIDE_OPTIONS.map((opt) => {
              const active = side === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSide(opt.value)}
                  data-testid={`button-side-${opt.value}`}
                  className={cn(
                    "h-11 rounded-md border text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50",
                  )}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {side == null && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              اختر أي جهة من الشجرة ستصوّر قبل الالتقاط. شمال/شرق/جنوب/غرب اتجاهات البوصلة، التاج = نظرة من الأسفل للأعلى، الجذع = صورة قريبة.
            </div>
          )}
        </div>
      )}
      {pending ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-14 text-base border-2 border-primary/40"
          disabled
          data-testid="button-photo-capture"
        >
          <Loader2 className="ml-2 h-5 w-5 animate-spin" />
          جارٍ العمل…
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-14 text-base border-2 border-primary/40"
            onClick={pickCamera}
            disabled={captureDisabled}
            data-testid="button-photo-capture"
          >
            <Camera className="ml-2 h-5 w-5" />
            التقط صورة
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 text-base border-2 border-primary/40"
            onClick={pickGallery}
            disabled={captureDisabled}
            data-testid="button-photo-gallery"
          >
            <ImageIcon className="ml-2 h-5 w-5" />
            من المعرض
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((r) => {
            const fullUrl = r.media?.fileUrl ?? r.media?.thumbnailUrl ?? null;
            return (
              <div
                key={r.key}
                className="rounded-lg border bg-muted/30 overflow-hidden"
                data-testid={`photo-row-${r.key}`}
              >
                {fullUrl ? (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-black/5"
                    data-testid={`photo-link-${r.key}`}
                  >
                    <img
                      src={fullUrl}
                      alt={r.media?.originalFileName ?? ""}
                      className="w-full max-h-72 object-contain"
                    />
                  </a>
                ) : (
                  <div className="w-full h-40 bg-muted flex items-center justify-center">
                    {r.stage === "uploaded" || r.stage === "analyzing" ? (
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    ) : (
                      <Camera className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="p-3 min-w-0">
                  <StageBadge stage={r.stage} />
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {r.fileName}
                    {r.media?.reportType ? (
                      <> · {reportTypeLabel(r.media.reportType)}</>
                    ) : null}
                    {r.media?.photoSide ? <> · جهة {r.media.photoSide}</> : null}
                  </div>
                  {r.media?.caption && (
                    <div className="text-xs text-foreground/80 mt-1 italic">
                      “{r.media.caption}”
                    </div>
                  )}
                  {r.stage === "needs_review" && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      التحليل التلقائي يطلب تحققاً ميدانياً — تعامل معها كإشارة محتملة فقط.
                    </div>
                  )}
                  {r.quality && r.quality.warnings.length > 0 && (
                    <div
                      className="mt-1 flex flex-wrap gap-1"
                      data-testid={`photo-quality-${r.key}`}
                    >
                      {r.quality.warnings.map((w) => (
                        <span
                          key={w}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.stage === "failed" && r.error && (
                    <div className="text-xs text-destructive mt-1">{r.error}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
