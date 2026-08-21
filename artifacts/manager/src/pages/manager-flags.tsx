import { useState } from "react";
import { Link } from "wouter";
import {
  useListManagerFlags,
  useUpdateManagerFlag,
  useCreateManagerFlag,
  getListManagerFlagsQueryKey,
  type UpdateManagerFlagRequestStatus,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Flag, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const SEV_VARIANT: Record<string, string> = {
  urgent: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-white",
  low: "bg-blue-500 text-white",
  info: "bg-muted text-muted-foreground",
};

const ENTITY_LINK: Record<string, (id: number) => string | null> = {
  tree: (id) => `/trees/${id}`,
  grove: () => `/groves`,
  photo: () => `/photos`,
  field_visit: () => `/field-visits`,
  activity: () => `/activities`,
  phenology_event: () => `/phenology`,
  batch: () => null,
  harvest_event: () => `/harvest`,
};

export default function ManagerFlagsPage() {
  const [status, setStatus] = useState<string>("open");
  const [entityType, setEntityType] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  const { data, isLoading } = useListManagerFlags({
    status,
    entityType: entityType !== "all" ? entityType : undefined,
    severity: severity !== "all" ? severity : undefined,
  });
  const update = useUpdateManagerFlag();
  const create = useCreateManagerFlag();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [resolveOpen, setResolveOpen] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newEntityType, setNewEntityType] = useState("tree");
  const [newEntityId, setNewEntityId] = useState("");
  const [newFlagType, setNewFlagType] = useState("");
  const [newSeverity, setNewSeverity] = useState("medium");
  const [newMessage, setNewMessage] = useState("");

  const setStatusOf = (id: number, newStatus: UpdateManagerFlagRequestStatus, extra: Record<string, unknown> = {}) => {
    update.mutate(
      { id, data: { status: newStatus, ...extra } },
      {
        onSuccess: () => {
          toast({ title: `Flag ${newStatus}` });
          qc.invalidateQueries({ queryKey: getListManagerFlagsQueryKey() });
        },
      },
    );
  };

  const submitNew = () => {
    if (!newEntityId.trim() || !newFlagType.trim() || !newMessage.trim()) {
      toast({ title: "Entity, type and message are required", variant: "destructive" });
      return;
    }
    create.mutate(
      { data: { entityType: newEntityType, entityId: parseInt(newEntityId, 10), flagType: newFlagType.trim(), severity: newSeverity, message: newMessage.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Flag raised" });
          qc.invalidateQueries({ queryKey: getListManagerFlagsQueryKey() });
          setCreateOpen(false);
          setNewEntityId(""); setNewFlagType(""); setNewMessage(""); setNewSeverity("medium");
        },
      },
    );
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Flag className="h-6 w-6 text-primary" />
            Manager Flags
          </h1>
          <p className="text-muted-foreground mt-2">
            Issues raised on groves, trees, photos, batches — your follow-up inbox with audit trail.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Raise flag</Button>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="acknowledged">Acknowledged</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Entity type</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="grove">Grove</SelectItem>
              <SelectItem value="tree">Tree</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="batch">Batch</SelectItem>
              <SelectItem value="field_visit">Field visit</SelectItem>
              <SelectItem value="activity">Activity</SelectItem>
              <SelectItem value="phenology_event">Phenology</SelectItem>
              <SelectItem value="harvest_event">Harvest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Severity</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raised</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!data || data.length === 0) ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No flags in this state.
                </TableCell>
              </TableRow>
            ) : (
              data.map((f) => {
                const linker = ENTITY_LINK[f.entityType];
                const href = linker?.(f.entityId) ?? null;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="whitespace-nowrap text-sm">{format(new Date(f.createdAt), "MMM d, HH:mm")}</TableCell>
                    <TableCell><Badge className={SEV_VARIANT[f.severity] ?? ""}>{f.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">
                      {href ? (
                        <Link href={href} className="text-primary hover:underline">{f.entityType} #{f.entityId}</Link>
                      ) : (
                        <span>{f.entityType} #{f.entityId}</span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{f.flagType}</Badge></TableCell>
                    <TableCell className="max-w-md">{f.message}</TableCell>
                    <TableCell className="text-sm">{f.createdByName ?? (f.createdByUserId ? `#${f.createdByUserId}` : "—")}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {f.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => setStatusOf(f.id, "acknowledged")}>Ack</Button>
                        )}
                        {f.status !== "resolved" && (
                          <Button size="sm" onClick={() => { setResolveOpen(f.id); setResolutionNotes(""); }}>Resolve</Button>
                        )}
                        {f.status !== "dismissed" && f.status !== "resolved" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatusOf(f.id, "dismissed")}>Dismiss</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={resolveOpen != null} onOpenChange={(o) => !o && setResolveOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve flag</DialogTitle></DialogHeader>
          <Textarea rows={4} placeholder="What was done?" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(null)}>Cancel</Button>
            <Button onClick={() => { if (resolveOpen != null) { setStatusOf(resolveOpen, "resolved", { resolutionNotes: resolutionNotes || null }); setResolveOpen(null); } }}>
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a manager flag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entity type</Label>
                <Select value={newEntityType} onValueChange={setNewEntityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grove">Grove</SelectItem>
                    <SelectItem value="tree">Tree</SelectItem>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="batch">Batch</SelectItem>
                    <SelectItem value="field_visit">Field visit</SelectItem>
                    <SelectItem value="activity">Activity</SelectItem>
                    <SelectItem value="phenology_event">Phenology</SelectItem>
                    <SelectItem value="harvest_event">Harvest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entity ID</Label>
                <Input type="number" value={newEntityId} onChange={(e) => setNewEntityId(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Flag type</Label>
              <Input placeholder="e.g. data_quality, follow_up" value={newFlagType} onChange={(e) => setNewFlagType(e.target.value)} />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={newSeverity} onValueChange={setNewSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={3} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitNew} disabled={create.isPending}>Raise flag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
