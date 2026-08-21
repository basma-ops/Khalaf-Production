import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListBottlingRuns,
  useCreateBottlingRun,
  useListGroves,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wine, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function NewBottlingRunDialog({ onCreated }: { onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const create = useCreateBottlingRun();
  const [open, setOpen] = useState(false);
  const [runCode, setRunCode] = useState("");
  const [bottledAt, setBottledAt] = useState(new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState("500ml");
  const [bottleSizeMl, setBottleSizeMl] = useState("500");
  const [bottlesProduced, setBottlesProduced] = useState("");
  const [totalLitersBottled, setTotalLitersBottled] = useState("");
  const [label, setLabel] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!runCode || !bottledAt) {
      toast({ title: "Run code and date required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const created = await create.mutateAsync({
        data: {
          runCode,
          bottledAt,
          format: format || null,
          bottleSizeMl: bottleSizeMl ? Number(bottleSizeMl) : null,
          bottlesProduced: bottlesProduced ? Number(bottlesProduced) : null,
          totalLitersBottled: totalLitersBottled ? Number(totalLitersBottled) : null,
          label: label || null,
          lotCode: lotCode || null,
          location: location || null,
          singleTree: false,
          singleGrove: false,
          status: "draft",
          notes: notes || null,
        },
      });
      toast({ title: "Bottling run created" });
      setOpen(false);
      onCreated(created.id);
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-bottling-run"><Plus className="h-4 w-4 mr-1" /> New bottling run</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New bottling run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Run code</Label><Input value={runCode} onChange={(e) => setRunCode(e.target.value)} placeholder="BR-2026-001" data-testid="input-run-code" /></div>
            <div><Label>Bottled date</Label><Input type="date" value={bottledAt} onChange={(e) => setBottledAt(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="250ml">250 mL</SelectItem>
                  <SelectItem value="500ml">500 mL</SelectItem>
                  <SelectItem value="750ml">750 mL</SelectItem>
                  <SelectItem value="1L">1 L</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Bottle size (mL)</Label><Input type="number" value={bottleSizeMl} onChange={(e) => setBottleSizeMl(e.target.value)} /></div>
            <div><Label>Bottles produced</Label><Input type="number" value={bottlesProduced} onChange={(e) => setBottlesProduced(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total L bottled</Label><Input type="number" step="0.1" value={totalLitersBottled} onChange={(e) => setTotalLitersBottled(e.target.value)} /></div>
            <div><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Khalaf Mill" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Khalaf Souri 2026" /></div>
            <div><Label>Lot code</Label><Input value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="L26-001" /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="button-create-bottling-run">{submitting ? "Saving…" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ALL = "all";

export default function BottlingPage() {
  const [year, setYear] = useState<string>(ALL);
  const [groveId, setGroveId] = useState<string>(ALL);
  const { data: groves } = useListGroves();
  const { data, isLoading, refetch } = useListBottlingRuns({
    ...(year !== ALL ? { year: Number(year) } : {}),
    ...(groveId !== ALL ? { groveId: Number(groveId) } : {}),
  });

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3].map(String);
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Wine className="h-6 w-6 text-primary" /> Bottling Runs
          </h1>
          <p className="text-muted-foreground mt-2">Track bottling runs and trace each bottle back to the trees that produced its oil.</p>
        </div>
        <NewBottlingRunDialog onCreated={() => refetch()} />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label className="text-xs">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger data-testid="filter-year"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-64">
            <Label className="text-xs">Grove</Label>
            <Select value={groveId} onValueChange={setGroveId}>
              <SelectTrigger data-testid="filter-grove"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All groves</SelectItem>
                {(groves ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(year !== ALL || groveId !== ALL) && (
            <Button variant="ghost" size="sm" onClick={() => { setYear(ALL); setGroveId(ALL); }}>Clear filters</Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run code</TableHead>
                  <TableHead>Bottled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Label / Lot</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Bottles</TableHead>
                  <TableHead className="text-right">Total L</TableHead>
                  <TableHead className="text-right">Sources</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data || data.length === 0) ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No bottling runs match the current filters.</TableCell></TableRow>
                ) : data.map((r) => (
                  <TableRow key={r.id} data-testid={`row-bottling-${r.id}`}>
                    <TableCell className="font-mono">{r.runCode}</TableCell>
                    <TableCell>{r.bottledAt}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-sm">{r.label ?? "—"}<br /><span className="text-xs text-muted-foreground font-mono">{r.lotCode ?? ""}</span></TableCell>
                    <TableCell className="text-xs">{r.format ?? (r.bottleSizeMl ? `${r.bottleSizeMl} mL` : "—")}</TableCell>
                    <TableCell className="text-right font-mono">{r.bottlesProduced ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.totalLitersBottled?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.sourceCount ?? 0}</TableCell>
                    <TableCell className="space-x-2">
                      <Link href={`/bottling/${r.id}`} className="text-primary text-sm underline" data-testid={`link-bottling-${r.id}`}>Open</Link>
                      <Link href={`/reports/lot-trace/${r.id}`} className="text-primary text-sm underline">Lot trace</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
