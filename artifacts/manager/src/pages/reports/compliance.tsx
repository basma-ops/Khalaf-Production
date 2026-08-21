import { useState } from "react";
import { useListComplianceTreatments, useListGroves } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Printer } from "lucide-react";

type Filters = { from?: string; to?: string; groveId?: string; product?: string; activeIngredient?: string };

function buildQuery(f: Filters, mode: "params" | "search"): Record<string, string | number | undefined> | string {
  const out: Record<string, string | number> = {};
  if (f.from) out["from"] = f.from;
  if (f.to) out["to"] = f.to;
  if (f.groveId) out["groveId"] = Number(f.groveId);
  if (f.product) out["product"] = f.product;
  if (f.activeIngredient) out["activeIngredient"] = f.activeIngredient;
  if (mode === "params") return out;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(out)) sp.set(k, String(v));
  return sp.toString();
}

export default function CompliancePage() {
  const [filters, setFilters] = useState<Filters>({});
  const [applied, setApplied] = useState<Filters>({});
  const params = buildQuery(applied, "params") as Record<string, string | number | undefined>;
  const { data: groves } = useListGroves();
  const { data, isLoading } = useListComplianceTreatments(Object.keys(params).length ? params : undefined);

  const search = buildQuery(applied, "search") as string;
  const csvHref = `/api/reports/compliance.csv${search ? "?" + search : ""}`;
  const printHref = `${import.meta.env.BASE_URL}reports/compliance/print${search ? "?" + search : ""}`;

  return (
    <div className="p-8 space-y-6" data-testid="compliance-export">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Compliance export
        </h1>
        <p className="text-muted-foreground mt-2">Filter treatments and export a compliance-ready CSV plus a printable PDF (one row per treatment with full applicator and withholding info).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div><Label className="text-xs uppercase">From</Label><Input type="date" data-testid="filter-from" value={filters.from ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
            <div><Label className="text-xs uppercase">To</Label><Input type="date" data-testid="filter-to" value={filters.to ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
            <div>
              <Label className="text-xs uppercase">Grove</Label>
              <Select value={filters.groveId ?? "all"} onValueChange={(v) => setFilters({ ...filters, groveId: v === "all" ? undefined : v })}>
                <SelectTrigger data-testid="filter-grove"><SelectValue placeholder="All groves" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groves</SelectItem>
                  {(groves ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase">Product</Label><Input data-testid="filter-product" value={filters.product ?? ""} onChange={(e) => setFilters({ ...filters, product: e.target.value })} placeholder="e.g. Spinosad" /></div>
            <div><Label className="text-xs uppercase">Active ingredient</Label><Input data-testid="filter-ai" value={filters.activeIngredient ?? ""} onChange={(e) => setFilters({ ...filters, activeIngredient: e.target.value })} placeholder="optional" /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setApplied(filters)} data-testid="apply-filters">Apply</Button>
            <Button variant="ghost" onClick={() => { setFilters({}); setApplied({}); }}>Clear</Button>
            <div className="flex-1" />
            <a href={csvHref} download>
              <Button variant="outline" data-testid="export-csv"><Download className="h-4 w-4 mr-1" /> Download CSV</Button>
            </a>
            <a href={printHref} target="_blank" rel="noreferrer">
              <Button variant="outline" data-testid="open-print"><Printer className="h-4 w-4 mr-1" /> Open print view</Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Treatments ({data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64" /> : (data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground italic">No treatments match your filters yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applied</TableHead>
                    <TableHead>Grove</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Active ingredient</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Trees</TableHead>
                    <TableHead className="text-right">Withhold</TableHead>
                    <TableHead>Applicator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.appliedAt).toISOString().slice(0, 10)}</TableCell>
                      <TableCell>{r.groveName ?? `#${r.groveId}`}</TableCell>
                      <TableCell><Badge variant="outline">{r.treatmentKind ?? "—"}</Badge></TableCell>
                      <TableCell>{r.product}</TableCell>
                      <TableCell className="text-xs">{r.activeIngredient ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.method}</TableCell>
                      <TableCell className="text-right text-xs">{r.rate != null ? `${r.rate} ${r.rateUnit ?? ""}` : "—"}</TableCell>
                      <TableCell className="text-right">{r.treesAffectedCount ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.withholdingDays}d</TableCell>
                      <TableCell>{r.applicatorName ?? `#${r.applicatorWorkerId ?? "?"}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
