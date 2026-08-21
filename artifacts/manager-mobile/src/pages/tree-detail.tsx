import { useParams } from "wouter";
import { 
  useGetTree, 
  useGetTreeTimeline,
  getGetTreeQueryKey,
  getGetTreeTimelineQueryKey
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf, AlertTriangle, Calendar, MapPin, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function TreeDetail() {
  const params = useParams();
  const id = Number(params.id);

  const { data: tree, isLoading: loadingTree } = useGetTree(id, {
    query: { enabled: !!id, queryKey: getGetTreeQueryKey(id) }
  });

  const { data: timeline, isLoading: loadingTimeline } = useGetTreeTimeline(id, {
    query: { enabled: !!id, queryKey: getGetTreeTimelineQueryKey(id) }
  });

  if (loadingTree || loadingTimeline) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-48 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  if (!tree) {
    return <div className="p-8 text-center text-muted-foreground font-serif">Tree not found.</div>;
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Leaf className="h-5 w-5 text-primary" />
              Tree {tree.treeCode}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {tree.groveName}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-2 py-1 bg-muted rounded-md text-xs font-medium capitalize">
              {tree.variety}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Heritage Status</p>
            <p className="text-sm font-medium capitalize">{tree.ancientStatus}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alert Status</p>
            <p className="text-sm font-medium capitalize flex items-center gap-1">
              {tree.currentAlertStatus !== "none" && <AlertTriangle className="h-3 w-3 text-destructive" />}
              {tree.currentAlertStatus}
            </p>
          </div>
        </div>
      </section>

      {timeline?.observations && timeline.observations.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Observations
          </h3>
          <div className="space-y-3">
            {timeline.observations.slice(0, 3).map(obs => (
              <div key={obs.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-foreground">
                    Health Index: {obs.healthIndex ? obs.healthIndex.toFixed(2) : '--'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(obs.observationDate), { addSuffix: true })}
                  </span>
                </div>
                {obs.recommendedAction && (
                  <p className="text-xs text-muted-foreground mt-1">Action: {obs.recommendedAction}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
