import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetSatelliteAlert, 
  useUpdateSatelliteAlert,
  useCreateTaskFromAnalysis, // Used loosely as a reference for "create task from alert" or we can use useCreateTask
  useCreateTask,
  getGetSatelliteAlertQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, MapPin, Leaf, Check, Plus, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function AlertDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: alert, isLoading } = useGetSatelliteAlert(id, {
    query: { enabled: !!id, queryKey: getGetSatelliteAlertQueryKey(id) }
  });

  const updateAlert = useUpdateSatelliteAlert();
  const createTask = useCreateTask();

  const handleStatusUpdate = async (status: "resolved" | "dismissed") => {
    if (!alert) return;
    try {
      await updateAlert.mutateAsync({ 
        id, 
        data: { status: status as any, resolvedAt: new Date().toISOString() } 
      });
      queryClient.invalidateQueries({ queryKey: getGetSatelliteAlertQueryKey(id) });
      setLocation("/alerts");
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to update alert" });
    }
  };

  const handleCreateTask = async () => {
    if (!alert) return;
    try {
      const res = await createTask.mutateAsync({
        data: {
          title: `Investigate: ${alert.alertType.replace(/_/g, " ")}`,
          taskType: "tree_inspection",
          priority: alert.severity === "urgent" ? "urgent" : "high",
          groveId: alert.groveId,
          treeId: alert.treeId,
          satelliteAlertId: alert.id,
          notes: `Generated from alert ${alert.alertCode}`,
        }
      });
      if (res?.id) {
        setLocation(`/tasks/${res.id}`);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to create task" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-24 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  if (!alert) {
    return <div className="p-8 text-center text-muted-foreground font-serif">Alert not found.</div>;
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn(
                "h-5 w-5",
                alert.severity === "urgent" ? "text-destructive" : "text-orange-500"
              )} />
              <h2 className="text-lg font-bold text-foreground capitalize">
                {alert.alertType.replace(/_/g, " ")}
              </h2>
            </div>
            <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded-full">
              {alert.status}
            </span>
          </div>
          
          <div className="text-sm text-muted-foreground space-y-2 mt-4">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {alert.groveName}
            </p>
            {alert.treeCode && (
              <p className="flex items-center gap-2">
                <Leaf className="h-4 w-4" /> Tree {alert.treeCode}
              </p>
            )}
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Detected {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {alert.recommendedTask && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Recommendation</p>
            <p className="text-sm text-foreground">{alert.recommendedTask}</p>
          </div>
        )}
      </section>

      {alert.status !== "resolved" && alert.status !== "dismissed" && (
        <section className="space-y-3">
          <button 
            onClick={handleCreateTask}
            disabled={createTask.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary p-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create Investigation Task
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => handleStatusUpdate("resolved")}
              disabled={updateAlert.isPending}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-card/80 disabled:opacity-50"
            >
              <Check className="h-4 w-4 text-primary" /> Resolve
            </button>
            <button 
              onClick={() => handleStatusUpdate("dismissed")}
              disabled={updateAlert.isPending}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-card/80 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
