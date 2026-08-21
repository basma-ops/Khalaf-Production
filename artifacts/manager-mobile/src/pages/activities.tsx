import { useListActivities } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Activities() {
  const { data: activities, isLoading } = useListActivities({ limit: 20 });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <Activity className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">No recent activities.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Field Activities</h2>
      </div>

      <div className="space-y-3">
        {activities.map((activity) => (
          <div key={activity.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-foreground capitalize">{activity.activityType.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.performedAt), { addSuffix: true })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex gap-4 mt-1">
              {activity.groveName && <span>{activity.groveName}</span>}
              {activity.treeIds?.length ? <span>{activity.treeIds.length} trees</span> : null}
            </div>
            {activity.notes && <p className="mt-2 text-xs italic text-muted-foreground">"{activity.notes}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
