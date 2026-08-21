import { useState, useEffect } from "react";
import { 
  useListManagerFlags, 
  useCreateManagerFlag,
  useListGroves,
  getListManagerFlagsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Flag, ChevronRight, Plus, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Flags() {
  const [showNew, setShowNew] = useState(false);
  const [flagType, setFlagType] = useState("field_hazard");
  const [severity, setSeverity] = useState("medium");
  const [message, setMessage] = useState("");

  const [groveId, setGroveId] = useState<number | "">("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: flags, isLoading } = useListManagerFlags({ status: "open" });
  const { data: groves } = useListGroves();
  const createFlag = useCreateManagerFlag();

  useEffect(() => {
    if (groveId === "" && groves && groves.length > 0) {
      setGroveId(groves[0].id);
    }
  }, [groves, groveId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groveId) {
      toast({ variant: "destructive", title: "Choose a grove" });
      return;
    }
    try {
      await createFlag.mutateAsync({
        data: {
          entityType: "grove",
          entityId: Number(groveId),
          flagType,
          severity,
          message,
        }
      });
      toast({ title: "Flag raised" });
      setShowNew(false);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: getListManagerFlagsQueryKey() });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to raise flag" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Manager Flags</h2>
        <button 
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
        >
          {showNew ? "Cancel" : <><Plus className="h-3 w-3" /> Raise Flag</>}
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3 mb-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Grove</label>
            <select value={groveId} onChange={e => setGroveId(Number(e.target.value))} className="w-full rounded border border-input p-2 text-sm bg-background">
              {groves?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Flag Type</label>
            <select value={flagType} onChange={e => setFlagType(e.target.value)} className="w-full rounded border border-input p-2 text-sm bg-background">
              <option value="field_hazard">Field Hazard</option>
              <option value="equipment_issue">Equipment Issue</option>
              <option value="worker_incident">Worker Incident</option>
              <option value="harvest_blocker">Harvest Blocker</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full rounded border border-input p-2 text-sm bg-background">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} required className="w-full rounded border border-input p-2 text-sm bg-background" rows={2} />
          </div>
          <button 
            type="submit"
            disabled={createFlag.isPending || !message}
            className="w-full rounded bg-primary p-2 text-sm font-medium text-primary-foreground flex justify-center items-center gap-2"
          >
            {createFlag.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Submit Flag
          </button>
        </form>
      )}

      {!flags?.length ? (
        <div className="flex h-[40vh] flex-col items-center justify-center text-center">
          <Flag className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-foreground">No open flags.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground capitalize">
                    {flag.flagType.replace(/_/g, " ")}
                  </span>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium",
                    flag.severity === "high" || flag.severity === "urgent" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  )}>
                    {flag.severity}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {flag.message && <p className="mb-1 italic">"{flag.message}"</p>}
                  <span>{formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
