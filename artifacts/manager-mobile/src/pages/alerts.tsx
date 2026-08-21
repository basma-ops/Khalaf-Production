import { Link } from "wouter";
import { useListSatelliteAlerts } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function Alerts() {
  const { data: alerts, isLoading } = useListSatelliteAlerts({ status: "open" });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!alerts?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">Quiet here.</p>
        <p className="text-sm text-muted-foreground">No open alerts in the grove.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Open Alerts</h2>
        <span className="text-xs text-muted-foreground">{alerts.length} total</span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            href={`/alerts/${alert.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-card/80 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    alert.severity === "urgent" ? "bg-destructive" :
                    alert.severity === "high" ? "bg-orange-500" :
                    alert.severity === "medium" ? "bg-yellow-500" : "bg-primary"
                  )}
                />
                <span className="text-sm font-semibold text-foreground">
                  {alert.alertType.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{alert.groveName}</span>
                {alert.treeCode && (
                  <>
                    <span>•</span>
                    <span>Tree {alert.treeCode}</span>
                  </>
                )}
                <span>•</span>
                <span>{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
