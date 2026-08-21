import { useListGroves, useGetGroveSummary, useGetYieldForecast, getGetYieldForecastQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trees, AlertTriangle, CheckSquare, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagerFlagButton } from "@/components/manager-flag-dialog";

function GroveSidePanel({ groveId }: { groveId: number }) {
  const { data: summary, isLoading } = useGetGroveSummary(groveId);
  const forecastParams = { groveId };
  const { data: forecast } = useGetYieldForecast(
    forecastParams,
    { query: { queryKey: getGetYieldForecastQueryKey(forecastParams) } },
  );
  const groveForecast = forecast?.groves?.[0];

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-32" /></div>;
  }

  if (!summary) return null;

  const s = summary as any;
  const avgHealth = Number(s.avgHealthIndex ?? s.averageHealthIndex ?? 0);
  const notes = s.notes ?? s.grove?.notes;
  const heritageNotes = s.heritageNotes ?? s.grove?.heritageNotes;
  const name = s.name ?? s.grove?.name ?? "Grove";
  const groveCode = s.groveCode ?? s.grove?.groveCode ?? "";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-serif font-bold">{name}</h2>
          <p className="text-muted-foreground font-mono text-sm">{groveCode}</p>
        </div>
        <ManagerFlagButton entityType="grove" entityId={groveId} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <Trees className="h-5 w-5 mb-2 text-primary" />
            <div className="text-2xl font-bold">{s.treeCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Total Trees</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <AlertTriangle className={cn("h-5 w-5 mb-2", (s.openAlertCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")} />
            <div className="text-2xl font-bold">{s.openAlertCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open Alerts</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <CheckSquare className="h-5 w-5 mb-2 text-accent" />
            <div className="text-2xl font-bold">{s.openTaskCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Open Tasks</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <Activity className="h-5 w-5 mb-2 text-chart-4" />
            <div className="text-2xl font-bold">
              {Number.isFinite(avgHealth) && avgHealth > 0
                ? `${Math.round(avgHealth > 1.5 ? avgHealth : avgHealth * 100)}%`
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Avg Health</div>
          </CardContent>
        </Card>
      </div>

      {groveForecast && (
        <div data-testid={`grove-forecast-${groveId}`}>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">
            Yield forecast {forecast?.seasonName ? `· ${forecast.seasonName}` : ""}
          </h3>
          <div className="border rounded-md p-3">
            <div className="font-serif text-2xl tabular-nums">
              {Math.round(groveForecast.estimatedKg).toLocaleString()}<span className="text-xs text-muted-foreground"> kg</span>
            </div>
            {groveForecast.estimatedKgLow != null && groveForecast.estimatedKgHigh != null && (
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round(groveForecast.estimatedKgLow).toLocaleString()}–{Math.round(groveForecast.estimatedKgHigh).toLocaleString()} kg band
              </div>
            )}
            {(groveForecast.predictedHarvestStart || groveForecast.predictedHarvestEnd) && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Harvest window: <span className="tabular-nums">{groveForecast.predictedHarvestStart ?? "?"}{groveForecast.predictedHarvestEnd ? ` → ${groveForecast.predictedHarvestEnd}` : ""}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{groveForecast.confidence} confidence</span>
              {groveForecast.latestBbchStage && <span className="text-[10px] text-muted-foreground">BBCH {groveForecast.latestBbchStage}</span>}
              {groveForecast.latestJaenScore != null && <span className="text-[10px] text-muted-foreground">Jaén {groveForecast.latestJaenScore.toFixed(2)}</span>}
            </div>
          </div>
        </div>
      )}

      {notes && (
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">Notes</h3>
          <p className="text-sm">{notes}</p>
        </div>
      )}

      {heritageNotes && (
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">Heritage Info</h3>
          <p className="text-sm">{heritageNotes}</p>
        </div>
      )}
    </div>
  );
}

export default function Groves() {
  const { data: groves, isLoading } = useListGroves();
  const [selectedGroveId, setSelectedGroveId] = useState<number | null>(null);

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-10 w-48 mb-6" /><div className="space-y-4"><Skeleton className="h-20 w-full" /></div></div>;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 p-8 overflow-auto border-r border-border">
        <h1 className="text-3xl font-serif font-bold mb-6 text-foreground">Groves</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groves?.map((grove) => (
            <Card 
              key={grove.id} 
              className={cn("cursor-pointer transition-all hover:border-primary", selectedGroveId === grove.id && "border-primary ring-1 ring-primary")}
              onClick={() => setSelectedGroveId(grove.id)}
            >
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span className="font-serif">{grove.name}</span>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">{grove.groveCode}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground flex gap-4">
                  {grove.areaHa && <span>{grove.areaHa} ha</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div className="w-96 bg-sidebar hidden lg:block overflow-auto">
        {selectedGroveId ? (
          <GroveSidePanel groveId={selectedGroveId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a grove to view details
          </div>
        )}
      </div>
    </div>
  );
}
