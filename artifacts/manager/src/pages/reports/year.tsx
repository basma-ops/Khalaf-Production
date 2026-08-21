import { useGetYearReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Stat({ label, value, suffix }: { label: string; value: string | number | null | undefined; suffix?: string }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {value == null || value === "" ? "—" : typeof value === "number" ? value.toFixed(2) : value}
        {value != null && value !== "" && suffix ? <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span> : null}
      </div>
    </div>
  );
}

function Section({ title, description, children, empty }: { title: string; description?: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {empty ? <p className="text-sm text-muted-foreground italic">No data captured for this section yet.</p> : children}
      </CardContent>
    </Card>
  );
}

export function YearReportContent({ year }: { year: number }) {
  const { data, isLoading } = useGetYearReport(year);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const rainfallChart = data.rainfall.map((r) => ({ name: MONTHS[r.month - 1], current: r.currentMm, longTermAvg: r.longTermAvgMm }));
  const pestChart = data.pestPressure.map((p) => ({ name: MONTHS[p.month - 1], traps: p.trapCount, finds: p.scoutingFinds }));
  const phenologyChart = data.phenologyShifts
    .filter((p) => p.shiftDays != null)
    .map((p) => ({ name: p.bbchStage, shift: p.shiftDays! }));

  const noWeather = data.rainfall.every((r) => r.currentMm === 0 && r.longTermAvgMm == null);
  const noPest = data.pestPressure.every((p) => p.trapCount === 0 && p.scoutingFinds === 0);
  const noPhen = phenologyChart.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Treatments" value={data.treatments.count} />
        <Stat label="Pruning activities" value={data.pruningCount} />
        <Stat label="Harvest" value={data.harvest.totalKg} suffix="kg" />
        <Stat label="Bottled" value={data.bottling.totalLitersBottled} suffix="L" />
      </div>

      <Section title="Rainfall vs long-term average" description="Monthly rainfall in mm." empty={noWeather}>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={rainfallChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="current" name={`${year} mm`} stroke="#0ea5e9" strokeWidth={2} />
              <Line type="monotone" dataKey="longTermAvg" name="Long-term avg" stroke="#94a3b8" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Phenology shifts" description="Days earlier (negative) or later (positive) compared with the prior year, by BBCH stage." empty={noPhen}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={phenologyChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="shift" name="Days vs prior year" fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {data.phenologyShifts.length > 0 && (
          <Table className="mt-4">
            <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead>This year</TableHead><TableHead>Prior year</TableHead><TableHead className="text-right">Shift (days)</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.phenologyShifts.map((p) => (
                <TableRow key={p.bbchStage}>
                  <TableCell className="font-mono text-xs">{p.bbchStage}</TableCell>
                  <TableCell>{p.thisYearFirstObserved ?? "—"}</TableCell>
                  <TableCell>{p.priorYearFirstObserved ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.shiftDays ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Pest pressure" description="Trap catches and scouting finds by month." empty={noPest}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={pestChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="traps" name="Trap catches" fill="#dc2626" />
              <Bar dataKey="finds" name="Scouting finds" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Treatments by kind" empty={data.treatments.byKind.length === 0}>
          <Table>
            <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.treatments.byKind.map((t) => (
                <TableRow key={t.treatmentKind}><TableCell>{t.treatmentKind}</TableCell><TableCell className="text-right">{t.count}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Activity totals" empty={data.activityTotals.length === 0}>
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Minutes</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.activityTotals.map((a) => (
                <TableRow key={a.activityType}>
                  <TableCell>{a.activityType}</TableCell>
                  <TableCell className="text-right">{a.count}</TableCell>
                  <TableCell className="text-right">{a.totalDurationMinutes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <Section title="Harvest summary" description={data.harvest.seasonName ?? `Season for ${year}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Total kg" value={data.harvest.totalKg} suffix="kg" />
          <Stat label="Mean Jaén" value={data.harvest.meanJaen} />
          <Stat label="Mean pressing delay" value={data.harvest.meanPressingDelayHours} suffix="h" />
        </div>
      </Section>

      <Section title="Oil quality highlights" empty={!data.oilQuality.bestAcidity && !data.oilQuality.worstAcidity && !data.oilQuality.highestPolyphenols}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            ["Best acidity (lowest)", data.oilQuality.bestAcidity, "acidity"],
            ["Worst acidity (highest)", data.oilQuality.worstAcidity, "acidity"],
            ["Highest polyphenols", data.oilQuality.highestPolyphenols, "totalPolyphenolsMgKg"],
          ] as const).map(([label, h, field]) => (
            <div key={label} className="border rounded-md p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
              {h ? (
                <>
                  <div className="text-xl font-semibold">
                    {(h as unknown as Record<string, number | null>)[field] ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.oilBatchCode ? <span className="font-mono">{h.oilBatchCode}</span> : null}
                    {h.sampleDate ? <span> · {h.sampleDate}</span> : null}
                  </div>
                </>
              ) : <span className="text-sm text-muted-foreground italic">No labs.</span>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Bottling summary" empty={data.bottling.runs === 0}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Stat label="Bottling runs" value={data.bottling.runs} />
          <Stat label="Litres bottled" value={data.bottling.totalLitersBottled} suffix="L" />
        </div>
        {data.bottling.formats.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Format</TableHead><TableHead className="text-right">Bottles</TableHead><TableHead className="text-right">Litres</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.bottling.formats.map((f, i) => (
                <TableRow key={i}>
                  <TableCell>{f.format ?? "—"}</TableCell>
                  <TableCell className="text-right">{f.bottles}</TableCell>
                  <TableCell className="text-right">{f.liters}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Heritage rule evidence delta" description="Change in evidence count vs prior year." empty={data.heritage.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">{year - 1}</TableHead>
              <TableHead className="text-right">{year}</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.heritage.map((h) => (
              <TableRow key={h.heritageRuleId}>
                <TableCell>
                  <div className="font-mono text-xs text-muted-foreground">{h.ruleCode}</div>
                  <div>{h.ruleName}</div>
                </TableCell>
                <TableCell><Badge variant="outline">{h.status}</Badge></TableCell>
                <TableCell className="text-right">{h.evidenceCountPriorYear}</TableCell>
                <TableCell className="text-right">{h.evidenceCountThisYear}</TableCell>
                <TableCell className={`text-right font-semibold ${h.deltaCount > 0 ? "text-green-700" : h.deltaCount < 0 ? "text-red-700" : ""}`}>
                  {h.deltaCount > 0 ? `+${h.deltaCount}` : h.deltaCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

import { useRoute } from "wouter";
import { Calendar } from "lucide-react";

export default function YearReportPage() {
  const [, params] = useRoute("/reports/year/:year");
  const year = params?.year ? Number(params.year) : new Date().getFullYear();
  return (
    <div className="p-8 space-y-6" data-testid="year-report">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" /> Year report — {year}
        </h1>
        <p className="text-muted-foreground mt-2">Cross-cutting summary of operations, harvest, oil quality, and heritage signals for the calendar year.</p>
      </div>
      <YearReportContent year={year} />
    </div>
  );
}
