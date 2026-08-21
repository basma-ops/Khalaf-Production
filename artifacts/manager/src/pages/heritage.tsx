import { useListHeritageRules, useGetHeritageRuleEvidenceSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, BookOpen, FlaskConical, ThermometerSun, Activity } from "lucide-react";

function EvidenceRollup({ ruleId }: { ruleId: number }) {
  const year = new Date().getFullYear();
  const { data, isLoading } = useGetHeritageRuleEvidenceSummary(ruleId, { year });
  if (isLoading || !data) return <Skeleton className="h-12 mt-2" />;
  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
        <Activity className="h-3 w-3" /> Evidence rollup ({year})
      </h4>
      <div className="text-xs text-muted-foreground mb-2">
        <span className="font-semibold text-foreground">{data.totalCount}</span> records
      </div>
      {data.byKind.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2" data-testid={`evidence-kinds-${ruleId}`}>
          {data.byKind.map((k) => (
            <Badge key={k.kind} variant="outline" className="text-xs">{k.kind}: {k.count}</Badge>
          ))}
        </div>
      )}
      {data.byMonth.some((m) => m.count > 0) && (
        <div className="flex items-end gap-0.5 h-10" title="Records per month">
          {data.byMonth.map((m) => {
            const max = Math.max(...data.byMonth.map((x) => x.count), 1);
            const h = Math.round((m.count / max) * 100);
            return <div key={m.month} className="flex-1 bg-primary/40 rounded-sm" style={{ height: `${h}%`, minHeight: m.count > 0 ? "4px" : "0" }} title={`Month ${m.month}: ${m.count}`} />;
          })}
        </div>
      )}
    </div>
  );
}

export default function Heritage() {
  const { data: rules, isLoading } = useListHeritageRules();

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'confirmed': return <Badge className="bg-primary text-primary-foreground">Confirmed</Badge>;
      case 'monitoring': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Monitoring</Badge>;
      case 'hypothesis': return <Badge variant="outline" className="text-yellow-700 border-yellow-300">Hypothesis</Badge>;
      case 'needs_data': return <Badge variant="outline" className="text-muted-foreground">Needs Data</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div></div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Heritage Rules
        </h1>
        <p className="text-muted-foreground mt-2">Traditional agricultural intelligence mapped to modern scientific verification.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {rules?.map((rule) => (
          <Card key={rule.id} className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <div className="flex justify-between items-start">
                <Badge variant="outline" className="font-mono text-xs tracking-wider mb-2">{rule.ruleCode}</Badge>
                {getStatusBadge(rule.status)}
              </div>
              <CardTitle className="text-xl font-serif">{rule.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex-1 space-y-4">
              {rule.traditionalRule && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                    <BookOpen className="h-3 w-3" /> Traditional Rule
                  </h4>
                  <p className="text-sm italic border-l-2 border-primary/30 pl-3 py-1 text-foreground/90">
                    "{rule.traditionalRule}"
                  </p>
                </div>
              )}
              
              {rule.scientificHypothesis && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                    <FlaskConical className="h-3 w-3" /> Scientific Hypothesis
                  </h4>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {rule.scientificHypothesis}
                  </p>
                </div>
              )}

              <EvidenceRollup ruleId={rule.id} />

              {rule.climateRisk && (
                <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-100 dark:border-orange-900 mt-auto">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-400 flex items-center gap-1 mb-1">
                    <ThermometerSun className="h-3 w-3" /> Climate Risk Addressed
                  </h4>
                  <p className="text-xs text-orange-900/80 dark:text-orange-300">
                    {rule.climateRisk}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
