import { useState, useMemo } from "react";
import {
  useListLabResults,
  useCreateLabResult,
  useUpdateLabResult,
  useListOilBatches,
  useListGroves,
  useListTrees,
  useListHarvestSeasons,
  type LabResult,
  type CreateLabResultRequestAttributionLevel,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Beaker, Plus, FileText, Award, HeartPulse } from "lucide-react";
import { uploadPhoto } from "@/lib/usePhotoUpload";
import { useToast } from "@/hooks/use-toast";

const ANY = "__any__";

function formatDate(d?: string | Date | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(); } catch { return String(d); }
}

function FlagsBadges({ r }: { r: LabResult }) {
  return (
    <div className="flex flex-wrap gap-1">
      {r.isExtraVirgin === true && (
        <Badge className="bg-emerald-600/15 text-emerald-700 border-emerald-600/30"><Award className="h-3 w-3 mr-1" />Extra Virgin</Badge>
      )}
      {r.isExtraVirgin === false && (
        <Badge variant="outline" className="text-muted-foreground">Not EV (acidity {r.acidity})</Badge>
      )}
      {r.isHealthClaimEligible === true && (
        <Badge className="bg-rose-600/15 text-rose-700 border-rose-600/30"><HeartPulse className="h-3 w-3 mr-1" />Health-claim eligible</Badge>
      )}
    </div>
  );
}

function NewLabResultForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateLabResult();
  const update = useUpdateLabResult();
  const { data: oilBatches } = useListOilBatches();
  const { data: groves } = useListGroves();
  const { data: trees } = useListTrees();
  const { data: seasons } = useListHarvestSeasons();

  const [attributionLevel, setAttributionLevel] = useState<CreateLabResultRequestAttributionLevel>("oil_batch");
  const [oilBatchId, setOilBatchId] = useState<string>("");
  const [groveId, setGroveId] = useState<string>("");
  const [treeId, setTreeId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");
  const [labName, setLabName] = useState("");
  const [acidity, setAcidity] = useState("");
  const [peroxide, setPeroxide] = useState("");
  const [polyphenols, setPolyphenols] = useState("");
  const [oleocanthal, setOleocanthal] = useState("");
  const [oleacein, setOleacein] = useState("");
  const [fattyAcids, setFattyAcids] = useState("");
  const [k232, setK232] = useState("");
  const [k270, setK270] = useState("");
  const [deltaK, setDeltaK] = useState("");
  const [sampleDate, setSampleDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  const submit = async () => {
    setSubmitting(true);
    try {
      // Validate fattyAcids JSON if provided.
      let fattyAcidsJson: string | null = null;
      if (fattyAcids.trim()) {
        try {
          JSON.parse(fattyAcids);
          fattyAcidsJson = fattyAcids.trim();
        } catch {
          toast({ title: "Fatty acids must be valid JSON", variant: "destructive" });
          setSubmitting(false);
          return;
        }
      }

      // Step 1: create lab result first.
      const created = await create.mutateAsync({
        data: {
          attributionLevel,
          harvestSeasonId: seasonId ? Number(seasonId) : null,
          oilBatchId: oilBatchId ? Number(oilBatchId) : null,
          groveId: groveId ? Number(groveId) : null,
          treeId: treeId ? Number(treeId) : null,
          labName: labName || null,
          acidity: numOrNull(acidity),
          peroxideValue: numOrNull(peroxide),
          totalPolyphenolsMgKg: numOrNull(polyphenols),
          oleocanthal: numOrNull(oleocanthal),
          oleacein: numOrNull(oleacein),
          fattyAcids: fattyAcidsJson,
          k232: numOrNull(k232),
          k270: numOrNull(k270),
          deltaK: numOrNull(deltaK),
          sampleDate: sampleDate || null,
          notes: notes || null,
        },
      });

      // Step 2: if a PDF was selected, upload it linked to the lab result, then PATCH the lab row.
      if (pdfFile) {
        const r = await uploadPhoto({
          file: pdfFile,
          originalFileName: pdfFile.name,
          contentType: pdfFile.type || "application/pdf",
          fileSizeBytes: pdfFile.size,
          purpose: "pdf",
          treeId: treeId ? Number(treeId) : null,
          groveId: groveId ? Number(groveId) : null,
          linkedEntityType: "lab_result",
          linkedEntityId: created.id,
        });
        await update.mutateAsync({ id: created.id, data: { reportMediaId: r.media.id } });
      }

      toast({ title: "Lab result saved" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Attribution level</Label>
          <Select value={attributionLevel} onValueChange={(v) => setAttributionLevel(v as CreateLabResultRequestAttributionLevel)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="oil_batch">Oil batch</SelectItem>
              <SelectItem value="batch">Harvest batch</SelectItem>
              <SelectItem value="tree">Single tree</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Season</Label>
          <Select value={seasonId} onValueChange={setSeasonId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {(seasons ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Oil batch</Label>
          <Select value={oilBatchId} onValueChange={setOilBatchId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {(oilBatches ?? []).map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.oilBatchCode ?? `#${b.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Grove</Label>
          <Select value={groveId} onValueChange={setGroveId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {(groves ?? []).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tree</Label>
          <Select value={treeId} onValueChange={setTreeId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {(trees?.trees ?? []).slice(0, 200).map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.treeCode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Sample date</Label>
          <Input type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Lab name</Label>
        <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Beirut AOC Lab" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Acidity (% oleic)</Label><Input type="number" step="0.01" value={acidity} onChange={(e) => setAcidity(e.target.value)} /></div>
        <div><Label>Peroxide (meq O₂/kg)</Label><Input type="number" step="0.1" value={peroxide} onChange={(e) => setPeroxide(e.target.value)} /></div>
        <div><Label>Polyphenols (mg/kg)</Label><Input type="number" step="1" value={polyphenols} onChange={(e) => setPolyphenols(e.target.value)} /></div>
        <div><Label>Oleocanthal (mg/kg)</Label><Input type="number" step="0.1" value={oleocanthal} onChange={(e) => setOleocanthal(e.target.value)} /></div>
        <div><Label>Oleacein (mg/kg)</Label><Input type="number" step="0.1" value={oleacein} onChange={(e) => setOleacein(e.target.value)} /></div>
        <div /> 
        <div><Label>K232</Label><Input type="number" step="0.01" value={k232} onChange={(e) => setK232(e.target.value)} /></div>
        <div><Label>K270</Label><Input type="number" step="0.01" value={k270} onChange={(e) => setK270(e.target.value)} /></div>
        <div><Label>ΔK</Label><Input type="number" step="0.01" value={deltaK} onChange={(e) => setDeltaK(e.target.value)} /></div>
      </div>
      <div>
        <Label>Fatty acid profile (JSON, optional)</Label>
        <Textarea
          value={fattyAcids}
          onChange={(e) => setFattyAcids(e.target.value)}
          rows={3}
          placeholder='{"palmitic":11.5,"oleic":72.4,"linoleic":8.2}'
          className="font-mono text-xs"
        />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div>
        <Label>Lab report (PDF)</Label>
        <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Save lab result"}</Button>
      </div>
    </div>
  );
}

export default function LabResultsPage() {
  const [open, setOpen] = useState(false);
  const [filterAttribution, setFilterAttribution] = useState<string>(ANY);
  const [filterGrove, setFilterGrove] = useState<string>(ANY);
  const [filterSeason, setFilterSeason] = useState<string>(ANY);
  const { data: groves } = useListGroves();
  const { data: seasons } = useListHarvestSeasons();

  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (filterAttribution !== ANY) p["attributionLevel"] = filterAttribution;
    if (filterGrove !== ANY) p["groveId"] = Number(filterGrove);
    if (filterSeason !== ANY) p["seasonId"] = Number(filterSeason);
    return Object.keys(p).length ? p : undefined;
  }, [filterAttribution, filterGrove, filterSeason]);

  const { data, isLoading } = useListLabResults(queryParams as never);
  const results: LabResult[] = useMemo(() => data ?? [], [data]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Beaker className="h-6 w-6 text-primary" /> Lab Results
          </h1>
          <p className="text-muted-foreground mt-2">
            Record acidity, peroxide, polyphenols, secoiridoids, and IOC indices.
            Extra Virgin (acidity ≤ 0.8) and EU 432/2012 health-claim (polyphenols ≥ 250) flags are computed automatically.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New lab result</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record lab result</DialogTitle></DialogHeader>
            <NewLabResultForm onClose={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Attribution</Label>
          <Select value={filterAttribution} onValueChange={setFilterAttribution}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All</SelectItem>
              <SelectItem value="oil_batch">Oil batch</SelectItem>
              <SelectItem value="batch">Harvest batch</SelectItem>
              <SelectItem value="tree">Single tree</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Grove</Label>
          <Select value={filterGrove} onValueChange={setFilterGrove}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All groves</SelectItem>
              {(groves ?? []).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Season</Label>
          <Select value={filterSeason} onValueChange={setFilterSeason}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All seasons</SelectItem>
              {(seasons ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : results.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No lab results yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="font-mono text-base">
                    {r.oilBatchCode ?? r.groveName ?? r.treeCode ?? `Lab #${r.id}`}
                  </span>
                  <Badge variant="outline">{r.attributionLevel}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <FlagsBadges r={r} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Acidity</div><div className="font-medium">{r.acidity ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Peroxide</div><div className="font-medium">{r.peroxideValue ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Polyphenols</div><div className="font-medium">{r.totalPolyphenolsMgKg ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Oleocanthal</div><div className="font-medium">{r.oleocanthal ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Oleacein</div><div className="font-medium">{r.oleacein ?? "—"}</div></div>
                  <div /> 
                  <div><div className="text-muted-foreground">K232</div><div className="font-medium">{r.k232 ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">K270</div><div className="font-medium">{r.k270 ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">ΔK</div><div className="font-medium">{r.deltaK ?? "—"}</div></div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r.labName ?? "—"}</span>
                  <span>{formatDate(r.sampleDate)}</span>
                </div>
                {r.reportMediaId && (
                  <Badge variant="outline"><FileText className="h-3 w-3 mr-1" />Report attached</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
