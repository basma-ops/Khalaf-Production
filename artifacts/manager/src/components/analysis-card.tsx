import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Camera, CheckCircle2, Eye, MapPin, ShieldCheck, XCircle } from "lucide-react";
import type { PhotoAnalysisResultRich } from "@workspace/api-client-react";

const SIGNAL_BADGE_CLASS: Record<string, string> = {
  none: "bg-emerald-100 text-emerald-800 border-emerald-300",
  mild: "bg-yellow-100 text-yellow-800 border-yellow-300",
  moderate: "bg-orange-100 text-orange-800 border-orange-300",
  severe: "bg-red-100 text-red-800 border-red-300",
  unclear: "bg-muted text-muted-foreground border-border",
  green_dense: "bg-emerald-100 text-emerald-800 border-emerald-300",
  green_sparse: "bg-yellow-100 text-yellow-800 border-yellow-300",
  yellow_thin: "bg-amber-100 text-amber-800 border-amber-300",
  bare_or_dead: "bg-red-100 text-red-800 border-red-300",
};

function SignalBadge({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  const cls = SIGNAL_BADGE_CLASS[value] ?? "bg-muted text-foreground border-border";
  return (
    <Badge variant="outline" className={`text-xs ${cls}`}>
      {label}: {value.replace(/_/g, " ")}
    </Badge>
  );
}

function ReviewBadge({ status }: { status: string }) {
  if (status === "confirmed")
    return <Badge className="bg-emerald-600 text-white"><ShieldCheck className="h-3 w-3 mr-1" />Confirmed</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
  if (status === "needs_verification")
    return <Badge className="bg-amber-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Needs field verification</Badge>;
  return <Badge variant="outline" className="border-blue-400 text-blue-700">Pending review</Badge>;
}

export function AnalysisCard({
  result,
  onClick,
  selected,
}: {
  result: PhotoAnalysisResultRich;
  onClick?: () => void;
  selected?: boolean;
}) {
  const cues = (result.possiblePestOrDiseaseCues ?? []) as Array<{ cue: string; severity: string; notes?: string | null }>;
  const media = result.media;
  return (
    <Card
      className={`cursor-pointer transition hover:border-primary/60 ${selected ? "border-primary ring-2 ring-primary/40" : ""}`}
      onClick={onClick}
      data-testid={`card-analysis-${result.id}`}
    >
      <CardContent className="p-3 space-y-3">
        <div className="flex gap-3">
          {media?.thumbnailUrl ? (
            <img
              src={media.thumbnailUrl}
              alt={media.originalFileName ?? ""}
              className="h-24 w-24 rounded object-cover bg-muted"
            />
          ) : media?.fileUrl ? (
            <img
              src={media.fileUrl}
              alt=""
              className="h-24 w-24 rounded object-cover bg-muted"
            />
          ) : (
            <div className="h-24 w-24 rounded bg-muted flex items-center justify-center">
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ReviewBadge status={result.reviewStatus} />
              <Badge variant="secondary" className="text-[10px]">
                {result.provider}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {result.context.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              {result.treeCode && (
                <span className="font-mono">{result.treeCode}</span>
              )}
              {result.groveName && <span>· {result.groveName}</span>}
              {media?.purpose && <span>· {media.purpose.replace(/_/g, " ")}</span>}
              {media?.photoSide && (
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-wider"
                  data-testid={`analysis-side-${result.id}`}
                  title="Side of tree the photo was taken from"
                >
                  {media.photoSide === "canopy" || media.photoSide === "trunk"
                    ? media.photoSide
                    : `${media.photoSide} face`}
                </Badge>
              )}
              {(media?.gpsLat != null && media?.gpsLon != null) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> GPS
                </span>
              )}
            </div>
            <p className="text-xs text-foreground line-clamp-2">
              {result.summary ?? "No summary"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <SignalBadge label="canopy" value={result.canopyDensity} />
          <SignalBadge label="yellowing" value={result.yellowingSignal} />
          <SignalBadge label="drought" value={result.droughtStressVisualSignal} />
          <SignalBadge label="prune" value={result.pruningNeedSignal} />
          <SignalBadge label="maturity" value={result.fruitMaturityVisualEstimate} />
          <SignalBadge label="fruit dmg" value={result.fruitDamageSignal} />
          {cues.map((c, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[10px] bg-purple-50 text-purple-800 border-purple-300"
            >
              cue: {c.cue.replace(/_/g, " ")} ({c.severity})
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> Image quality: {result.imageQuality ?? "unknown"}
          </span>
          {result.needsFieldVerification === "yes" && (
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              Needs field verification
            </span>
          )}
          {result.createdTaskId && (
            <span className="text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Task #{result.createdTaskId}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
