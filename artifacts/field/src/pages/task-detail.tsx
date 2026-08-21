import { useRoute, useLocation, Link } from "wouter";
import { useGetTask, useUpdateTask, getListTasksQueryKey, getGetTaskQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle2, Clock, MapPin, AlertTriangle, Camera } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PhotoCapture } from "@/components/photo-capture";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinalizeUploadRequestPurpose } from "@workspace/api-client-react";
import { dateLocale, priorityLabel, statusLabel } from "@/lib/i18n";
import { enqueue } from "@/lib/offline-db";

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { data: task, isLoading } = useGetTask(id);
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { workerId } = useAuth();
  const [notes, setNotes] = useState("");
  const [photoPurpose, setPhotoPurpose] = useState<FinalizeUploadRequestPurpose>("general");
  const [photoUploading, setPhotoUploading] = useState(false);

  if (isLoading) return <div className="p-8 text-center">جارٍ التحميل...</div>;
  if (!task) return <div className="p-8 text-center">المهمة غير موجودة</div>;

  const handleUpdateStatus = (status: 'in_progress' | 'completed') => {
    // Offline-first: when the device is offline (or the call fails for
    // a network reason) we drop the status change into the IndexedDB
    // outbox and confirm it visually. The drainer in `offline-drain.ts`
    // re-issues the PATCH as soon as connectivity returns.
    const queueOffline = async () => {
      await enqueue({ kind: "task-status", taskId: id, status });
      toast({
        title: "تم الحفظ بدون شبكة",
        description: `سيُحدّث الخادم إلى ${statusLabel(status)} عند عودة الاتصال`,
      });
      if (status === 'completed') setLocation('/tasks');
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queueOffline();
      return;
    }
    updateTask.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
          toast({ title: `تم تحديث المهمة إلى ${statusLabel(status)}` });
          if (status === 'completed') setLocation('/tasks');
        },
        onError: (err: unknown) => {
          // Only fall back to the outbox for transport-level failures
          // (offline, fetch TypeError, 5xx, timeout). Server-side
          // errors like 4xx must surface to the worker so they don't
          // get queued and re-tried in a loop.
          const offline = typeof navigator !== "undefined" && navigator.onLine === false;
          const isNetworkError =
            err instanceof TypeError ||
            (err as { name?: string })?.name === "AbortError" ||
            (err as { name?: string })?.name === "TimeoutError";
          const status = (err as { status?: number; response?: { status?: number } })?.status
            ?? (err as { response?: { status?: number } })?.response?.status;
          const isServerError = typeof status === "number" && status >= 500;
          if (offline || isNetworkError || isServerError) {
            queueOffline();
          } else {
            toast({
              title: "تعذّر تحديث المهمة",
              description: (err as Error)?.message ?? "حدث خطأ غير متوقع",
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setLocation('/tasks')}>
          <ArrowLeft className="h-6 w-6 rotate-180" />
        </Button>
        <h1 className="text-xl font-bold truncate">تفاصيل المهمة</h1>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <div className="flex gap-2 mb-3">
            <Badge variant={task.status === 'completed' ? 'secondary' : 'default'} className="text-sm px-3 py-1">
              {statusLabel(task.status)}
            </Badge>
            <Badge variant="outline" className={
              (task.priority as string) === 'critical' ? 'border-destructive text-destructive' :
              task.priority === 'high' ? 'border-orange-500 text-orange-500' :
              'border-muted-foreground text-muted-foreground'
            }>
              {priorityLabel(task.priority)}
            </Badge>
          </div>
          <h2 className="text-2xl font-bold mb-2">{task.title}</h2>
          <p className="text-lg text-muted-foreground">{task.description}</p>
        </div>

        <Card>
          <CardContent className="p-0 divide-y border-border">
            {task.dueDate && (
              <div className="flex items-center gap-3 p-4">
                <div className="bg-primary/10 p-2 rounded-full text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">تاريخ الاستحقاق</p>
                  <p className="font-semibold text-lg">{format(new Date(task.dueDate), "d MMMM yyyy", dateLocale)}</p>
                </div>
              </div>
            )}

            {task.groveName && (
              <div className="flex items-center gap-3 p-4">
                <div className="bg-primary/10 p-2 rounded-full text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">الموقع</p>
                  <p className="font-semibold text-lg">{task.groveName}</p>
                  {task.treeCode && <p className="text-primary font-medium">الشجرة: {task.treeCode}</p>}
                </div>
              </div>
            )}

            {task.satelliteAlertId && (
              <Link href="/alerts" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
                <div className="bg-amber-100 dark:bg-amber-900/50 p-2 rounded-full text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">تنبيه مرتبط</p>
                  <p className="font-semibold text-primary">عرض تفاصيل تنبيه القمر الصناعي ←</p>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" /> أضف صورة للشجرة (تحليل تلقائي)
            </h3>
            <p className="text-xs text-muted-foreground">
              تُحفظ الصور في المكتبة قبل أي حفظ للنموذج. التحليل التلقائي يشير إلى{" "}
              <span className="font-medium text-amber-700">إشارات محتملة</span> فقط — وليست مؤكدة.
            </p>
            <Select value={photoPurpose} onValueChange={(v) => setPhotoPurpose(v as FinalizeUploadRequestPurpose)}>
              <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">عام</SelectItem>
                <SelectItem value="pest">علامات آفة</SelectItem>
                <SelectItem value="disease">علامات مرض</SelectItem>
                <SelectItem value="damage">أضرار</SelectItem>
                <SelectItem value="growth">نمو</SelectItem>
                <SelectItem value="pruning_before">تقليم — قبل</SelectItem>
                <SelectItem value="pruning_after">تقليم — بعد</SelectItem>
              </SelectContent>
            </Select>
            <PhotoCapture
              purpose={photoPurpose}
              treeId={task.treeId ?? null}
              groveId={task.groveId ?? null}
              workerId={workerId}
              linkedEntityType="task"
              linkedEntityId={task.id}
              onPendingChange={setPhotoUploading}
            />
          </CardContent>
        </Card>

        {task.status !== 'completed' && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <label className="text-sm font-medium mb-2 block">ملاحظات ميدانية (اختيارية)</label>
              <Textarea
                placeholder="أضف ملاحظات قبل إكمال المهمة..."
                className="min-h-[100px] text-lg resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="grid gap-3">
              {task.status === 'open' && (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-16 text-lg w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => handleUpdateStatus('in_progress')}
                  disabled={updateTask.isPending || photoUploading}
                >
                  بدء التنفيذ
                </Button>
              )}

              <Button
                size="lg"
                className="h-16 text-lg w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleUpdateStatus('completed')}
                disabled={updateTask.isPending || photoUploading}
              >
                <CheckCircle2 className="ml-2 h-6 w-6" />
                {photoUploading ? "جارٍ حفظ الصورة…" : "إكمال المهمة"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
