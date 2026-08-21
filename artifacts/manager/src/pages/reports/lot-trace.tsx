import { Link, useRoute } from "wouter";
import { useGetLotTraceReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";

export default function LotTraceReportPage() {
  const [, params] = useRoute("/reports/lot-trace/:bottlingRunId");
  const id = params?.bottlingRunId ? Number(params.bottlingRunId) : 0;
  const { data, isLoading } = useGetLotTraceReport(id);

  if (isLoading || !data) return <div className="p-8"><Skeleton className="h-96" /></div>;

  const run = data.bottlingRun;

  return (
    <div className="p-8 space-y-6 print:p-4">
      <div className="print:hidden">
        <Link href={`/bottling/${id}`} className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to bottling run
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-serif font-bold mt-1 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Lot trace report
        </h1>
        <p className="text-muted-foreground">
          <span className="font-mono">{run.runCode}</span>
          {run.lotCode ? <> · lot <span className="font-mono">{run.lotCode}</span></> : null}
          {run.label ? <> · {run.label}</> : null}
          {" "}· bottled {run.bottledAt}
          {run.location ? <> · {run.location}</> : null}
          {" "}<Badge variant="outline" className="ml-1">{run.status}</Badge>
          {run.singleTree && <Badge variant="outline" className="ml-1">Single tree</Badge>}
          {run.singleGrove && <Badge variant="outline" className="ml-1">Single grove</Badge>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Bottles produced" value={run.bottlesProduced?.toString() ?? "—"} />
        <StatCard label="Format" value={run.format ?? (run.bottleSizeMl ? `${run.bottleSizeMl} mL` : "—")} />
        <StatCard label="Total L bottled" value={run.totalLitersBottled != null ? run.totalLitersBottled.toFixed(2) : "—"} />
        <StatCard label="L drawn" value={data.totalLitersDrawn != null ? data.totalLitersDrawn.toFixed(2) : "—"} />
        <StatCard label="Trees in lot" value={String(data.treeCount)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Oil source chain ({data.sources.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oil batch</TableHead>
                <TableHead className="text-right">L drawn</TableHead>
                <TableHead>Pressing run</TableHead>
                <TableHead>Mill</TableHead>
                <TableHead className="text-right">Press delay (h)</TableHead>
                <TableHead>Harvest batch</TableHead>
                <TableHead>Season</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No oil sources allocated.</TableCell></TableRow>
              ) : data.sources.map((s) => (
                <TableRow key={s.oilBatchId}>
                  <TableCell className="font-mono">{s.oilBatchCode ?? `#${s.oilBatchId}`}</TableCell>
                  <TableCell className="text-right font-mono">{s.litersDrawn.toFixed(2)}</TableCell>
                  <TableCell>{s.pressingRunId != null ? `#${s.pressingRunId}` : "—"}</TableCell>
                  <TableCell>{s.millName ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{s.pressingDelayHours != null ? s.pressingDelayHours.toFixed(1) : "—"}</TableCell>
                  <TableCell className="font-mono">{s.batchCode ?? "—"}</TableCell>
                  <TableCell>{s.seasonName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Grove breakdown ({data.groveBreakdown?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grove</TableHead>
                <TableHead className="text-right">Trees in lot</TableHead>
                <TableHead className="text-right">Contribution (kg)</TableHead>
                <TableHead className="text-right">Share %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.groveBreakdown ?? []).map((g, i) => (
                <TableRow key={i}>
                  <TableCell>{g.groveName ?? (g.groveId != null ? `#${g.groveId}` : "Ungrouped")}</TableCell>
                  <TableCell className="text-right font-mono">{g.treeCount}</TableCell>
                  <TableCell className="text-right font-mono">{g.contributionKg.toFixed(3)}</TableCell>
                  <TableCell className="text-right font-mono">{g.sharePct.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top 25 contributing trees</CardTitle></CardHeader>
        <CardContent>
          {data.topTrees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tree origins yet — recompute origins after allocating sources.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.topTrees.map((t) => (
                <Link key={t.treeId} href={`/trees/${t.treeId}`} className="border rounded overflow-hidden hover:bg-muted/50" data-testid={`top-tree-${t.treeId}`}>
                  <div className="aspect-square bg-muted overflow-hidden flex items-center justify-center">
                    {t.photoUrl ? (
                      <img src={t.photoUrl} alt={t.treeCode ?? `tree ${t.treeId}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No photo</span>
                    )}
                  </div>
                  <div className="p-2 text-xs">
                    <div className="font-mono font-bold truncate">{t.treeCode ?? `#${t.treeId}`}</div>
                    <div className="text-muted-foreground truncate">{t.groveName ?? "—"}</div>
                    {t.variety && t.variety !== "unknown" && <div className="text-muted-foreground truncate">{t.variety}</div>}
                    {t.ancientStatus && t.ancientStatus !== "unknown" && (
                      <Badge variant="outline" className="text-[10px] mt-1">{t.ancientStatus}</Badge>
                    )}
                    <div className="font-mono mt-1 text-[11px]">{t.sharePct.toFixed(2)}% · {t.contributionKg.toFixed(2)} kg</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Heritage rule evidence ({data.heritageEvidence.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.heritageEvidence.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No heritage rule evidence touches the trees, groves, or batches in this lot.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Linked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.heritageEvidence.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{e.ruleCode}</div>
                      <div className="text-xs text-muted-foreground">{e.ruleName}</div>
                    </TableCell>
                    <TableCell className="text-xs">{e.metricName}</TableCell>
                    <TableCell className="font-mono text-xs">{e.metricValue}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{e.confidenceLevel}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {e.treeId != null && <span className="mr-2">tree #{e.treeId}</span>}
                      {e.groveId != null && <span className="mr-2">grove #{e.groveId}</span>}
                      {e.harvestBatchId != null && <span>batch #{e.harvestBatchId}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Lab results in this lot ({data.labResults.length})
            {(run.qualityBasisLabResultIds?.length ?? 0) > 0 && (
              <Badge variant="outline" className="ml-2 text-[10px]">Quality basis pinned</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.labResults.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No lab results attached to this lot.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sample date</TableHead>
                  <TableHead>Lab</TableHead>
                  <TableHead className="text-right">Acidity</TableHead>
                  <TableHead className="text-right">Polyphenols</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.labResults.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.sampleDate ?? "—"}</TableCell>
                    <TableCell>{l.labName ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{l.acidity != null ? l.acidity.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{l.totalPolyphenolsMgKg != null ? Math.round(l.totalPolyphenolsMgKg) : "—"}</TableCell>
                    <TableCell className="space-x-1">
                      {l.acidity != null && l.acidity <= 0.8 && <Badge variant="outline">EVOO</Badge>}
                      {l.totalPolyphenolsMgKg != null && l.totalPolyphenolsMgKg >= 250 && <Badge variant="outline">Health claim</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}
