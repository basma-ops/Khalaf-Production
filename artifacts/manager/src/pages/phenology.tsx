import { useState } from "react";
import {
  useListGroves,
  useGetGrovePhenologySummary,
  useListPhenologyEvents,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STAGE_LABELS: Record<string, string> = {
  sprouting: "Sprouting",
  leaf_development: "Leaf development",
  inflorescence_emergence: "Inflorescence emergence",
  flowering: "Flowering",
  fruit_development: "Fruit development",
  ripening: "Ripening",
  senescence: "Senescence",
  dormancy: "Dormancy",
};

const STAGE_COLOR: Record<string, string> = {
  sprouting: "bg-emerald-500",
  leaf_development: "bg-green-500",
  inflorescence_emergence: "bg-lime-500",
  flowering: "bg-yellow-500",
  fruit_development: "bg-amber-500",
  ripening: "bg-orange-500",
  senescence: "bg-rose-500",
  dormancy: "bg-slate-400",
};

function GroveTimeline({ groveId, groveName }: { groveId: number; groveName: string }) {
  const { data, isLoading } = useGetGrovePhenologySummary(groveId);
  if (isLoading) return <Skeleton className="h-32" />;
  const events = data?.events ?? [];

  const transitions: typeof events = [];
  let lastStage: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.bbchStage !== lastStage) {
      transitions.unshift(e);
      lastStage = e.bbchStage;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="font-serif">{groveName}</span>
          {data?.latestStage && (
            <Badge className={`${STAGE_COLOR[data.latestStage] ?? "bg-muted"} text-white`}>
              {STAGE_LABELS[data.latestStage] ?? data.latestStage}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No observations yet.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Stage transitions</div>
              <div className="flex flex-wrap items-center gap-2">
                {transitions.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <div className={`h-3 w-3 rounded-full ${STAGE_COLOR[t.bbchStage] ?? "bg-muted"}`} />
                      <div className="text-xs mt-1 font-mono">{format(new Date(t.observedAt), "MMM d")}</div>
                      <div className="text-[10px] text-muted-foreground max-w-[80px] text-center">
                        {STAGE_LABELS[t.bbchStage] ?? t.bbchStage}
                      </div>
                    </div>
                    {i < transitions.length - 1 && <div className="text-muted-foreground">→</div>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recent observations</div>
              <ul className="space-y-1">
                {events.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STAGE_COLOR[e.bbchStage] ?? "bg-muted"}`} />
                    <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{format(new Date(e.observedAt), "MMM d")}</span>
                    <span className="font-medium">{STAGE_LABELS[e.bbchStage] ?? e.bbchStage}</span>
                    {e.bbchCode && <span className="font-mono text-xs text-muted-foreground">[{e.bbchCode}]</span>}
                    {e.coveragePercent != null && <span className="text-xs text-muted-foreground">· {Math.round(e.coveragePercent)}%</span>}
                    {e.treeCode && <span className="text-xs text-muted-foreground font-mono">· {e.treeCode}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">{e.workerName ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Phenology() {
  const { data: groves, isLoading } = useListGroves();
  const [stage, setStage] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: filtered } = useListPhenologyEvents({
    bbchStage: stage !== "all" ? stage : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    limit: 50,
  });

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary" />
          Phenology (BBCH)
        </h1>
        <p className="text-muted-foreground mt-2">
          Per-grove timeline of BBCH stage transitions — drives the operational management plan.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Stage</label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {Object.entries(STAGE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">From</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">To</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
          {(stage !== "all" || fromDate || toDate) && (
            <Badge variant="outline">{filtered?.length ?? 0} matching observations</Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(groves ?? []).map((g) => (
          <GroveTimeline key={g.id} groveId={g.id} groveName={g.name} />
        ))}
      </div>

      {(groves ?? []).length === 0 && (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No groves loaded yet.</CardContent></Card>
      )}
    </div>
  );
}
