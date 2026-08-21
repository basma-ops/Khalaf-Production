import {
  useListGroves, useGetWeatherSummary, useListWeatherLog,
  getGetWeatherSummaryQueryKey, getListWeatherLogQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudRain } from "lucide-react";
import { Link } from "wouter";

export function RainfallWidget() {
  const { data: groves } = useListGroves();
  // Lazy: only show if at least one weather entry exists across all groves.
  // Probe with a single global list call.
  const probeParams = { limit: 1 };
  const { data: anyEntries } = useListWeatherLog(
    probeParams,
    { query: { queryKey: getListWeatherLogQueryKey(probeParams) } },
  );
  // Pick the grove that actually has weather data (fall back to first).
  const groveWithData = anyEntries?.[0]?.groveId ?? groves?.[0]?.id;
  const summaryParams = { groveId: groveWithData ?? 0, year: new Date().getFullYear() };
  const { data: summary } = useGetWeatherSummary(
    summaryParams,
    { query: { queryKey: getGetWeatherSummaryQueryKey(summaryParams), enabled: groveWithData != null && (anyEntries?.length ?? 0) > 0 } },
  );

  if (!groveWithData || !anyEntries || anyEntries.length === 0) return null;
  const groveName = groves?.find((g) => g.id === groveWithData)?.name ?? "";

  const cumulative = summary?.cumulativeRainfallMm;
  const longTerm = summary?.longTermAvgRainfallMm;
  const pct = cumulative != null && longTerm != null && longTerm > 0
    ? Math.round((cumulative / longTerm) * 100)
    : null;

  return (
    <Card data-testid="card-rainfall-widget">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Rainfall this season</CardTitle>
        <CloudRain className="h-4 w-4 text-blue-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {cumulative != null ? `${Math.round(cumulative)} mm` : "—"}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {groveName}
          {longTerm != null && pct != null && (
            <> · {pct}% of long-term avg ({Math.round(longTerm)} mm)</>
          )}
        </p>
        <Link href="/weather" className="text-xs font-medium text-primary hover:underline mt-1 inline-block">
          View weather log →
        </Link>
      </CardContent>
    </Card>
  );
}
