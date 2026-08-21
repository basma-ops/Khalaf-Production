import { useState } from "react";
import { 
  useListHarvestEvents, 
  useGetDashboardHarvestSummary,
  useCreateHarvestBox,
  useCreateHarvestMaturitySample,
  getGetDashboardHarvestSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Leaf, Box, Beaker, Plus, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Harvest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardHarvestSummary();
  const { data: events, isLoading: loadingEvents } = useListHarvestEvents();

  const createBox = useCreateHarvestBox();
  const createSample = useCreateHarvestMaturitySample();

  const [showLogBox, setShowLogBox] = useState(false);
  const [boxWeight, setBoxWeight] = useState("");

  const handleLogBox = async (e: React.FormEvent) => {
    e.preventDefault();
    const firstEvent = events?.[0];
    if (!firstEvent || !boxWeight) {
      toast({ variant: "destructive", title: "Need an active harvest event" });
      return;
    }
    try {
      await createBox.mutateAsync({
        data: {
          harvestEventId: firstEvent.id,
          boxCode: `BOX-${Date.now().toString().slice(-4)}`,
          boxSequenceNumber: 1,
          estimatedWeightKg: parseFloat(boxWeight),
        }
      });
      toast({ title: "Box logged" });
      setShowLogBox(false);
      setBoxWeight("");
      queryClient.invalidateQueries({ queryKey: getGetDashboardHarvestSummaryQueryKey() });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to log box" });
    }
  };

  if (loadingSummary || loadingEvents) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-48 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <div className="flex gap-2">
        <button 
          onClick={() => setShowLogBox(!showLogBox)}
          className="flex-1 flex justify-center items-center gap-2 rounded-lg bg-primary p-3 text-sm font-medium text-primary-foreground"
        >
          <Box className="h-4 w-4" /> Log Box
        </button>
        {/* Sample button is a placeholder action */}
        <button className="flex-1 flex justify-center items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-card/80">
          <Beaker className="h-4 w-4 text-primary" /> Maturity Sample
        </button>
      </div>

      {showLogBox && (
        <form onSubmit={handleLogBox} className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Estimated Weight (kg)</label>
            <input 
              type="number" 
              step="0.1" 
              required 
              value={boxWeight} 
              onChange={e => setBoxWeight(e.target.value)} 
              className="w-full rounded border border-input p-2 text-sm bg-background" 
              placeholder="e.g. 20.5"
            />
          </div>
          <button 
            type="submit"
            disabled={createBox.isPending || !boxWeight}
            className="w-full rounded bg-primary p-2 text-sm font-medium text-primary-foreground flex justify-center items-center gap-2"
          >
            {createBox.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save Box
          </button>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Season Progress</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Harvested Trees</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary?.harvestedTreesCount || 0}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Boxes Collected</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {summary?.totalBoxes || 0}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent Harvests</h2>
        {!events?.length ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-lg border border-border border-dashed">
            <Calendar className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No recent harvest events.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Leaf className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Tree {event.treeCode}
                    </span>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded-full">
                    {event.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Grove: {event.groveName}</p>
                  <p>{formatDistanceToNow(new Date(event.harvestDate), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
