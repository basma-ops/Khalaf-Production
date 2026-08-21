import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, MapPinned, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GrovePicker, type PickedGrove } from "@/components/grove-picker";
import { PhotoCapture } from "@/components/photo-capture";
import type { PhotoLibraryItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { reportTypeLabel } from "@/lib/report-types";

/**
 * Grove-scoped capture flow.
 *
 * Step 1: GPS auto-selects the nearest grove (manual fallback if denied).
 * Step 2: Worker picks a report type, optionally adds notes, takes a
 *         photo. The photo + metadata IS the report — no further form.
 */
export default function CaptureGrove() {
  const { toast } = useToast();
  const [grove, setGrove] = useState<PickedGrove | null>(null);

  function onUploaded(media: PhotoLibraryItem) {
    toast({
      title: "تم حفظ التقرير",
      description: `${media.groveName ?? grove?.name ?? "البستان"} · ${reportTypeLabel(media.reportType)}`,
    });
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
          البستان كاملاً
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">تقرير البستان</h1>
        <p className="text-sm text-muted-foreground mt-1">
          استخدم موقع جهازك لتحديد البستان الذي تقف فيه، ثم أرسل صورة واحدة مع ملاحظاتك.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground">
            <MapPinned className="h-3.5 w-3.5 text-primary" />
            الخطوة 1 — اختر البستان
          </div>
          <GrovePicker
            value={grove?.id ?? null}
            onChange={(_id, picked) => setGrove(picked)}
          />
        </CardContent>
      </Card>

      <Card className={grove ? "" : "opacity-60 pointer-events-none"}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground">
            <Camera className="h-3.5 w-3.5 text-primary" />
            الخطوة 2 — تصنيف والتقاط
          </div>
          {grove ? (
            <>
              <div className="text-sm">
                التبليغ عن{" "}
                <span className="font-semibold text-foreground">{grove.name}</span>{" "}
                <span className="text-muted-foreground font-mono text-xs">
                  ({grove.groveCode})
                </span>
              </div>
              <PhotoCapture
                purpose="general"
                groveId={grove.id}
                requireReport
                onUploaded={onUploaded}
                label="التقط صورة البستان"
              />
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              اختر بستاناً أعلاه لتفعيل التقاط الصورة.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
