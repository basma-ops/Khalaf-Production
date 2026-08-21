import { useState } from "react";
import { useListActivities, useListGroves } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Activity as ActivityIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TYPE_LABELS: Record<string, string> = {
  pruning_light: "Pruning (light)",
  pruning_structural: "Pruning (structural)",
  pruning_heavy: "Pruning (heavy)",
  mowing: "Mowing",
  terrace_repair: "Terrace repair",
  stone_drainage: "Stone drainage",
  cover_crop: "Cover crop",
  tree_planting: "Tree planting",
  tree_removal: "Tree removal",
  inspection: "Inspection",
  cleaning: "Cleaning",
  damage_assessment: "Damage assessment",
  other: "Other",
};

export default function Activities() {
  const [groveId, setGroveId] = useState<string>("all");
  const [activityType, setActivityType] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: groves } = useListGroves();
  const { data, isLoading } = useListActivities({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    activityType: activityType !== "all" ? activityType : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <ActivityIcon className="h-6 w-6 text-primary" /> Field Activities
        </h1>
        <p className="text-muted-foreground mt-2">
          Pruning, mowing, terrace work, and other activities logged by workers.
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
                {(groves ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Activity type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Grove</TableHead>
                <TableHead>Trees</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No activities match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(a.performedAt), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell>{a.workerName ?? `#${a.workerId}`}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[a.activityType] ?? a.activityType}</Badge></TableCell>
                    <TableCell>{a.groveName ?? `#${a.groveId}`}</TableCell>
                    <TableCell>{a.treeIds && a.treeIds.length > 0 ? a.treeIds.length : "—"}</TableCell>
                    <TableCell>{a.photoIds && a.photoIds.length > 0 ? a.photoIds.length : "—"}</TableCell>
                    <TableCell>{a.durationMinutes != null ? `${a.durationMinutes} min` : "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={a.notes ?? ""}>{a.notes ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
