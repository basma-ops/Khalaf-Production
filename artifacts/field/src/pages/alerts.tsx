import { useListSatelliteAlerts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertTriangle, MapPin, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { dateLocale, severityLabel } from "@/lib/i18n";

export default function Alerts() {
  const { data: alerts, isLoading } = useListSatelliteAlerts({ status: "open" });

  if (isLoading) {
    return (
      <div className="p-4 pt-8">
        <h1 className="text-3xl font-bold tracking-tight mb-6">تنبيهات الموقع</h1>
        <div className="space-y-4">
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="p-4 pt-8 h-full flex flex-col">
        <h1 className="text-3xl font-bold tracking-tight mb-6">تنبيهات الموقع</h1>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full mb-4">
            <AlertTriangle className="h-10 w-10 text-green-600 dark:text-green-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">لا توجد تنبيهات نشطة</h3>
          <p className="text-muted-foreground text-lg max-w-[250px]">
            نظام المراقبة بالقمر الصناعي لا يُظهر أي إشارات إجهاد حالياً.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">تنبيهات الموقع</h1>

      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className="overflow-hidden">
            <div className={`h-2 w-full ${
              alert.severity === 'urgent' ? 'bg-destructive' :
              alert.severity === 'high' ? 'bg-orange-500' :
              alert.severity === 'medium' ? 'bg-amber-500' :
              'bg-blue-500'
            }`} />
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <Badge variant="outline" className={
                  alert.severity === 'urgent' ? 'border-destructive text-destructive' :
                  alert.severity === 'high' ? 'border-orange-500 text-orange-500' :
                  alert.severity === 'medium' ? 'border-amber-500 text-amber-500' :
                  'border-blue-500 text-blue-500'
                }>
                  {severityLabel(alert.severity)}
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">
                  {format(new Date(alert.createdAt), "d MMM", dateLocale)}
                </span>
              </div>

              <h3 className="font-bold text-xl mb-1">{alert.alertType.replace(/_/g, ' ')}</h3>

              {(alert.groveName || alert.treeCode) && (
                <div className="flex items-center text-muted-foreground mb-3">
                  <MapPin className="h-4 w-4 ml-1 shrink-0" />
                  <span className="truncate">{alert.groveName}{alert.treeCode ? ` • شجرة ${alert.treeCode}` : ""}</span>
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-1">دليل القمر الصناعي</p>
                <p className="text-sm font-medium">{alert.evidence}</p>
              </div>

              <Button asChild className="w-full h-12 text-lg">
                <Link href={`/capture/tree?treeId=${alert.treeId}&alertId=${alert.id}`}>
                  بدء زيارة ميدانية <ArrowRight className="mr-2 h-5 w-5 rotate-180" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
