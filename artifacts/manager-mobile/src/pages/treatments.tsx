import { useListTreatments } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Treatments() {
  const { data: treatments, isLoading } = useListTreatments({ limit: 20 });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!treatments?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <Beaker className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">No treatments recorded.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Grove Treatments</h2>
      </div>

      <div className="space-y-3">
        {treatments.map((treatment) => (
          <div key={treatment.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="font-semibold text-foreground block">{treatment.treatmentKind}</span>
                <span className="text-xs text-muted-foreground">{treatment.product}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(treatment.appliedAt), { addSuffix: true })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex gap-4 mt-2">
              <span>Grove: {treatment.groveName ?? `#${treatment.groveId}`}</span>
              {treatment.treeIds?.length ? <span>{treatment.treeIds.length} trees</span> : null}
            </div>
            {treatment.notes && <p className="mt-2 text-xs italic text-muted-foreground">"{treatment.notes}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
