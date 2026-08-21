import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateManagerFlag,
  getListManagerFlagsQueryKey,
} from "@workspace/api-client-react";

type Severity = "info" | "low" | "medium" | "high" | "urgent";
import { useQueryClient } from "@tanstack/react-query";

type EntityType =
  | "grove"
  | "tree"
  | "photo"
  | "batch"
  | "harvest_event"
  | "field_visit"
  | "activity"
  | "phenology_event";

interface Props {
  entityType: EntityType;
  entityId: number;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ManagerFlagButton({ entityType, entityId, label = "Raise Flag", variant = "outline", size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [flagType, setFlagType] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateManagerFlag();

  const submit = () => {
    if (!flagType.trim() || !message.trim()) {
      toast({ title: "Flag type and message are required", variant: "destructive" });
      return;
    }
    create.mutate(
      { data: { entityType, entityId, flagType: flagType.trim(), severity, message: message.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Flag raised", description: `${entityType} #${entityId} flagged for follow-up.` });
          qc.invalidateQueries({ queryKey: getListManagerFlagsQueryKey() });
          setOpen(false);
          setFlagType("");
          setMessage("");
          setSeverity("medium");
        },
        onError: () => toast({ title: "Failed to raise flag", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <Flag className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise Manager Flag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Flagging <span className="font-mono">{entityType}</span> #{entityId}
          </div>
          <div className="space-y-2">
            <Label>Flag type</Label>
            <Input
              placeholder="e.g. data_quality, follow_up_required, suspect_photo"
              value={flagType}
              onChange={(e) => setFlagType(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
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
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              rows={4}
              placeholder="Why is this being flagged? What needs to happen next?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Raise Flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
