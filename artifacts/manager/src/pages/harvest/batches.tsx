import { useState } from "react";
import { useListHarvestBatches, type HarvestBatch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Boxes, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ManagerFlagButton } from "@/components/manager-flag-dialog";
import { format } from "date-fns";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
}

function BatchDetail({ batch }: { batch: HarvestBatch }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Batch</div>
          <div className="font-mono text-lg font-semibold">{batch.batchCode ?? `#${batch.id}`}</div>
        </div>
        <ManagerFlagButton entityType="batch" entityId={batch.id} label="Flag for OM" />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs uppercase">Status</div>
          <div className="font-medium">{batch.status ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase">Grove</div>
          <div className="font-medium">{batch.groveName ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase">Measured weight</div>
          <div className="font-medium">{batch.totalMeasuredWeightKg != null ? `${batch.totalMeasuredWeightKg} kg` : "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase">Batch date</div>
          <div className="font-medium">{formatDate(batch.batchDate)}</div>
        </div>
      </div>
      {batch.notes && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
          <p className="text-sm">{batch.notes}</p>
        </div>
      )}
    </div>
  );
}

export default function HarvestBatches() {
  const { data, isLoading } = useListHarvestBatches();
  const [selected, setSelected] = useState<HarvestBatch | null>(null);
  const batches: HarvestBatch[] = data ?? [];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <Boxes className="h-6 w-6 text-primary" /> Harvest Batches
        </h1>
        <p className="text-muted-foreground mt-2">
          Click a batch to see details, raise a flag for the Operational Manager, and track follow-ups.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : batches.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No harvest batches yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <Card
              key={b.id}
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelected(b)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="font-mono text-base">{b.batchCode ?? `#${b.id}`}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {b.status && <Badge variant="outline">{b.status}</Badge>}
                  {b.groveName && <Badge variant="outline">{b.groveName}</Badge>}
                </div>
                {b.totalMeasuredWeightKg != null && <div>{b.totalMeasuredWeightKg} kg</div>}
                {b.batchDate && (
                  <div className="text-xs text-muted-foreground">{formatDate(b.batchDate)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batch detail</DialogTitle></DialogHeader>
          {selected && <BatchDetail batch={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
