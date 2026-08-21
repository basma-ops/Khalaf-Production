import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListSensorStreams,
  useListSensorKinds,
  useCreateSensorStream,
  useDeleteSensorStream,
  useRotateSensorStreamToken,
  type SensorStreamSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Activity, Plus, RefreshCw, Trash2, Copy } from "lucide-react";
import { format } from "date-fns";

function formatLastSeen(d: string | Date | null | undefined): string {
  if (!d) return "never";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "MMM d, yyyy HH:mm");
}

function TokenReveal({ token, onClose }: { token: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API token (shown once)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Copy this token now — it will not be shown again. The device should
            send it as <code className="text-xs">Authorization: Bearer &lt;token&gt;</code>{" "}
            when posting readings.
          </p>
          <div className="flex gap-2">
            <Input value={token} readOnly className="font-mono text-xs" data-testid="input-api-token" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigator.clipboard.writeText(token)}
              data-testid="button-copy-token"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} data-testid="button-close-token">I have stored it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateStreamDialog({
  onCreated,
  onInvalidate,
}: {
  onCreated: (token: string) => void;
  onInvalidate: () => void;
}) {
  const { data: kinds } = useListSensorKinds();
  const create = useCreateSensorStream({
    mutation: { onSuccess: onInvalidate },
  });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [interval, setInterval] = useState("3600");
  const [attachedType, setAttachedType] = useState<string>("none");
  const [attachedId, setAttachedId] = useState("");
  const [source, setSource] = useState("manual");

  function handleKind(k: string) {
    setKind(k);
    const known = (kinds ?? []).find((x) => x.kind === k);
    if (known) setUnit(known.unit);
  }

  async function onSubmit() {
    if (!kind || !unit || !interval) return;
    const payload = {
      data: {
        name: name || null,
        kind,
        unit,
        sampleIntervalSeconds: parseInt(interval, 10),
        source,
        attachedEntityType: attachedType === "none" ? null : attachedType,
        attachedEntityId: attachedType !== "none" && attachedId ? parseInt(attachedId, 10) : null,
      },
    };
    const created = await create.mutateAsync(payload);
    setOpen(false);
    setName("");
    setKind("");
    setUnit("");
    setInterval("3600");
    setAttachedType("none");
    setAttachedId("");
    onCreated(created.apiToken);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-stream"><Plus className="h-4 w-4 mr-1" /> Add sensor stream</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register sensor stream</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={handleKind}>
              <SelectTrigger data-testid="select-kind"><SelectValue placeholder="Choose kind" /></SelectTrigger>
              <SelectContent>
                {(kinds ?? []).map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>{k.kind} ({k.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Display name (optional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-name" />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="input-unit" />
            </div>
            <div>
              <Label className="text-xs">Sample interval (sec)</Label>
              <Input type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} data-testid="input-interval" />
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} data-testid="input-source" />
            </div>
            <div>
              <Label className="text-xs">Attached to</Label>
              <Select value={attachedType} onValueChange={setAttachedType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unattached / global</SelectItem>
                  <SelectItem value="tree">Tree</SelectItem>
                  <SelectItem value="grove">Grove</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Entity ID</Label>
              <Input
                type="number"
                value={attachedId}
                onChange={(e) => setAttachedId(e.target.value)}
                disabled={attachedType === "none"}
                data-testid="input-entity-id"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={create.isPending} data-testid="button-create-stream">
            {create.isPending ? "Creating…" : "Create & show token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StreamRow({
  s,
  onToken,
  onInvalidate,
}: {
  s: SensorStreamSummary;
  onToken: (t: string) => void;
  onInvalidate: () => void;
}) {
  const del = useDeleteSensorStream({ mutation: { onSuccess: onInvalidate } });
  const rotate = useRotateSensorStreamToken();
  const lastVal = s.lastValueNumeric;
  const lastObserved = s.lastObservedAt;
  return (
    <TableRow
      data-testid={`row-stream-${s.id}`}
      className={s.isStale && s.status === "active" ? "bg-amber-50 dark:bg-amber-950/20" : undefined}
    >
      <TableCell>
        <Link href={`/sensors/${s.id}`} className="font-mono text-primary underline">
          {s.name ?? `Stream #${s.id}`}
        </Link>
      </TableCell>
      <TableCell><Badge variant="outline" className="text-[10px]">{s.kind}</Badge></TableCell>
      <TableCell className="text-xs">
        {s.attachedEntityType ? `${s.attachedEntityType} · ${s.attachedEntityLabel ?? `#${s.attachedEntityId}`}` : "—"}
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap">{formatLastSeen(s.lastSeenAt)}</TableCell>
      <TableCell className="font-mono text-right">
        {lastVal != null ? `${lastVal} ${s.unit}` : "—"}
        {lastObserved && (
          <div className="text-[10px] text-muted-foreground">{format(new Date(lastObserved), "MMM d HH:mm")}</div>
        )}
      </TableCell>
      <TableCell>
        {s.status !== "active" ? <Badge variant="secondary">{s.status}</Badge> :
          s.isStale ? <Badge className="bg-amber-500 text-amber-50">stale</Badge> :
          <Badge className="bg-emerald-600 text-emerald-50">live</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="icon"
          variant="ghost"
          title="Rotate token"
          onClick={async () => {
            const r = await rotate.mutateAsync({ id: s.id });
            onToken(r.apiToken);
          }}
          data-testid={`button-rotate-${s.id}`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Delete"
          onClick={() => {
            if (confirm(`Delete stream "${s.name ?? s.id}" and all its readings?`)) del.mutate({ id: s.id });
          }}
          data-testid={`button-delete-${s.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function SensorsPage() {
  const [kind, setKind] = useState<string>("all");
  const { data: streams, isLoading } = useListSensorStreams(
    kind === "all" ? undefined : { kind },
  );
  const { data: kinds } = useListSensorKinds();
  const [token, setToken] = useState<string | null>(null);
  const qc = useQueryClient();
  const invalidateStreams = () => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/sensors/streams");
      },
    });
  };

  const stale = useMemo(
    () => (streams ?? []).filter((s) => s.status === "active" && s.isStale).length,
    [streams],
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Sensor Streams
          </h1>
          <p className="text-muted-foreground mt-2">
            Phase 4 scaffolding — register streams, view live readings, and check for stale ones.
            {stale > 0 && (
              <span className="ml-2 text-amber-700">
                {stale} stale stream{stale === 1 ? "" : "s"} need attention.
              </span>
            )}
          </p>
        </div>
        <CreateStreamDialog onCreated={setToken} onInvalidate={invalidateStreams} />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {(kinds ?? []).map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>{k.kind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Streams</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            !streams || streams.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-streams">
                No sensor streams yet. Add one to start ingesting readings.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Attached</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Last value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map((s) => (
                    <StreamRow key={s.id} s={s} onToken={setToken} onInvalidate={invalidateStreams} />
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      {token && <TokenReveal token={token} onClose={() => setToken(null)} />}
    </div>
  );
}
