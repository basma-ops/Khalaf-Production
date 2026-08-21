import { useMemo, useState } from "react";
import {
  useListAnalysisResults,
  useReviewAnalysisResult,
  useCreateTaskFromAnalysis,
  useLinkAnalysisToHeritageRule,
  useListHeritageRules,
  useListGroves,
  getListAnalysisResultsQueryKey,
  type ReviewAnalysisRequestReviewStatus,
  type CreateTaskFromAnalysisRequestPriority,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  MapPin,
  ShieldCheck,
  XCircle,
  ListChecks,
  Beaker,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnalysisCard } from "@/components/analysis-card";
import { Link } from "wouter";

function detailRow(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 text-sm py-1 border-b border-border/40 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{String(value).replace(/_/g, " ")}</span>
    </div>
  );
}

const PURPOSE_OPTIONS = [
  "general",
  "pre_harvest",
  "box",
  "pest",
  "disease",
  "damage",
  "pruning_before",
  "pruning_after",
  "growth",
];

export default function PhotoAnalysisPage() {
  const [reviewFilter, setReviewFilter] = useState<string>("pending");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [groveFilter, setGroveFilter] = useState<string>("all");
  const [treeCodeFilter, setTreeCodeFilter] = useState<string>("");
  const [confidenceMin, setConfidenceMin] = useState<string>("");
  const { data: groves } = useListGroves();
  const analysisParams = {
    reviewStatus: reviewFilter === "all" ? undefined : reviewFilter,
    needsFieldVerification: verificationFilter === "all" ? undefined : verificationFilter,
    purpose: purposeFilter === "all" ? undefined : purposeFilter,
    groveId: groveFilter === "all" ? undefined : Number(groveFilter),
    confidenceMin: confidenceMin ? Number(confidenceMin) : undefined,
    limit: 200,
  };
  // Auto-refresh so newly auto-analyzed worker uploads appear here.
  const { data: rawResults, isLoading } = useListAnalysisResults(analysisParams, {
    query: {
      queryKey: getListAnalysisResultsQueryKey(analysisParams),
      refetchInterval: 15_000,
    },
  });
  const results = useMemo(() => {
    const t = treeCodeFilter.trim().toLowerCase();
    if (!t) return rawResults;
    return (rawResults ?? []).filter((r) => (r.treeCode ?? "").toLowerCase().includes(t));
  }, [rawResults, treeCodeFilter]);
  const { data: rules } = useListHeritageRules();
  const review = useReviewAnalysisResult();
  const createTask = useCreateTaskFromAnalysis();
  const linkRule = useLinkAnalysisToHeritageRule();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => results?.find((r) => r.id === selectedId) ?? results?.[0] ?? null,
    [results, selectedId]
  );

  const [reviewNotes, setReviewNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("inspection");
  const [taskPriority, setTaskPriority] = useState<CreateTaskFromAnalysisRequestPriority>(
    "medium" as CreateTaskFromAnalysisRequestPriority,
  );
  const [linkedRuleId, setLinkedRuleId] = useState<string>("");

  function refreshList() {
    queryClient.invalidateQueries({ queryKey: getListAnalysisResultsQueryKey() });
  }

  function handleReview(status: ReviewAnalysisRequestReviewStatus) {
    if (!selected) return;
    review.mutate(
      {
        id: selected.id,
        data: { reviewStatus: status, reviewNotes: reviewNotes || null },
      },
      {
        onSuccess: () => {
          toast({ title: `Marked as ${status.replace(/_/g, " ")}` });
          setReviewNotes("");
          refreshList();
        },
        onError: (e) =>
          toast({ title: "Review failed", description: (e as Error).message, variant: "destructive" }),
      }
    );
  }

  function handleCreateTask() {
    if (!selected || !taskTitle.trim()) return;
    createTask.mutate(
      {
        id: selected.id,
        data: {
          title: taskTitle,
          taskType,
          priority: taskPriority,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task created from analysis" });
          setTaskTitle("");
          refreshList();
        },
        onError: (e) =>
          toast({ title: "Could not create task", description: (e as Error).message, variant: "destructive" }),
      }
    );
  }

  function handleLinkRule() {
    if (!selected || !linkedRuleId) return;
    linkRule.mutate(
      {
        id: selected.id,
        data: { heritageRuleId: parseInt(linkedRuleId, 10) },
      },
      {
        onSuccess: () => {
          toast({ title: "Linked to heritage rule" });
          refreshList();
        },
        onError: (e) =>
          toast({ title: "Link failed", description: (e as Error).message, variant: "destructive" }),
      }
    );
  }

  return (
    <div className="p-8 space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          Visual Tree Intelligence
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Worker photos are auto-analyzed for possible visual signals. Every result is{" "}
          <span className="font-semibold text-amber-700">cautious by design</span> — confirm,
          reject, or send back for field verification before any operational decision.
        </p>
        <div className="mt-2 flex gap-3">
          <Link href="/photo-analysis/test" className="text-sm text-primary underline" data-testid="link-test-page">
            Open 16-photo test page →
          </Link>
          <Link href="/photos" className="text-sm text-primary underline" data-testid="link-photos">
            Browse photo library →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={reviewFilter} onValueChange={setReviewFilter}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
            <TabsTrigger value="needs_verification">Needs verification</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={verificationFilter} onValueChange={setVerificationFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-verification-filter">
            <SelectValue placeholder="Field verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any verification status</SelectItem>
            <SelectItem value="yes">Needs field verification</SelectItem>
            <SelectItem value="no">No verification flag</SelectItem>
          </SelectContent>
        </Select>
        <Select value={purposeFilter} onValueChange={setPurposeFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-purpose-filter">
            <SelectValue placeholder="Purpose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any purpose</SelectItem>
            {PURPOSE_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groveFilter} onValueChange={setGroveFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-grove-filter">
            <SelectValue placeholder="Grove" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groves</SelectItem>
            {(groves ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Tree code…"
          value={treeCodeFilter}
          onChange={(e) => setTreeCodeFilter(e.target.value)}
          className="w-[140px]"
          data-testid="input-tree-filter"
        />
        <Input
          type="number"
          step="0.05"
          min="0"
          max="1"
          placeholder="Min confidence"
          value={confidenceMin}
          onChange={(e) => setConfidenceMin(e.target.value)}
          className="w-[140px]"
          data-testid="input-confidence-filter"
        />
        <Badge variant="outline" className="text-xs">
          {results?.length ?? 0} result(s)
        </Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 flex-1 min-h-0">
        <div className="space-y-3 overflow-y-auto pr-2">
          {isLoading && (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          )}
          {!isLoading && (results ?? []).length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No analysis results match this filter.
              </CardContent>
            </Card>
          )}
          {(results ?? []).map((r) => (
            <AnalysisCard
              key={r.id}
              result={r}
              selected={selected?.id === r.id}
              onClick={() => setSelectedId(r.id)}
            />
          ))}
        </div>

        <div className="overflow-y-auto pr-2">
          {selected ? (
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-serif">
                    Analysis #{selected.id}
                  </CardTitle>
                  <Badge variant="outline">{selected.context.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Provider: {selected.provider} · Created{" "}
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                {selected.media?.fileUrl && (
                  <img
                    src={selected.media.fileUrl}
                    alt={selected.media.originalFileName ?? ""}
                    className="w-full max-h-[420px] object-contain rounded border bg-muted"
                  />
                )}

                <div className="grid grid-cols-2 gap-x-6">
                  <div>
                    {detailRow("Tree", selected.treeCode)}
                    {detailRow("Grove", selected.groveName)}
                    {detailRow("Purpose", selected.media?.purpose)}
                    {detailRow("Side of tree", selected.media?.photoSide)}
                    {detailRow("Captured", selected.media?.capturedAt ? new Date(selected.media.capturedAt).toLocaleString() : null)}
                    {detailRow("GPS", selected.media?.gpsLat != null && selected.media?.gpsLon != null ? `${selected.media.gpsLat.toFixed(5)}, ${selected.media.gpsLon.toFixed(5)}` : null)}
                  </div>
                  <div>
                    {detailRow("Image quality", selected.imageQuality)}
                    {detailRow("Blur score", selected.blurScore?.toFixed(3))}
                    {detailRow("Brightness", selected.brightnessScore?.toFixed(3))}
                    {detailRow("Confidence", selected.confidenceScore?.toFixed(2))}
                    {detailRow("Verification flag", selected.needsFieldVerification)}
                  </div>
                </div>

                <div className="rounded border bg-muted/30 p-3 space-y-1">
                  <h4 className="font-semibold text-sm">Visual signals</h4>
                  <div className="grid grid-cols-2 gap-x-6 text-xs">
                    {detailRow("Canopy density", selected.canopyDensity)}
                    {detailRow("Canopy greenness", selected.canopyGreennessScore?.toFixed(2))}
                    {detailRow("Yellowing", selected.yellowingSignal)}
                    {detailRow("Drought stress", selected.droughtStressVisualSignal)}
                    {detailRow("Pruning need", selected.pruningNeedSignal)}
                    {detailRow("Fruit maturity", selected.fruitMaturityVisualEstimate)}
                    {detailRow("Fruit damage", selected.fruitDamageSignal)}
                    {detailRow("Trunk", selected.trunkConditionSignal)}
                    {detailRow("Roots", selected.rootExposureSignal)}
                    {detailRow("Terrace", selected.terraceConditionSignal)}
                    {detailRow("Understory", selected.understoryVisualSignal)}
                  </div>
                  {(selected.possiblePestOrDiseaseCues ?? []).length > 0 && (
                    <div className="pt-2">
                      <h4 className="font-semibold text-sm mb-1">Possible pest / disease cues</h4>
                      <div className="space-y-1">
                        {(selected.possiblePestOrDiseaseCues as Array<{ cue: string; severity: string; notes?: string | null }>).map((c, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-mono text-purple-700">{c.cue}</span> — {c.severity}
                            {c.notes && <span className="text-muted-foreground"> · {c.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selected.summary && (
                  <div className="rounded border bg-background p-3">
                    <h4 className="font-semibold text-sm mb-1">Summary</h4>
                    <p className="text-sm text-foreground/90 italic">"{selected.summary}"</p>
                  </div>
                )}
                {selected.limitations && (
                  <div className="rounded border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <h4 className="font-semibold text-sm mb-1 flex items-center gap-1 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4" /> Limitations
                    </h4>
                    <p className="text-xs text-amber-900 dark:text-amber-200">{selected.limitations}</p>
                  </div>
                )}
                {selected.recommendedFollowUp && (
                  <div className="rounded border bg-background p-3">
                    <h4 className="font-semibold text-sm mb-1">Recommended follow-up</h4>
                    <p className="text-sm">{selected.recommendedFollowUp}</p>
                    {selected.recommendedTaskType && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Suggested task type: <span className="font-mono">{selected.recommendedTaskType}</span>
                      </p>
                    )}
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-1">
                    <ListChecks className="h-4 w-4" /> Manager review
                  </h4>
                  <Textarea
                    placeholder="Optional review notes…"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    data-testid="textarea-review-notes"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleReview("confirmed" as ReviewAnalysisRequestReviewStatus)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={review.isPending}
                      data-testid="button-confirm"
                    >
                      <ShieldCheck className="h-4 w-4 mr-1" /> Confirm
                    </Button>
                    <Button
                      variant="outline"
                      className="border-amber-400 text-amber-700"
                      onClick={() => handleReview("needs_verification" as ReviewAnalysisRequestReviewStatus)}
                      disabled={review.isPending}
                      data-testid="button-needs-verification"
                    >
                      <AlertTriangle className="h-4 w-4 mr-1" /> Needs field verification
                    </Button>
                    <Button
                      variant="outline"
                      className="border-destructive text-destructive"
                      onClick={() => handleReview("rejected" as ReviewAnalysisRequestReviewStatus)}
                      disabled={review.isPending}
                      data-testid="button-reject"
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Create follow-up task
                  </h4>
                  <Input
                    placeholder="Task title (e.g. Verify possible peacock spot on Tree T-0042)"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    data-testid="input-task-title"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Select value={taskType} onValueChange={setTaskType}>
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="treatment">Treatment</SelectItem>
                        <SelectItem value="pruning">Pruning</SelectItem>
                        <SelectItem value="irrigation">Irrigation</SelectItem>
                        <SelectItem value="harvest">Harvest</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={taskPriority}
                      onValueChange={(v) => setTaskPriority(v as CreateTaskFromAnalysisRequestPriority)}
                    >
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleCreateTask} disabled={createTask.isPending || !taskTitle} data-testid="button-create-task">
                      Create task
                    </Button>
                  </div>
                  {selected.createdTaskId && (
                    <p className="text-xs text-emerald-700">Task #{selected.createdTaskId} already linked.</p>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-1">
                    <Beaker className="h-4 w-4" /> Link as heritage-rule evidence
                  </h4>
                  {selected.reviewStatus !== "confirmed" ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      Confirm this analysis first — heritage-rule linking is only allowed after a manager has reviewed and confirmed the cue.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Select value={linkedRuleId} onValueChange={setLinkedRuleId}>
                          <SelectTrigger className="flex-1" data-testid="select-rule">
                            <SelectValue placeholder="Pick a heritage rule" />
                          </SelectTrigger>
                          <SelectContent>
                            {(rules ?? []).map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.ruleCode} — {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleLinkRule}
                          disabled={!linkedRuleId || linkRule.isPending}
                          data-testid="button-link-rule"
                        >
                          Link
                        </Button>
                      </div>
                      {selected.linkedHeritageRuleId && (
                        <p className="text-xs text-emerald-700">
                          Linked to heritage rule #{selected.linkedHeritageRuleId} (evidence row #{selected.linkedRuleEvidenceId}).
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Camera className="h-10 w-10 mx-auto mb-3 opacity-50" />
                Select a result on the left to review.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
