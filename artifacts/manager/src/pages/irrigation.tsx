import { useState } from "react";
import { useListIrrigationEvents, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Droplets } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function IrrigationPage() {
  const [groveId, setGroveId] = useState("all");
  const [method, setMethod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: groves } = useListGroves();
  const { data, isLoading } = useListIrrigationEvents({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    method: method !== "all" ? method : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Droplets className="h-6 w-6 text-primary" /> Irrigation Log
        </h1>
        <p className="text-muted-foreground mt-2">
          Khalaf groves are rain-fed (Ba'al) — irrigation events here cover supplemental watering during establishment or extreme drought.
        </p>
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
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {["drip", "sprinkler", "flood", "manual_watering", "supplemental", "other"].map((m) => (
                  <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-96" /> : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Grove</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Volume (L)</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No irrigation events match your filters.</TableCell></TableRow>
              ) : data.map((e) => (
                <TableRow key={e.id} data-testid={`row-irrigation-${e.id}`}>
                  <TableCell className="whitespace-nowrap">{format(new Date(e.occurredAt), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell>{e.workerName ?? `#${e.workerId}`}</TableCell>
                  <TableCell>{e.groveName ?? `#${e.groveId}`}</TableCell>
                  <TableCell><Badge variant="outline">{e.method.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{e.volumeLitres.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{e.durationMinutes != null ? `${e.durationMinutes} min` : "—"}</TableCell>
                  <TableCell className="max-w-xs truncate" title={e.notes ?? ""}>{e.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Cumulative volumes by grove (filtered range)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.reduce((acc, e) => {
                const key = e.groveName ?? `#${e.groveId}`;
                acc[key] = (acc[key] ?? 0) + e.volumeLitres;
                return acc;
              }, {} as Record<string, number>)).map(([k, v]) => (
                <div key={k} className="border rounded-md p-3" data-testid={`total-${k}`}>
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="text-xl font-bold font-mono">{v.toLocaleString()} L</div>
                </div>
              ))}
              <div className="border-2 border-primary rounded-md p-3">
                <div className="text-xs text-primary font-semibold">TOTAL</div>
                <div className="text-xl font-bold font-mono">{data.reduce((s, e) => s + e.volumeLitres, 0).toLocaleString()} L</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
