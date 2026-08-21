import { useState } from "react";
import { useListTreatments, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Beaker, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_LABELS: Record<string, string> = {
  organic_spray: "Organic spray",
  mineral: "Mineral",
  biological: "Biological",
  mechanical: "Mechanical",
  sanitation: "Sanitation",
  foliar_nutrient: "Foliar nutrient",
  other: "Other",
};

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function TreatmentsPage() {
  const [groveId, setGroveId] = useState("all");
  const [kind, setKind] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: groves } = useListGroves();
  const { data: rawData, isLoading } = useListTreatments({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    treatmentKind: kind !== "all" ? kind : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const data = (rawData ?? []).filter((t) => {
    if (productFilter && !(t.product ?? "").toLowerCase().includes(productFilter.toLowerCase())) return false;
    if (activeFilter && !(t.activeIngredient ?? "").toLowerCase().includes(activeFilter.toLowerCase())) return false;
    return true;
  });

  const exportCsv = () => {
    if (data.length === 0) return;
    const header = [
      "id", "appliedAt", "grove", "treeIds", "kind", "product", "activeIngredient",
      "rate", "rateUnit", "method", "areaHectares", "treesAffectedCount",
      "withholdingDays", "withholdingEndsAt", "weatherConditions", "worker", "notes",
    ];
    const rows = data.map((t) => {
      const ends = new Date(new Date(t.appliedAt).getTime() + t.withholdingDays * 86400000);
      return [
        t.id,
        new Date(t.appliedAt).toISOString(),
        t.groveName ?? `#${t.groveId}`,
        (t.treeIds ?? []).join("|"),
        t.treatmentKind,
        t.product,
        t.activeIngredient,
        t.rate,
        t.rateUnit,
        t.method,
        t.areaHectares,
        t.treesAffectedCount,
        t.withholdingDays,
        t.withholdingDays > 0 ? ends.toISOString() : "",
        t.weatherConditions,
        t.workerName ?? `#${t.workerId}`,
        t.notes,
      ];
    });
    const csv = [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treatments_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Beaker className="h-6 w-6 text-primary" /> Treatments & Sprays
          </h1>
          <p className="text-muted-foreground mt-2">Organic sprays, mineral applications and other interventions, with withholding tracking.</p>
        </div>
        <Button onClick={exportCsv} disabled={data.length === 0} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
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
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {Object.entries(KIND_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Product</Label>
            <Input placeholder="contains…" value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="w-40" data-testid="input-filter-product" />
          </div>
          <div>
            <Label className="text-xs">Active ingredient</Label>
            <Input placeholder="contains…" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="w-40" data-testid="input-filter-active" />
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
                <TableHead>Applied</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Grove</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Withholding</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.length === 0) ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No treatments match your filters.</TableCell></TableRow>
              ) : data.map((t) => {
                const ends = new Date(new Date(t.appliedAt).getTime() + t.withholdingDays * 86400000);
                const active = t.withholdingDays > 0 && ends > new Date();
                return (
                  <TableRow key={t.id} data-testid={`row-treatment-${t.id}`}>
                    <TableCell className="whitespace-nowrap">{format(new Date(t.appliedAt), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell>{t.workerName ?? `#${t.workerId}`}</TableCell>
                    <TableCell>{t.groveName ?? `#${t.groveId}`}</TableCell>
                    <TableCell><Badge variant="outline">{KIND_LABELS[t.treatmentKind] ?? t.treatmentKind}</Badge></TableCell>
                    <TableCell><span className="font-medium">{t.product}</span>{t.activeIngredient ? <div className="text-xs text-muted-foreground">{t.activeIngredient}</div> : null}</TableCell>
                    <TableCell>{t.method.replace(/_/g, " ")}</TableCell>
                    <TableCell>{t.rate != null ? `${t.rate} ${t.rateUnit ?? ""}` : "—"}</TableCell>
                    <TableCell>
                      {t.withholdingDays === 0 ? <span className="text-muted-foreground">—</span> :
                        active ? <Badge className="bg-amber-500 text-amber-50">{t.withholdingDays}d · ends {format(ends, "MMM d")}</Badge> :
                        <span className="text-xs text-muted-foreground">{t.withholdingDays}d (ended {format(ends, "MMM d")})</span>}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={t.notes ?? ""}>{t.notes ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
