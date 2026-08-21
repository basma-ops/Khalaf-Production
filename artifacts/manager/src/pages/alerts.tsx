import { useListSatelliteAlerts, useUpdateSatelliteAlert } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { AlertTriangle, MapPin, Target, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function Alerts() {
  const { data: alerts, isLoading, refetch } = useListSatelliteAlerts();
  const updateAlert = useUpdateSatelliteAlert();
  const { toast } = useToast();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'urgent': return 'text-destructive border-destructive/20 bg-destructive/10';
      case 'high': return 'text-orange-600 border-orange-200 bg-orange-50';
      case 'medium': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
      case 'low': return 'text-blue-600 border-blue-200 bg-blue-50';
      default: return 'text-gray-600 border-gray-200 bg-gray-50';
    }
  };

  const handleStatusChange = (id: number, newStatus: any) => {
    updateAlert.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Alert updated", description: `Status changed to ${newStatus}` });
          refetch();
        },
        onError: () => {
          toast({ title: "Error", description: "Could not update alert status", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><div className="grid gap-4"><Skeleton className="h-40 w-full" /></div></div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          Satellite Alerts
        </h1>
        <p className="text-muted-foreground mt-2">Anomalies detected from multispectral satellite imagery requiring verification.</p>
      </div>

      <div className="space-y-4">
        {alerts?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No open alerts</h3>
            <p className="mt-1 text-sm text-muted-foreground">All clear. The groves are looking healthy.</p>
          </div>
        ) : (
          alerts?.map((alert) => (
            <Card key={alert.id} className="overflow-hidden">
              <div className={`h-1 w-full ${getSeverityColor(alert.severity).split(' ')[2]}`} />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-mono text-muted-foreground">{alert.alertCode}</span>
                    </div>
                    <CardTitle className="text-lg capitalize">{alert.alertType.replace(/_/g, ' ')}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {alert.groveName} {alert.treeCode ? `• Tree ${alert.treeCode}` : ''}
                      <span className="mx-2">•</span>
                      {format(new Date(alert.createdAt), "MMM d, yyyy")}
                    </CardDescription>
                  </div>
                  <div className="w-32">
                    <Select 
                      defaultValue={alert.status} 
                      onValueChange={(val) => handleStatusChange(alert.id, val)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="inspected">Inspected</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="text-sm space-y-2">
                  <div>
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider text-xs mr-2">Satellite Evidence:</span>
                    {alert.evidence || "No specific evidence provided."}
                  </div>
                  {alert.recommendedTask && (
                    <div className="flex items-start gap-2 bg-muted/50 p-2 rounded text-muted-foreground">
                      <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{alert.recommendedTask}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
