import { Link } from "wouter";
import { 
  useGetDashboardOverview, 
  useGetDashboardHarvestSummary,
  useGetDashboardAlertBreakdown,
  useGetDashboardHeritageSignals
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf, AlertTriangle, CheckSquare, Droplets, Droplet } from "lucide-react";

export default function Overview() {
  const { data: overview, isLoading: overviewLoading } = useGetDashboardOverview();
  const { data: harvest, isLoading: harvestLoading } = useGetDashboardHarvestSummary();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlertBreakdown();
  const { data: heritage, isLoading: heritageLoading } = useGetDashboardHeritageSignals();

  if (overviewLoading || harvestLoading || alertsLoading || heritageLoading) {
    return (
      <div className="p-4 space-y-6 animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/3 bg-primary/10" />
          <Skeleton className="h-24 w-full bg-primary/5" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full bg-primary/5" />
          <Skeleton className="h-24 w-full bg-primary/5" />
        </div>
      </div>
    );
  }

  const urgentAlerts = Array.isArray(alerts?.bySeverity)
    ? (alerts!.bySeverity.find((a) => a.severity === "urgent")?.count ?? 0)
    : 0;

  return (
    <div className="p-4 pb-20 space-y-8 font-serif">
      <section className="space-y-3">
        <div className="flex justify-between items-end">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Today's Grove</h2>
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm relative overflow-hidden">
            <Leaf className="absolute -right-2 -bottom-2 h-12 w-12 text-primary/10" />
            <p className="text-xs font-medium text-muted-foreground">Active Trees</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{overview?.totalActiveTrees.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {overview?.verifiedAncientTrees} ancient verified
            </p>
          </div>

          <Link href="/tasks" className="rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-card/80 transition-colors relative overflow-hidden">
            <CheckSquare className="absolute -right-2 -bottom-2 h-12 w-12 text-primary/10" />
            <p className="text-xs font-medium text-muted-foreground">Open Tasks</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{overview?.openFieldTasks}</p>
            {overview?.urgentFieldTasks ? (
              <p className="text-[10px] text-destructive mt-1 font-medium">
                {overview?.urgentFieldTasks} urgent
              </p>
            ) : null}
          </Link>
        </div>
      </section>

      {urgentAlerts > 0 && (
        <Link href="/alerts" className="block rounded-lg border border-destructive/20 bg-destructive/5 p-4 shadow-sm hover:bg-destructive/10 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">Critical Alerts</p>
              <p className="text-xs text-destructive/80">There are {urgentAlerts} urgent satellite alerts.</p>
            </div>
          </div>
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Harvest Season</h2>
        <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Leaf className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Harvested</p>
                <p className="text-lg font-bold text-foreground">
                  {harvest?.totalEstimatedKg ? `${harvest.totalEstimatedKg.toLocaleString()} kg` : '—'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground">Trees</p>
              <p className="text-sm font-semibold text-foreground">
                {harvest?.harvestedTreesCount} / {harvest?.inProgressTreesCount ? harvest.harvestedTreesCount + harvest.inProgressTreesCount : '—'}
              </p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Droplet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Oil Produced</p>
              <p className="text-lg font-bold text-foreground">
                {harvest?.totalOilLiters ? `${harvest.totalOilLiters.toLocaleString()} L` : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {heritage && heritage.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Heritage Signals</h2>
          <div className="space-y-2">
            {heritage.slice(0, 3).map((h) => (
              <div key={h.ruleId} className="flex items-center justify-between rounded border border-border bg-card p-3 shadow-sm">
                <span className="text-sm font-medium text-foreground">{h.ruleName}</span>
                <span className="text-xs text-muted-foreground">{h.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
