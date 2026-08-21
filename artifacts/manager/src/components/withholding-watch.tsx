import { useGetWithholdingWatch } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  targetDate?: string;
  groveId?: number;
  treeId?: number;
  windowDays?: number;
  compact?: boolean;
}

export function WithholdingWatch({ targetDate, groveId, treeId, windowDays, compact = false }: Props) {
  const date = targetDate ?? new Date().toISOString().slice(0, 10);
  const effectiveWindow = windowDays ?? (compact ? 14 : 1);
  const { data, isLoading } = useGetWithholdingWatch({ targetDate: date, groveId, treeId, windowDays: effectiveWindow });

  if (isLoading) return <Skeleton className="h-32" />;
  const entries = data ?? [];

  if (compact) {
    const groveCount = new Set(entries.map((e) => e.groveId)).size;
    return (
      <Card data-testid="card-withholding-watch">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> Withholding next {effectiveWindow}d
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{entries.length}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {entries.length === 0 ? "No treatments restricting harvest." : `${entries.length} treatment(s) across ${groveCount} grove(s)`}
          </p>
          {entries.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs max-h-40 overflow-y-auto">
              {entries.slice(0, 6).map((e) => (
                <li key={e.treatmentId} className="flex justify-between gap-2 border-b border-border/40 pb-1 last:border-0">
                  <span className="truncate">
                    <span className="font-medium">{e.product}</span>
                    <span className="text-muted-foreground"> · {e.groveName ?? `#${e.groveId}`}</span>
                    {e.treeIds && e.treeIds.length > 0 ? <span className="text-muted-foreground"> · {e.treeIds.length} tree</span> : null}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 whitespace-nowrap">{e.daysRemaining}d</span>
                </li>
              ))}
              {entries.length > 6 && <li className="text-muted-foreground">+{entries.length - 6} more…</li>}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-withholding-watch-detail">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          Withholding watch — target {date}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No treatments are blocking harvest on this date.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.treatmentId} className="flex items-start justify-between gap-3 p-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20" data-testid={`withholding-entry-${e.treatmentId}`}>
                <div>
                  <div className="font-semibold">{e.product} <span className="text-xs font-normal text-muted-foreground">· {e.treatmentKind}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {e.groveName ?? `Grove #${e.groveId}`}
                    {e.treeIds && e.treeIds.length > 0 ? ` · ${e.treeIds.length} tree(s)` : ""}
                    {" · applied "}{format(new Date(e.appliedAt), "MMM d")}
                    {" · ends "}{format(new Date(e.withholdingEndsAt), "MMM d")}
                  </div>
                </div>
                <Badge className="bg-amber-500 text-amber-50 whitespace-nowrap">{e.daysRemaining}d left</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
