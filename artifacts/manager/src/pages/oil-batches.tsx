import { useState, useEffect } from "react";
import {
  useListOilBatches,
  useCreateOilBatch,
  useUpdateOilBatch,
  useDeleteOilBatch,
  useGetOilBatch,
  useListLabResultsForOilBatch,
  useListPressingRuns,
  type OilBatch,
  type OilBatchStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplets, Plus, Award, HeartPulse, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS: OilBatchStatus[] = ["stored", "bottled", "sold", "lab_sampled"];

function NewOilBatchForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateOilBatch();
  const { data: pressingRuns } = useListPressingRuns();
  const [code, setCode] = useState("");
  const [pressingRunId, setPressingRunId] = useState<string>("");
  const [volume, setVolume] = useState("");
  const [storageContainer, setStorageContainer] = useState("");
  const [status, setStatus] = useState<OilBatchStatus>("stored");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!pressingRunId) {
      toast({ title: "Pressing run required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await create.mutateAsync({
        data: {
          oilBatchCode: code,
          pressingRunId: Number(pressingRunId),
          volumeLiters: volume ? Number(volume) : null,
          volumeRemainingLiters: volume ? Number(volume) : null,
          storageContainer: storageContainer || null,
          status,
          notes: notes || null,
        },
      });
      toast({ title: "Oil batch created" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div><Label>Batch code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="OB-2026-001" /></div>
      <div>
        <Label>Pressing run</Label>
        <Select value={pressingRunId} onValueChange={setPressingRunId}>
          <SelectTrigger><SelectValue placeholder="Select pressing run" /></SelectTrigger>
          <SelectContent>
            {(pressingRuns ?? []).map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.millName ? `${r.millName} · ` : ""}#{r.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Volume (L)</Label><Input type="number" step="0.1" value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as OilBatchStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Storage container</Label><Input value={storageContainer} onChange={(e) => setStorageContainer(e.target.value)} /></div>
      <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting || !code}>{submitting ? "Saving…" : "Create batch"}</Button>
      </div>
    </div>
  );
}

function EditOilBatchForm({ batch, onClose }: { batch: OilBatch; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateOilBatch();
  const [code, setCode] = useState(batch.oilBatchCode);
  const [volume, setVolume] = useState(batch.volumeLiters?.toString() ?? "");
  const [remaining, setRemaining] = useState(batch.volumeRemainingLiters?.toString() ?? "");
  const [storageContainer, setStorageContainer] = useState(batch.storageContainer ?? "");
  const [status, setStatus] = useState<OilBatchStatus>(batch.status);
  const [notes, setNotes] = useState(batch.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await update.mutateAsync({
        id: batch.id,
        data: {
          oilBatchCode: code,
          volumeLiters: volume ? Number(volume) : null,
          volumeRemainingLiters: remaining ? Number(remaining) : null,
          storageContainer: storageContainer || null,
          status,
          notes: notes || null,
        },
      });
      toast({ title: "Oil batch updated" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div><Label>Batch code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Volume (L)</Label><Input type="number" step="0.1" value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
        <div><Label>Remaining (L)</Label><Input type="number" step="0.1" value={remaining} onChange={(e) => setRemaining(e.target.value)} /></div>
      </div>
      <div>
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as OilBatchStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Storage container</Label><Input value={storageContainer} onChange={(e) => setStorageContainer(e.target.value)} /></div>
      <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting || !code}>{submitting ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}

function BatchDetail({ batch, onClose }: { batch: OilBatch; onClose: () => void }) {
  const { data: full } = useGetOilBatch(batch.id);
  const { data: labs } = useListLabResultsForOilBatch(batch.id);
  const del = useDeleteOilBatch();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const b = full ?? batch;

  const onDelete = async () => {
    try {
      await del.mutateAsync({ id: batch.id });
      toast({ title: "Oil batch deleted" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  if (editing) {
    return <EditOilBatchForm batch={b} onClose={() => setEditing(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs uppercase text-muted-foreground">Code</div><div className="font-mono">{b.oilBatchCode}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Status</div><div>{b.status}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Volume</div><div>{b.volumeLiters ?? "—"} L</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Remaining</div><div>{b.volumeRemainingLiters ?? "—"} L</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Container</div><div>{b.storageContainer ?? "—"}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Lab results</div><div>{b.labResultCount ?? labs?.length ?? 0}</div></div>
      </div>
      {b.notes && <p className="text-sm text-muted-foreground">{b.notes}</p>}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this oil batch?</AlertDialogTitle>
              <AlertDialogDescription>
                Lab results attached to this batch will be detached (not deleted). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Lab results</h3>
        {!labs || labs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lab results recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {labs.map((r) => (
              <div key={r.id} className="border rounded-md p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {r.isExtraVirgin === true && (
                    <Badge className="bg-emerald-600/15 text-emerald-700 border-emerald-600/30"><Award className="h-3 w-3 mr-1" />Extra Virgin</Badge>
                  )}
                  {r.isHealthClaimEligible === true && (
                    <Badge className="bg-rose-600/15 text-rose-700 border-rose-600/30"><HeartPulse className="h-3 w-3 mr-1" />Health-claim</Badge>
                  )}
                  <Badge variant="outline">{r.sampleDate ?? "—"}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Acidity</div><div>{r.acidity ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Peroxide</div><div>{r.peroxideValue ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Polyphenols</div><div>{r.totalPolyphenolsMgKg ?? "—"}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OilBatchesPage() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<OilBatch | null>(null);
  const { data, isLoading } = useListOilBatches();
  const batches = data ?? [];

  // If a selected batch was deleted, close the dialog automatically.
  useEffect(() => {
    if (selected && !batches.some((b) => b.id === selected.id)) setSelected(null);
  }, [batches, selected]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Droplets className="h-6 w-6 text-primary" /> Oil Batches
          </h1>
          <p className="text-muted-foreground mt-2">
            Bottled oil lots — link lab results, track volume remaining, edit or retire batches.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New oil batch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New oil batch</DialogTitle></DialogHeader>
            <NewOilBatchForm onClose={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : batches.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No oil batches yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:border-primary/40" onClick={() => setSelected(b)}>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-base">{b.oilBatchCode}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="text-muted-foreground">{b.status}</div>
                <div>{b.volumeLiters ?? "—"} L total</div>
                {b.volumeRemainingLiters != null && (
                  <div className="text-xs text-muted-foreground">{b.volumeRemainingLiters} L remaining</div>
                )}
                {b.labResultCount != null && b.labResultCount > 0 && (
                  <Badge variant="outline" className="mt-1">{b.labResultCount} lab result{b.labResultCount === 1 ? "" : "s"}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Oil batch detail</DialogTitle></DialogHeader>
          {selected && <BatchDetail batch={selected} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
