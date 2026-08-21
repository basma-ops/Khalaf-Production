import { useListFieldVisits } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList } from "lucide-react";

export default function FieldVisits() {
  const { data: visits, isLoading } = useListFieldVisits();

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge className="bg-orange-500">High</Badge>;
      case "medium": return <Badge className="bg-yellow-500">Medium</Badge>;
      case "low": return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">None</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Field Visits Review
        </h1>
        <p className="text-muted-foreground mt-2">Logs of agronomist and worker field checks.</p>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Diagnosis</TableHead>
              <TableHead>Follow Up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No field visits logged.
                </TableCell>
              </TableRow>
            ) : (
              visits?.map((visit) => (
                <TableRow key={visit.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(visit.visitDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>{visit.workerName}</TableCell>
                  <TableCell>
                    {visit.groveName} {visit.treeCode && <span className="text-muted-foreground ml-1">({visit.treeCode})</span>}
                  </TableCell>
                  <TableCell>{getSeverityBadge(visit.severity)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={visit.diagnosis || ""}>
                    {visit.diagnosis || "-"}
                  </TableCell>
                  <TableCell>
                    {visit.followUpNeeded ? (
                      <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none">Required</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">No</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
