import { useState } from "react";
import { useListWeatherLog, useListGroves, useGetWeatherSummary, getGetWeatherSummaryQueryKey, useGetLiveWeather, getGetLiveWeatherQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CloudRain, Cloud, Wind, Droplets, Thermometer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WeatherPage() {
  const currentYear = new Date().getFullYear();
  const [groveId, setGroveId] = useState("all");
  const [year, setYear] = useState(String(currentYear));
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: groves } = useListGroves();
  const { data, isLoading } = useListWeatherLog({
    groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const summaryGroveId = groveId !== "all" ? parseInt(groveId, 10) : undefined;
  const summaryParams = { groveId: summaryGroveId ?? 0, year: parseInt(year, 10) };
  const { data: summary } = useGetWeatherSummary(
    summaryParams,
    { query: { queryKey: getGetWeatherSummaryQueryKey(summaryParams), enabled: summaryGroveId != null } },
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <CloudRain className="h-6 w-6 text-primary" /> Weather Log
        </h1>
        <p className="text-muted-foreground mt-2">
          Daily weather observations per grove (rain-fed Ba'al groves rely on rainfall — track it season by season).
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
                {(groves ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year (for summary)</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-28" />
          </div>
          <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        </CardContent>
      </Card>

      {summaryGroveId != null && <LiveWeatherTile groveId={summaryGroveId} />}

      {summaryGroveId != null && summary && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">
              {summary.year} summary · {(groves ?? []).find((g) => g.id === summaryGroveId)?.name ?? `Grove #${summaryGroveId}`}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Rainfall this season" value={summary.cumulativeRainfallMm != null ? `${Math.round(summary.cumulativeRainfallMm)} mm` : "—"} testid="stat-rainfall" />
              <Stat label="Long-term avg rainfall"
                value={summary.longTermAvgRainfallMm != null ? `${Math.round(summary.longTermAvgRainfallMm)} mm` : "—"}
                hint={(summary.longTermYears ?? 0) > 0 ? `over ${summary.longTermYears} prior year${summary.longTermYears === 1 ? "" : "s"}` : "no prior data"} />
              <Stat label="Avg max temp" value={summary.avgTempMaxC != null ? `${summary.avgTempMaxC.toFixed(1)} °C` : "—"} />
              <Stat label="Avg min temp" value={summary.avgTempMinC != null ? `${summary.avgTempMinC.toFixed(1)} °C` : "—"} />
              <Stat label="Avg humidity" value={summary.avgHumidityPct != null ? `${Math.round(summary.avgHumidityPct)}%` : "—"} />
              <Stat label="Total leaf wetness" value={summary.totalLeafWetnessHours != null ? `${Math.round(summary.totalLeafWetnessHours)} h` : "—"} />
              <Stat label="Entries" value={String(summary.entryCount)} />
              <Stat label="First rain"
                value={summary.firstRainDate ? format(new Date(summary.firstRainDate), "MMM d") : "—"}
                hint={summary.firstRainDate ? "season opener" : "no rain yet"} />
            </div>

            {summary.dailyCumulative && summary.dailyCumulative.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                  Cumulative rainfall (mm){(summary.longTermDailyCumulative?.length ?? 0) > 0 ? " — current vs long-term avg" : ""}
                </h4>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={mergeRainSeries(summary.dailyCumulative, summary.longTermDailyCumulative ?? [])}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), "MMM d")} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip labelFormatter={(d) => format(new Date(String(d)), "MMM d, yyyy")} />
                      <Legend />
                      <Line type="monotone" dataKey="current" name="This year" stroke="#2563eb" strokeWidth={2} dot={false} />
                      {(summary.longTermDailyCumulative?.length ?? 0) > 0 && (
                        <Line type="monotone" dataKey="longTerm" name="Long-term avg" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                      )}
                      {summary.firstRainDate && (
                        <ReferenceLine x={summary.firstRainDate} stroke="#16a34a" strokeDasharray="2 2" label={{ value: "First rain", fontSize: 10, fill: "#16a34a", position: "insideTopRight" }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? <Skeleton className="h-96" /> : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Grove</TableHead>
                <TableHead className="text-right">Rain (mm)</TableHead>
                <TableHead className="text-right">Min °C</TableHead>
                <TableHead className="text-right">Max °C</TableHead>
                <TableHead className="text-right">Humidity</TableHead>
                <TableHead className="text-right">Leaf wet (h)</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No weather entries match your filters.</TableCell></TableRow>
              ) : data.map((e) => (
                <TableRow key={e.id} data-testid={`row-weather-${e.id}`}>
                  <TableCell className="whitespace-nowrap">{format(new Date(e.observedDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{e.groveName ?? `#${e.groveId}`}</TableCell>
                  <TableCell className="text-right font-mono">{e.rainfallMm != null ? e.rainfallMm.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{e.tempMinC != null ? e.tempMinC.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{e.tempMaxC != null ? e.tempMaxC.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{e.humidityAvgPct != null ? `${Math.round(e.humidityAvgPct)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{e.leafWetnessHours != null ? e.leafWetnessHours.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{e.source}</TableCell>
                  <TableCell className="max-w-xs truncate" title={e.notes ?? ""}>{e.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function mergeRainSeries(
  current: { date: string; cumulativeMm: number }[],
  longTerm: { date: string; cumulativeMm: number }[],
) {
  const ltByDate = new Map(longTerm.map((d) => [d.date, d.cumulativeMm]));
  return current.map((d) => ({ date: d.date, current: d.cumulativeMm, longTerm: ltByDate.get(d.date) ?? null }));
}

function LiveWeatherTile({ groveId }: { groveId: number }) {
  const params = { groveId };
  const { data, isLoading, isError } = useGetLiveWeather(params, {
    query: { queryKey: getGetLiveWeatherQueryKey(params), refetchInterval: 15 * 60_000 },
  });
  if (isLoading) return <Skeleton className="h-32" />;
  if (isError || !data) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        Live weather unavailable for this grove right now (Open-Meteo upstream).
      </CardContent></Card>
    );
  }
  const c = data.current;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /> Live weather · {data.groveName ?? `#${data.groveId}`}</h3>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.source} · cached until {format(new Date(data.cacheExpiresAt), "HH:mm")}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Temperature" value={`${c.tempC.toFixed(1)} °C`} testid="live-temp" />
          <Stat label="Wind" value={`${c.windKph.toFixed(0)} kph`} />
          <Stat label="Humidity" value={`${Math.round(c.humidityPct)}%`} />
          <Stat label="Precip (last hr)" value={c.precipMm != null ? `${c.precipMm.toFixed(1)} mm` : "—"} />
        </div>
        <div className="border-t pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">7-day forecast</div>
          <div className="grid grid-cols-7 gap-2">
            {data.forecast.slice(0, 7).map((d) => (
              <div key={d.date} className="text-center border rounded-md p-2">
                <div className="text-[10px] text-muted-foreground">{format(new Date(d.date), "EEE")}</div>
                <div className="text-xs font-mono mt-1">{d.tempMaxC.toFixed(0)}° / {d.tempMinC.toFixed(0)}°</div>
                <div className="text-[10px] text-blue-700 mt-1 flex items-center justify-center gap-1">
                  <Droplets className="h-3 w-3" /> {d.precipMm.toFixed(1)}mm
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid?: string }) {
  return (
    <div className="border rounded-md p-3" data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
