import { useState } from "react";
import { useGenerateAiInsights, useListGroves } from "@workspace/api-client-react";
import type { AiInsightItem, AiInsightCitation } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, AlertTriangle, Eye, Info } from "lucide-react";

const SEVERITY: Record<string, { label: string; cls: string; Icon: typeof Info }> = {
  info: { label: "Info", cls: "bg-muted text-foreground", Icon: Info },
  watch: { label: "Watch", cls: "bg-amber-100 text-amber-900 border-amber-300", Icon: Eye },
  action_recommended: { label: "Action recommended", cls: "bg-red-100 text-red-900 border-red-300", Icon: AlertTriangle },
};

export default function AIInsightsPage() {
  const { data: groves } = useListGroves();
  const [groveId, setGroveId] = useState<string>("all");
  const [days, setDays] = useState<string>("14");
  const mut = useGenerateAiInsights();

  const onGenerate = () => {
    mut.mutate({
      data: {
        groveId: groveId !== "all" ? parseInt(groveId, 10) : undefined,
        lookbackDays: parseInt(days, 10),
      },
    });
  };

  const data = mut.data;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Manager AI Insights
        </h1>
        <p className="text-muted-foreground mt-2">
          Grounded summary of recent estate signals — satellite alerts, pest finds, lab results, weather, treatments,
          phenology, harvest, bottling. Every insight cites the records it was drawn from. Cautious language only —
          confirm in the field before acting.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Grove (optional)</Label>
            <Select value={groveId} onValueChange={setGroveId}>
              <SelectTrigger className="w-56" data-testid="select-grove"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groves</SelectItem>
                {(groves ?? []).map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Window</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-36" data-testid="select-window"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onGenerate} disabled={mut.isPending} data-testid="button-generate">
            {mut.isPending ? "Analyzing…" : "Generate insights"}
          </Button>
        </CardContent>
      </Card>

      {mut.isPending && <Skeleton className="h-64" />}

      {mut.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-red-700">
            Unable to generate insights right now. Check that the Anthropic integration is configured, then try again.
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg">Summary</h2>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {data.model} · {new Date(data.generatedAt).toLocaleString()}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{data.summary}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {Object.entries(data.recordCounts).map(([k, n]) => (
                  <Badge key={k} variant="outline" className="text-[10px]">
                    {k.replace(/_/g, " ")}: {n}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.insights.map((it, i) => <InsightCard key={i} item={it} />)}

          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="p-4 text-sm text-amber-900">
              <div className="font-semibold mb-1">Limitations</div>
              <p className="leading-relaxed">{data.limitations}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InsightCard({ item }: { item: AiInsightItem }) {
  const sev = SEVERITY[item.severity] ?? SEVERITY.info;
  const { Icon } = sev;
  return (
    <Card data-testid="card-insight">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-base font-semibold">{item.headline}</h3>
              <Badge variant="outline" className={`text-[10px] border ${sev.cls}`}>{sev.label}</Badge>
              {item.suggestedTaskType && (
                <Badge variant="secondary" className="text-[10px]">suggested task: {item.suggestedTaskType}</Badge>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{item.body}</p>
          </div>
        </div>
        {item.citations.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Cited records ({item.citations.length})
            </div>
            <ul className="space-y-1">
              {item.citations.map((c: AiInsightCitation, i: number) => (
                <li key={i} className="text-xs flex gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {c.recordType}#{c.recordId}
                  </Badge>
                  <span className="text-muted-foreground">{c.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
