import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListManagerFlags,
  useListPhenologyEvents,
  useUpdateManagerFlag,
  getListManagerFlagsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import {
  Trees,
  Flag,
  Sprout,
  Camera,
  ChevronRight,
  ClipboardList,
  MapPinned,
} from "lucide-react";
import { format } from "date-fns";
import { dateLocale, severityLabel } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STAGE_LABEL: Record<string, string> = {
  sprouting: "إنبات",
  leaf_development: "تكوّن الأوراق",
  inflorescence_emergence: "ظهور النورات",
  flowering: "إزهار",
  fruit_development: "تكوّن الثمار",
  ripening: "نضج",
  senescence: "شيخوخة",
  dormancy: "سكون",
};

/**
 * Field worker home — deliberately minimal.
 *
 * The whole field flow is now: pick a SCOPE (grove or tree) → device GPS
 * auto-selects the nearest one (with manual fallback) → take a photo +
 * tag a report type + free-text notes. Everything else (manager flags,
 * latest grove stage) is read-only context that helps the worker decide
 * what to capture next.
 */
export default function Home() {
  const { workerId } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: flags } = useListManagerFlags({ status: "open", limit: 5 });
  const { data: phenology } = useListPhenologyEvents({ limit: 1 });
  const updateFlag = useUpdateManagerFlag();

  const [resolveFlagId, setResolveFlagId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  useEffect(() => {
    // No-op: keep the auth gate effect lightweight.
  }, []);

  const submitResolve = () => {
    if (resolveFlagId == null) return;
    updateFlag.mutate(
      {
        id: resolveFlagId,
        data: {
          status: "resolved",
          resolutionNotes: resolveNote || null,
          resolvedByUserId: workerId ?? null,
          actorUserId: workerId ?? null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تم حل التنبيه" });
          qc.invalidateQueries({ queryKey: getListManagerFlagsQueryKey() });
          setResolveFlagId(null);
          setResolveNote("");
        },
        onError: () => toast({ title: "تعذّر الحل", variant: "destructive" }),
      },
    );
  };

  if (!workerId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Trees className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-4">بساتين خلف</h1>
        <p className="text-muted-foreground mb-8 text-lg">تطبيق العامل الميداني</p>
        <Button size="lg" className="w-full h-14 text-lg" onClick={() => setLocation("/profile")}>
          اختر ملفك الشخصي للبدء
        </Button>
      </div>
    );
  }

  const today = new Date();
  const latestStage = phenology?.[0]?.bbchStage ?? null;

  return (
    <div className="p-4 pt-6 space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.22em] text-muted-foreground mb-1">
          تقرير جديد
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">عمّاذا تريد أن تبلّغ؟</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(today, "EEEE، d MMMM yyyy", dateLocale)}
        </p>
      </div>

      {/* Two big primary actions — the entire capture flow starts here. */}
      <div className="grid grid-cols-1 gap-3">
        <Link href="/capture/grove">
          <Card
            className="hover:border-primary/60 transition-colors cursor-pointer"
            data-testid="card-scope-grove"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <MapPinned className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-foreground">البستان كاملاً</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  تقرير عن بستان بأكمله — ري، طقس، أو معالجة.
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/capture/tree">
          <Card
            className="hover:border-primary/60 transition-colors cursor-pointer"
            data-testid="card-scope-tree"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Trees className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-foreground">شجرة محددة</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  وأنت بجوار الشجرة — مراحل النمو، استطلاع، أضرار، صور جانبية.
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Read-only context — just enough to remind the worker what to look for. */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sprout className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-wider text-primary/80">
              المرحلة الحالية للبستان
            </span>
          </div>
          <div className="text-xl font-bold">
            {latestStage
              ? STAGE_LABEL[latestStage] ?? latestStage
              : "غير معروفة — أرسل صورة لمرحلة النمو"}
          </div>
          {phenology?.[0] && (
            <div className="text-xs text-muted-foreground mt-1">
              {phenology[0].groveName ?? `بستان #${phenology[0].groveId}`} ·{" "}
              {format(new Date(phenology[0].observedAt), "d MMM", dateLocale)}
            </div>
          )}
        </CardContent>
      </Card>

      {flags && flags.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-600" /> تنبيهات المدير
            </h2>
            <Badge variant="destructive">{flags.length}</Badge>
          </div>
          <div className="space-y-2">
            {flags.slice(0, 5).map((f) => (
              <Card
                key={f.id}
                className="border-amber-300 bg-amber-50 dark:bg-amber-950/20"
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{f.flagType}</Badge>
                    <span className="text-xs uppercase tracking-wider text-amber-700">
                      {severityLabel(f.severity)}
                    </span>
                  </div>
                  <div className="text-sm">{f.message}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground font-mono">
                      {f.entityType} #{f.entityId}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResolveFlagId(f.id);
                        setResolveNote("");
                      }}
                    >
                      حلّ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Secondary nav: tasks list is still useful, but it's not the
          primary action anymore. */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Button asChild variant="outline" size="lg" className="h-14">
          <Link href="/tasks">
            <ClipboardList className="h-4 w-4 ml-1" /> المهام
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-14">
          <Link href="/capture/grove">
            <Camera className="h-4 w-4 ml-1" /> التقاط سريع
          </Link>
        </Button>
      </div>

      <Dialog open={resolveFlagId != null} onOpenChange={(o) => !o && setResolveFlagId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حلّ التنبيه</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="ماذا جرى؟ (ملاحظة اختيارية)"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveFlagId(null)}>
              إلغاء
            </Button>
            <Button onClick={submitResolve} disabled={updateFlag.isPending}>
              تحديد كمحلول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
