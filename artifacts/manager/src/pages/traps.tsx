import { useState } from "react";
import { useListTraps, useListTrapCounts, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function TrapsPage() {
  const [groveId, setGroveId] = useState("all");
  const { data: groves } = useListGroves();
  const filterGrove = groveId !== "all" ? parseInt(groveId, 10) : undefined;
  const { data: traps, isLoading: trapsLoading } = useListTraps({ groveId: filterGrove });
  const { data: counts } = useListTrapCounts({ groveId: filterGrove, limit: 100 });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-primary" /> Trap Network
        </h1>
        <p className="text-muted-foreground mt-2">Pheromone, sticky and bait traps with periodic catch counts.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Grove</Label>
            <Select value={groveId} onValueChange={setGroveId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groves</SelectItem>
                {(groves ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Traps</CardTitle></CardHeader>
        <CardContent>
          {trapsLoading ? <Skeleton className="h-40" /> : (!traps || traps.length === 0) ? (
            <p className="text-sm text-muted-foreground">No traps registered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Grove</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead>Latest count</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traps.map((t) => {
                  const lastDate = t.latestCountDate ? new Date(t.latestCountDate) : null;
                  const overdueDays = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
                  const overdue = !t.retiredAt && (overdueDays === null || overdueDays > 14);
                  return (
                    <TableRow key={t.id} data-testid={`row-trap-${t.id}`} className={overdue ? "bg-amber-50 dark:bg-amber-950/20" : undefined}>
                      <TableCell className="font-mono">{t.code}</TableCell>
                      <TableCell><Badge variant="outline">{t.kind}</Badge></TableCell>
                      <TableCell>{t.groveName ?? `#${t.groveId}`}</TableCell>
                      <TableCell>{t.targetSpecies ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(t.installedAt), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        {t.latestCount != null
                          ? <span><strong>{t.latestCount}</strong> <span className="text-xs text-muted-foreground">{lastDate ? format(lastDate, "MMM d") : ""}</span></span>
                          : <span className="text-muted-foreground">never</span>}
                      </TableCell>
                      <TableCell>
                        {t.retiredAt ? <Badge variant="secondary">retired</Badge> :
                          overdue ? <Badge className="bg-amber-500 text-amber-50">overdue {overdueDays === null ? "" : `${overdueDays}d`}</Badge> :
                          <Badge>active</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent counts</CardTitle></CardHeader>
        <CardContent>
          {(!counts || counts.length === 0) ? (
            <p className="text-sm text-muted-foreground">No counts logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Trap</TableHead>
                  <TableHead>Grove</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => (
                  <TableRow key={c.id} data-testid={`row-trap-count-${c.id}`}>
                    <TableCell className="whitespace-nowrap">{format(new Date(c.countDate), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell className="font-mono">{c.trapCode ?? `#${c.trapId}`}</TableCell>
                    <TableCell>{c.groveName ?? "—"}</TableCell>
                    <TableCell>{c.workerName ?? `#${c.workerId}`}</TableCell>
                    <TableCell className="text-right font-bold">{c.count}</TableCell>
                    <TableCell><Badge variant="outline">{c.source}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate" title={c.notes ?? ""}>{c.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
