import { useState } from "react";
import { useListSoilTests, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Beaker } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SoilTestsPage() {
  const [groveId, setGroveId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: groves } = useListGroves();
  const { data, isLoading } = useListSoilTests({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Beaker className="h-6 w-6 text-primary" /> Soil Tests
        </h1>
        <p className="text-muted-foreground mt-2">
          Lab results per grove — pH, EC, organic matter, and N-P-K.
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
          <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-96" /> : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sampled</TableHead>
                <TableHead>Grove</TableHead>
                <TableHead className="text-right">pH</TableHead>
                <TableHead className="text-right">EC</TableHead>
                <TableHead className="text-right">OM%</TableHead>
                <TableHead className="text-right">N (ppm)</TableHead>
                <TableHead className="text-right">P (ppm)</TableHead>
                <TableHead className="text-right">K (ppm)</TableHead>
                <TableHead>Lab</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No soil tests match your filters.</TableCell></TableRow>
              ) : computeSoilDeltas(data).map((t) => (
                <TableRow key={t.id} data-testid={`row-soil-${t.id}`}>
                  <TableCell className="whitespace-nowrap">{format(new Date(t.sampledAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>{t.groveName ?? `#${t.groveId}`}</TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.ph} delta={t.deltas.ph} digits={2} /></TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.ec} delta={t.deltas.ec} digits={2} /></TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.organicMatterPct} delta={t.deltas.organicMatterPct} digits={2} /></TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.nitrogenPpm} delta={t.deltas.nitrogenPpm} digits={0} /></TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.phosphorusPpm} delta={t.deltas.phosphorusPpm} digits={0} /></TableCell>
                  <TableCell className="text-right font-mono"><DeltaCell value={t.potassiumPpm} delta={t.deltas.potassiumPpm} digits={0} /></TableCell>
                  <TableCell>{t.labName ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate" title={t.notes ?? ""}>{t.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type SoilFieldKey = "ph" | "ec" | "organicMatterPct" | "nitrogenPpm" | "phosphorusPpm" | "potassiumPpm";
const SOIL_FIELDS: SoilFieldKey[] = ["ph", "ec", "organicMatterPct", "nitrogenPpm", "phosphorusPpm", "potassiumPpm"];

function computeSoilDeltas<T extends { id: number; groveId: number; sampledAt: string } & { [K in SoilFieldKey]?: number | null }>(
  rows: T[],
) {
  // Rows arrive newest-first. For each row find the next-older row in the same grove and diff.
  return rows.map((row, idx) => {
    const prior = rows.slice(idx + 1).find((r) => r.groveId === row.groveId);
    const deltas: Record<SoilFieldKey, number | null> = {
      ph: null, ec: null, organicMatterPct: null, nitrogenPpm: null, phosphorusPpm: null, potassiumPpm: null,
    };
    if (prior) {
      for (const k of SOIL_FIELDS) {
        const cur = row[k];
        const prv = prior[k];
        if (cur != null && prv != null) deltas[k] = (cur as number) - (prv as number);
      }
    }
    return { ...row, deltas };
  });
}

function DeltaCell({ value, delta, digits }: { value: number | null | undefined; delta: number | null; digits: number }) {
  if (value == null) return <>—</>;
  const main = digits === 0 ? Math.round(value) : value.toFixed(digits);
  if (delta == null || Math.abs(delta) < (digits === 0 ? 0.5 : Math.pow(10, -digits) / 2)) {
    return <>{main}</>;
  }
  const arrow = delta > 0 ? "▲" : "▼";
  const color = delta > 0 ? "text-emerald-600" : "text-rose-600";
  const formatted = digits === 0 ? Math.round(Math.abs(delta)).toString() : Math.abs(delta).toFixed(digits);
  return (
    <span>
      {main} <span className={`text-[10px] ${color}`}>{arrow}{formatted}</span>
    </span>
  );
}
