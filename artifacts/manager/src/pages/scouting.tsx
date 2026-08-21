import { useState } from "react";
import { useListPestDiseaseFinds, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Bug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SEVERITY_COLOR: Record<string, string> = {
  trace: "bg-slate-200 text-slate-800",
  low: "bg-emerald-200 text-emerald-900",
  medium: "bg-yellow-200 text-yellow-900",
  high: "bg-orange-300 text-orange-950",
  severe: "bg-red-400 text-red-950",
};

export default function Scouting() {
  const [groveId, setGroveId] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [species, setSpecies] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: groves } = useListGroves();
  const { data, isLoading } = useListPestDiseaseFinds({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    severity: severity !== "all" ? severity : undefined,
    speciesCode: species !== "all" ? species : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const SPECIES = ["olive_fruit_fly", "olive_moth", "olive_psyllid", "black_scale", "peacock_spot", "anthracnose", "verticillium", "olive_knot", "other"];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Bug className="h-6 w-6 text-primary" /> Pest & Disease Scouting
        </h1>
        <p className="text-muted-foreground mt-2">Worker observations of pests, diseases, and damage finds.</p>
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
            <Label className="text-xs">Species</Label>
            <Select value={species} onValueChange={setSpecies}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All species</SelectItem>
                {SPECIES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["trace", "low", "medium", "high", "severe"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <TableHead>Grove / Tree</TableHead>
                <TableHead>Species</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>% Affected</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No finds match your filters.</TableCell></TableRow>
              ) : data.map((f) => (
                <TableRow key={f.id} data-testid={`row-find-${f.id}`}>
                  <TableCell className="whitespace-nowrap">{format(new Date(f.observedAt), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell>{f.workerName ?? `#${f.workerId}`}</TableCell>
                  <TableCell>{f.groveName ?? `#${f.groveId}`}{f.treeCode ? ` · ${f.treeCode}` : ""}</TableCell>
                  <TableCell><Badge variant="outline">{f.speciesCode}</Badge></TableCell>
                  <TableCell><Badge className={SEVERITY_COLOR[f.severity] ?? ""}>{f.severity}</Badge></TableCell>
                  <TableCell>{f.percentAffected != null ? `${f.percentAffected.toFixed(0)}%` : "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{f.recommendedAction ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate" title={f.notes ?? ""}>{f.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
