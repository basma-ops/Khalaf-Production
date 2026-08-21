import { useParams } from "wouter";
import { 
  useGetGroveSummary,
  getGetGroveSummaryQueryKey
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Trees, AlertTriangle, CheckSquare, Leaf, Calendar } from "lucide-react";

export default function GroveDetail() {
  const params = useParams();
  const id = Number(params.id);

  const { data: summary, isLoading } = useGetGroveSummary(id, {
    query: { enabled: !!id, queryKey: getGetGroveSummaryQueryKey(id) }
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-48 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  if (!summary) {
    return <div className="p-8 text-center text-muted-foreground font-serif">Grove not found.</div>;
  }

  const { grove } = summary;

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Trees className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold text-foreground">{grove.name}</h2>
        </div>
        <p className="text-sm text-muted-foreground">Code: {grove.groveCode} {grove.areaHa && `• ${grove.areaHa} ha`}</p>
        
        <div className="grid grid-cols-2 gap-4 pt-4 mt-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Trees</p>
            <p className="text-2xl font-bold text-foreground">{summary.treeCount}</p>
            <p className="text-[10px] text-muted-foreground">{summary.ancientTreeCount} ancient</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Health Index</p>
            <p className="text-2xl font-bold text-foreground">
              {summary.averageHealthIndex ? summary.averageHealthIndex.toFixed(2) : '--'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-destructive mb-2" />
          <p className="text-xs font-medium text-destructive/80">Open Alerts</p>
          <p className="text-xl font-bold text-destructive">{summary.openAlertCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <CheckSquare className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs font-medium text-muted-foreground">Open Tasks</p>
          <p className="text-xl font-bold text-foreground">{summary.openTaskCount}</p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Season Progress
        </h3>
        <div className="flex justify-between items-center">
          <span className="text-sm text-foreground">Harvested Trees</span>
          <span className="text-lg font-bold">{summary.harvestedTreesThisSeason}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-foreground">Recent Visits</span>
          <span className="text-lg font-bold">{summary.recentVisits}</span>
        </div>
      </section>
    </div>
  );
}
