import {
  useGetDashboardOverview,
  useListPhotos,
  useListHeritageRules,
  useGetYieldForecast,
  getGetDashboardOverviewQueryKey,
  getListPhotosQueryKey,
  getGetYieldForecastQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Plus, Sprout } from "lucide-react";

const PLACE_STAMP = {
  location: "Rameh, Galilee",
  season: "Late Spring",
  footnote: "45 seasons of climate data on file",
};

const PHASE_LABEL = "Phase 0";

const PHASE_TIMELINE: Array<{
  index: number;
  title: string;
  detail: string;
  status: "done" | "in-progress" | "pending";
}> = [
  {
    index: 1,
    title: "Estate setup",
    detail: "Groves drawn · trees imported · satellite baseline",
    status: "done",
  },
  {
    index: 2,
    title: "Tree registry",
    detail: "Trees from baseline + ongoing additions",
    status: "done",
  },
  {
    index: 3,
    title: "Photo library",
    detail: "Bulk import + EXIF GPS matching · review",
    status: "done",
  },
  {
    index: 4,
    title: "Field verification",
    detail: "Worker app captures ground-truth visits per tree",
    status: "in-progress",
  },
  {
    index: 5,
    title: "Heritage rules",
    detail: "Traditional rules paired with scientific evidence",
    status: "in-progress",
  },
];

function formatDateStamp(d: Date): string {
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${day} · ${date} · ${PHASE_LABEL}`;
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Good night.";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}

interface StatColumnProps {
  label: string;
  value: string | number;
  caption: string;
  testId?: string;
}

function StatColumn({ label, value, caption, testId }: StatColumnProps) {
  return (
    <div className="px-6 py-5 first:pl-0" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 font-serif text-4xl font-light text-foreground tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data: overview, isLoading } = useGetDashboardOverview({
    query: { queryKey: getGetDashboardOverviewQueryKey(), refetchInterval: 15_000 },
  });
  // Approximate "Photos in Archive" by fetching a large page and counting.
  // The endpoint does not yet expose a total count; this is a lower bound that
  // reflects the most recent 200 uploads — accurate for current data volumes
  // and honest about the cap (caption clarifies it is "recent" data).
  const photosParams = { limit: 200 };
  const { data: latestPhotos } = useListPhotos(photosParams, {
    query: { queryKey: getListPhotosQueryKey(photosParams), refetchInterval: 15_000 },
  });
  const { data: heritageRules } = useListHeritageRules();
  const { data: forecast, isLoading: forecastLoading } = useGetYieldForecast(
    {},
    { query: { queryKey: getGetYieldForecastQueryKey({}) } },
  );

  const now = new Date();
  const dateStamp = formatDateStamp(now);
  const greeting = greetingFor(now);

  const trees = overview?.totalActiveTrees ?? 0;
  const groves = overview?.totalGroves ?? 0;
  // No field-verification telemetry exposed by the API yet — show 0 honestly
  // until a future task wires the worker-app verification pipeline through.
  const fieldVerified = 0;
  const verifiedPct = trees > 0 ? Math.round((fieldVerified / trees) * 100) : 0;
  const ancientTrees = overview?.verifiedAncientTrees ?? 0;
  const photoCount = latestPhotos?.length ?? 0;
  const satelliteSignals = overview?.openSatelliteAlerts ?? 0;
  const urgentAlerts = overview?.urgentSatelliteAlerts ?? 0;

  return (
    <div className="px-10 py-8 space-y-10">
      {/* Hero */}
      <section className="flex items-start justify-between gap-8" data-testid="dashboard-hero">
        <div className="max-w-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {dateStamp}
          </div>
          <h1 className="mt-3 font-serif text-5xl font-normal tracking-tight text-foreground">
            {greeting}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-5 h-6 w-[36rem] max-w-full" />
          ) : (
            <p className="mt-5 text-[15px] leading-relaxed text-foreground/80">
              The registry stands at{" "}
              <span className="font-semibold text-foreground">
                {trees.toLocaleString()} trees
              </span>{" "}
              across{" "}
              <span className="font-semibold text-foreground">{groves} groves</span>,
              with {fieldVerified} field-verified. {photoCount} recent photos in the
              archive, and {satelliteSignals.toLocaleString()} trees carry an open
              satellite signal.
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {PLACE_STAMP.location}
          </div>
          <div className="mt-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-foreground">
            {PLACE_STAMP.season}
          </div>
          <div className="mt-2 text-xs text-muted-foreground italic">
            {PLACE_STAMP.footnote}
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-t border-b border-border divide-x divide-border"
        data-testid="dashboard-stats"
      >
        <StatColumn
          label="Trees Registered"
          value={trees}
          caption={`across ${groves} groves`}
          testId="stat-trees"
        />
        <StatColumn
          label="Field Verified"
          value={fieldVerified}
          caption={`${verifiedPct}% · target 90%`}
          testId="stat-verified"
        />
        <StatColumn
          label="Ancient Trees"
          value={ancientTrees}
          caption={ancientTrees === 0 ? "none flagged yet" : "confirmed heritage trees"}
          testId="stat-ancient"
        />
        <StatColumn
          label="Photos in Archive"
          value={photoCount}
          caption="recent uploads"
          testId="stat-photos"
        />
        <StatColumn
          label="Satellite Signals"
          value={satelliteSignals}
          caption={
            urgentAlerts > 0
              ? `${urgentAlerts} need urgent inspection`
              : "needs field inspection"
          }
          testId="stat-satellite"
        />
      </section>

      {/* Yield forecast strip */}
      <section className="rounded-lg border border-border bg-card p-6" data-testid="forecast-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
            <Sprout className="h-3.5 w-3.5 text-primary" />
            Yield forecast {forecast?.seasonName ? `· ${forecast.seasonName}` : ""}
          </h2>
          {forecast && (
            <div className="text-sm font-serif">
              Estate total: <span className="font-semibold tabular-nums">{Math.round(forecast.totalEstimatedKg).toLocaleString()} kg</span>
            </div>
          )}
        </div>
        {forecastLoading ? (
          <Skeleton className="h-24" />
        ) : !forecast || forecast.groves.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Not enough prior-season or phenology data to forecast yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {forecast.groves.slice(0, 8).map((g) => (
                <div key={g.groveId} className="border rounded-md p-3" data-testid={`forecast-grove-${g.groveId}`}>
                  <div className="text-xs font-semibold truncate">{g.groveName}</div>
                  <div className="font-serif text-2xl tabular-nums mt-1">
                    {Math.round(g.estimatedKg).toLocaleString()}<span className="text-xs text-muted-foreground"> kg</span>
                  </div>
                  {g.estimatedKgLow != null && g.estimatedKgHigh != null && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      {Math.round(g.estimatedKgLow).toLocaleString()}–{Math.round(g.estimatedKgHigh).toLocaleString()} kg band
                    </div>
                  )}
                  {(g.predictedHarvestStart || g.predictedHarvestEnd) && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Window: {g.predictedHarvestStart ?? "?"}{g.predictedHarvestEnd ? ` → ${g.predictedHarvestEnd}` : ""}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{g.confidence} confidence</Badge>
                    {g.latestBbchStage && <span className="text-[10px] text-muted-foreground">BBCH {g.latestBbchStage}</span>}
                  </div>
                </div>
              ))}
            </div>
            {forecast.limitations && (
              <p className="text-[11px] text-muted-foreground italic mt-3">{forecast.limitations}</p>
            )}
          </>
        )}
      </section>

      {/* Two-column body */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Phase timeline */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-7" data-testid="phase-panel">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {PHASE_LABEL} — what we&apos;ve built
          </h2>
          <ol className="mt-6 divide-y divide-border/70">
            {PHASE_TIMELINE.map((item) => {
              const isDone = item.status === "done";
              const isInProgress = item.status === "in-progress";
              return (
                <li
                  key={item.index}
                  className="flex items-center gap-5 py-5 first:pt-0 last:pb-0"
                  data-testid={`phase-item-${item.index}`}
                >
                  <div
                    className={
                      "flex h-7 w-7 items-center justify-center font-serif text-[13px] font-semibold flex-shrink-0 " +
                      (isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground/70 border border-border")
                    }
                  >
                    {item.index}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-base text-foreground">{item.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.detail}
                    </div>
                  </div>
                  <div className="hidden md:block w-40 lg:w-56 h-1 bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: isDone ? "100%" : isInProgress ? "45%" : "0%" }}
                    />
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground w-16 text-right">
                    {isDone ? "Done" : isInProgress ? "Active" : "Queued"}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Heritage rules */}
        <div className="rounded-lg border border-border bg-card p-7" data-testid="heritage-panel">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Heritage Rules
          </h2>
          <ul className="mt-5 space-y-4">
            {(heritageRules ?? []).slice(0, 8).map((rule) => (
              <li key={rule.id}>
                <Link
                  href="/heritage"
                  className="group flex items-start gap-3 -mx-2 px-2 py-1 rounded transition-colors hover:bg-sidebar-accent/60"
                  data-testid={`heritage-link-${rule.id}`}
                >
                  <Plus className="h-3.5 w-3.5 text-primary mt-1 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-serif text-[15px] text-foreground group-hover:underline truncate">
                      {rule.name}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {rule.status.replace(/_/g, " ")}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {!heritageRules?.length && (
              <li className="text-sm text-muted-foreground italic">No heritage rules yet.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
