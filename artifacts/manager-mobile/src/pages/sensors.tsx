import { useListSensorStreams, useListSensorReadings } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Sensors() {
  const { data: streams, isLoading: loadingStreams } = useListSensorStreams();
  const firstStreamId = streams?.[0]?.id ?? 0;
  const { data: readings, isLoading: loadingReadings } = useListSensorReadings(
    firstStreamId,
    { limit: 10 },
  );

  if (loadingStreams || (firstStreamId > 0 && loadingReadings)) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!streams?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <Radio className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">No sensors active.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Sensor Streams</h2>
        <div className="space-y-3">
          {streams.map((stream) => (
            <div key={stream.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {stream.name ?? `Stream #${stream.id}`}
                </span>
                <span className="text-xs text-muted-foreground">{stream.kind}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stream.attachedEntityLabel ?? "Unassigned"}
                {stream.lastValueNumeric != null && (
                  <span className="ml-2 text-foreground font-medium">
                    {stream.lastValueNumeric} {stream.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      {firstStreamId > 0 && readings?.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Latest Readings — {streams[0].name ?? `Stream #${firstStreamId}`}
          </h2>
          <div className="space-y-2">
            {readings.map((reading) => (
              <div key={reading.id} className="flex justify-between items-center rounded border border-border bg-card p-3 shadow-sm text-sm">
                <span className="text-foreground">
                  {reading.valueNumeric ?? "—"} {streams[0].unit}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(reading.observedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
