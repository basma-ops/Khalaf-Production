import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Trees, Camera, CheckCircle2, Plus, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TreePicker } from "@/components/tree-picker";
import { PhotoCapture } from "@/components/photo-capture";
import type { PhotoLibraryItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { reportTypeLabel } from "@/lib/report-types";

interface SelectedTree {
  id: number;
  treeCode: string;
  groveId: number;
}

/**
 * Tree-scoped capture flow.
 *
 * Step 1: GPS auto-selects the nearest tree (manual fallback if denied).
 * Step 2: Worker picks a side (N/E/S/W/canopy/trunk), a report type,
 *         optionally adds notes, takes a photo. The photo + metadata
 *         IS the report — no further form.
 */
export default function CaptureTree() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [tree, setTree] = useState<SelectedTree | null>(null);
  const [lastUploaded, setLastUploaded] = useState<PhotoLibraryItem | null>(null);
  // Force-remount key so "صورة أخرى" gives the worker a clean shutter
  // (clears side / notes / row list inside PhotoCapture).
  const [captureNonce, setCaptureNonce] = useState(0);

  function onUploaded(media: PhotoLibraryItem) {
    setLastUploaded(media);
    toast({
      title: "تم حفظ التقرير",
      description: `${media.treeCode ?? tree?.treeCode ?? "الشجرة"} · جهة ${
        media.photoSide ?? "—"
      } · ${reportTypeLabel(media.reportType)}`,
    });
  }

  function anotherPhotoSameTree() {
    setLastUploaded(null);
    setCaptureNonce((n) => n + 1);
  }

  function anotherTree() {
    setLastUploaded(null);
    setTree(null);
    setCaptureNonce((n) => n + 1);
  }

  return (
    <div className="p-4 pt-6 space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-mr-2 mb-2">
          <Link href="/">
            <ChevronLeft className="h-4 w-4 ml-1 rotate-180" /> رجوع
          </Link>
        </Button>
        <div className="text-[11px] tracking-[0.22em] text-muted-foreground mb-1">
          شجرة محددة
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">تقرير الشجرة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          استخدم موقع جهازك لتحديد الشجرة التي تقف بجوارها، ثم أرسل صورة مع تحديد الجهة والملاحظات.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground">
            <Trees className="h-3.5 w-3.5 text-primary" />
            الخطوة 1 — اختر الشجرة
          </div>
          <TreePicker
            value={tree?.id ?? null}
            onChange={(_id, picked) =>
              setTree(
                picked
                  ? { id: picked.id, treeCode: picked.treeCode, groveId: picked.groveId }
                  : null,
              )
            }
          />
        </CardContent>
      </Card>

      <Card className={tree ? "" : "opacity-60 pointer-events-none"}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground">
            <Camera className="h-3.5 w-3.5 text-primary" />
            الخطوة 2 — تصنيف والتقاط
          </div>
          {tree ? (
            <>
              <div className="text-sm">
                التقاط لـ{" "}
                <span className="font-semibold text-foreground">{tree.treeCode}</span>{" "}
                <span className="text-muted-foreground">· بستان #{tree.groveId}</span>
              </div>
              <PhotoCapture
                key={`pc-${tree.id}-${captureNonce}`}
                purpose="general"
                treeId={tree.id}
                groveId={tree.groveId}
                requireSide
                requireReport
                onUploaded={onUploaded}
                label="التقط صورة الشجرة"
              />
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              اختر شجرة أعلاه لتفعيل التقاط الصورة.
            </div>
          )}
        </CardContent>
      </Card>

      {lastUploaded && (
        <Card
          className="border-primary/50 bg-primary/5"
          data-testid="card-after-upload"
        >
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold">تم رفع الصورة بنجاح</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {lastUploaded.treeCode ?? tree?.treeCode ?? "الشجرة"} ·{" "}
                  {reportTypeLabel(lastUploaded.reportType)}
                  {lastUploaded.photoSide ? ` · جهة ${lastUploaded.photoSide}` : ""}
                </div>
              </div>
            </div>
            <div className="text-xs tracking-[0.18em] text-muted-foreground">
              ماذا تريد أن تفعل الآن؟
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                className="h-12 justify-start"
                onClick={anotherPhotoSameTree}
                data-testid="button-another-photo-same-tree"
              >
                <Plus className="ml-2 h-4 w-4" />
                صورة أخرى لنفس الشجرة
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start"
                onClick={anotherTree}
                data-testid="button-another-tree"
              >
                <RotateCcw className="ml-2 h-4 w-4" />
                تقرير لشجرة أخرى
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 justify-start"
                onClick={() => setLocation("/")}
                data-testid="button-back-home"
              >
                <Home className="ml-2 h-4 w-4" />
                العودة للرئيسية
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
