import { useListOilBatches, useListLabResults, useGetWithholdingWatch } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplet, Beaker, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Oil() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: batches, isLoading: loadingBatches } = useListOilBatches();
  const { data: labs, isLoading: loadingLabs } = useListLabResults();
  const { data: withholding, isLoading: loadingWatch } = useGetWithholdingWatch({ targetDate: today, windowDays: 30 });

  if (loadingBatches || loadingLabs || loadingWatch) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-48 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  const activeWithholding = withholding?.filter(w => w.daysRemaining > 0) || [];

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      {activeWithholding.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Withholding Watch
          </h2>
          <div className="space-y-2">
            {activeWithholding.map(w => (
              <div key={`${w.treatmentId}-${w.groveId}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
                <p className="text-sm font-medium text-destructive">{w.groveName} — {w.product}</p>
                <p className="text-xs text-destructive/80 mt-1">Safe harvest after: {new Date(w.withholdingEndsAt).toLocaleDateString()} ({w.daysRemaining}d remaining)</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Droplet className="h-4 w-4" /> Recent Oil Batches
        </h2>
        <div className="space-y-3">
          {batches?.map((batch) => (
            <div key={batch.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="font-bold text-foreground">{batch.oilBatchCode}</span>
                <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded-full">
                  {batch.status?.replace(/_/g, " ") || 'Pending'}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span>Volume: {batch.volumeLiters} L</span>
                <span>{new Date(batch.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Beaker className="h-4 w-4" /> Lab Results
        </h2>
        <div className="space-y-3">
          {labs?.map((lab) => (
            <div key={lab.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-semibold text-foreground">{lab.batchName || `Sample #${lab.id}`}</span>
                {lab.sampleDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(lab.sampleDate), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Acidity: {lab.acidity != null ? `${lab.acidity}%` : '--'}</div>
                <div>Peroxide: {lab.peroxideValue != null ? lab.peroxideValue : '--'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
