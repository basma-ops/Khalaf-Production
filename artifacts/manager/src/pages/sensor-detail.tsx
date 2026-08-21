import { useRoute, Link } from "wouter";
import { useGetSensorStream, useListSensorReadings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Activity } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useMemo } from "react";

export default function SensorDetailPage() {
  const [, params] = useRoute("/sensors/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { data: stream, isLoading } = useGetSensorStream(id);
  const { data: readings } = useListSensorReadings(id, { limit: 500 });

  const series = useMemo(() => {
    if (!readings) return [];
    return [...readings]
      .reverse()
      .map((r) => ({
        t: typeof r.observedAt === "string" ? r.observedAt : new Date(r.observedAt).toISOString(),
        v: r.valueNumeric,
      }));
  }, [readings]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-96" /></div>;
  if (!stream) return <div className="p-8"><h1 className="text-2xl font-bold">Sensor stream not found</h1></div>;

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link href="/sensors" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to sensors
        </Link>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2 mt-1">
          <Activity className="h-6 w-6 text-primary" /> {stream.name ?? `Stream #${stream.id}`}
        </h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline">{stream.kind}</Badge>
          <Badge variant="outline">{stream.unit}</Badge>
          <Badge variant="outline">every {stream.sampleIntervalSeconds}s</Badge>
          <Badge variant="outline">source: {stream.source}</Badge>
          {stream.attachedEntityType && (
            <Badge variant="outline">
              {stream.attachedEntityType} · {stream.attachedEntityLabel ?? `#${stream.attachedEntityId}`}
            </Badge>
          )}
          {stream.status !== "active" ? <Badge variant="secondary">{stream.status}</Badge> :
            stream.isStale ? <Badge className="bg-amber-500 text-amber-50">stale</Badge> :
            <Badge className="bg-emerald-600 text-emerald-50">live</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Readings ({readings?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {!readings || readings.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-readings">
              No readings ingested yet. POST to <code className="text-xs">/api/sensors/streams/{stream.id}/readings</code>{" "}
              with the API token to start streaming data.
            </p>
          ) : (
            <>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(d) => format(new Date(String(d)), "MMM d HH:mm")}
                      fontSize={11}
                      minTickGap={30}
                    />
                    <YAxis fontSize={11} label={{ value: stream.unit, angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <Tooltip labelFormatter={(d) => format(new Date(String(d)), "MMM d, yyyy HH:mm:ss")} />
                    <Line type="monotone" dataKey="v" name={stream.kind} stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-1">Observed</th>
                      <th className="text-right py-1">Value</th>
                      <th className="text-left py-1 pl-3">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`reading-row-${r.id}`}>
                        <td className="py-1 text-xs text-muted-foreground">
                          {format(new Date(r.observedAt), "MMM d, yyyy HH:mm:ss")}
                        </td>
                        <td className="py-1 font-mono text-right">
                          {r.valueNumeric != null ? `${r.valueNumeric} ${stream.unit}` : "—"}
                        </td>
                        <td className="py-1 pl-3 text-xs">{r.qualityFlag}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
