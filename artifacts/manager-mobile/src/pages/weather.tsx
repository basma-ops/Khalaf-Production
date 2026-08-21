import { useListGroves, useGetWeatherSummary, useListWeatherLog } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudRain, Sun, Droplets } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Weather() {
  const { data: groves } = useListGroves();
  const groveId = groves?.[0]?.id ?? 0;
  const year = new Date().getFullYear();
  const { data: summary, isLoading: loadingSummary } = useGetWeatherSummary({ groveId, year });
  const { data: logs, isLoading: loadingLogs } = useListWeatherLog({ groveId, limit: 10 });

  if (loadingSummary || loadingLogs) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-24 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Season Summary</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <CloudRain className="mb-2 h-6 w-6 text-primary/60" />
            <p className="text-xs font-medium text-muted-foreground">Cumulative Rain</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {summary?.cumulativeRainfallMm ?? 0} mm
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Sun className="mb-2 h-6 w-6 text-primary/60" />
            <p className="text-xs font-medium text-muted-foreground">Avg Max Temp</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {summary?.avgTempMaxC != null ? `${summary.avgTempMaxC.toFixed(1)}°C` : "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent Log</h2>
        <div className="space-y-3">
          {logs?.map((log) => (
            <div key={log.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-foreground">
                  {new Date(log.observedDate).toLocaleDateString()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {log.rainfallMm != null && (
                  <span className="flex items-center gap-1">
                    <CloudRain className="h-3 w-3" /> {log.rainfallMm} mm
                  </span>
                )}
                {log.tempMaxC != null && (
                  <span className="flex items-center gap-1">
                    <Sun className="h-3 w-3" /> Max {log.tempMaxC}°C
                  </span>
                )}
                {log.humidityAvgPct != null && (
                  <span className="flex items-center gap-1">
                    <Droplets className="h-3 w-3" /> {log.humidityAvgPct}%
                  </span>
                )}
              </div>
              {log.notes && (
                <p className="mt-2 text-xs italic text-muted-foreground">"{log.notes}"</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
