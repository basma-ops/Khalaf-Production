import { useState } from "react";
import { useGetHarvestReport, useListHarvestSeasons } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart3, Award, HeartPulse } from "lucide-react";

function Stat({ label, value, suffix }: { label: string; value: string | number | null | undefined; suffix?: string }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {value == null ? "—" : typeof value === "number" ? value.toFixed(2) : value}
        {value != null && suffix ? <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span> : null}
      </div>
    </div>
  );
}

export default function HarvestReportPage() {
  const { data: seasons } = useListHarvestSeasons();
  const [seasonId, setSeasonId] = useState<string>("");
  const { data, isLoading } = useGetHarvestReport(seasonId ? { seasonId: Number(seasonId) } : undefined);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Harvest Report
        </h1>
        <p className="text-muted-foreground mt-2">
          End-of-season summary: kg per grove and per tree, mean Jaén maturity at harvest, pressing delay,
          oil yield, and lab quality flags.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs uppercase">Season</Label>
          <Select value={seasonId} onValueChange={setSeasonId}>
            <SelectTrigger className="w-64"><SelectValue placeholder={data?.seasonName ?? "Active season"} /></SelectTrigger>
            <SelectContent>
              {(seasons ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data?.seasonName && <Badge variant="outline" className="mb-2">{data.seasonName}</Badge>}
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Total harvested" value={data.totalKg} suffix="kg" />
            <Stat label="Mean maturity (Jaén)" value={data.meanMaturityAtHarvest} />
            <Stat label="Mean pressing delay" value={data.meanPressingDelayHours} suffix="h" />
            <Stat label="Oil yield" value={data.oilYieldPercent} suffix="%" />
            <Stat label="Total oil" value={data.totalOilLiters} suffix="L" />
          </div>

          <Card>
            <CardHeader><CardTitle>Per grove</CardTitle></CardHeader>
            <CardContent>
              {data.kgPerGrove.length === 0 ? (
                <p className="text-sm text-muted-foreground">No harvest events yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2">Grove</th><th className="py-2">Trees harvested</th><th className="py-2 text-right">Total kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kgPerGrove.map((g) => (
                      <tr key={g.groveId} className="border-b">
                        <td className="py-2">{g.groveName ?? `#${g.groveId}`}</td>
                        <td className="py-2">{g.treeCount}</td>
                        <td className="py-2 text-right font-mono">{g.totalKg.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top trees</CardTitle></CardHeader>
            <CardContent>
              {data.kgPerTree.length === 0 ? (
                <p className="text-sm text-muted-foreground">No harvest events yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2">Tree</th><th className="py-2">Grove</th><th className="py-2 text-right">Total kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kgPerTree.map((t) => (
                      <tr key={t.treeId} className="border-b">
                        <td className="py-2 font-mono">{t.treeCode ?? `#${t.treeId}`}</td>
                        <td className="py-2">{t.groveName ?? "—"}</td>
                        <td className="py-2 text-right font-mono">{t.totalKg.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lab quality flags</CardTitle></CardHeader>
            <CardContent>
              {data.labResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lab results yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.labResults.map((r) => (
                    <div key={r.id} className="border rounded-md p-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono">{r.oilBatchCode ?? `Lab #${r.id}`}</span>
                      <Badge variant="outline">{r.attributionLevel}</Badge>
                      {r.isExtraVirgin === true && (
                        <Badge className="bg-emerald-600/15 text-emerald-700 border-emerald-600/30"><Award className="h-3 w-3 mr-1" />Extra Virgin</Badge>
                      )}
                      {r.isHealthClaimEligible === true && (
                        <Badge className="bg-rose-600/15 text-rose-700 border-rose-600/30"><HeartPulse className="h-3 w-3 mr-1" />Health-claim</Badge>
                      )}
                      <span className="text-muted-foreground text-xs">
                        Acidity {r.acidity ?? "—"} · Peroxide {r.peroxideValue ?? "—"} · Polyphenols {r.totalPolyphenolsMgKg ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
