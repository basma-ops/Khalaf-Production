import { useState, useMemo } from "react";
import {
  useListPhotos,
  useListAnalysisResults,
  useRunPhotoAnalysis,
  useReviewAnalysisResult,
  useCreateTaskFromAnalysis,
  useListTrees,
  getListAnalysisResultsQueryKey,
  getListPhotosQueryKey,
  getListTreesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Brain, Check, X, Plus, Map as MapIcon, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PhotoMap, type MapPhoto, type MapTree } from "@/components/photo-map";

type ViewMode = "grid" | "map";

export default function Photos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedPhoto, setSelectedPhoto] = useState<MapPhoto | null>(null);

  const { data: photos, isLoading: loadingPhotos } = useListPhotos({ limit: 200 });
  const { data: pendingAnalysis, isLoading: loadingAnalysis } = useListAnalysisResults({ reviewStatus: "pending" });
  const treesParams = { limit: 5000 } as const;
  const { data: treesResp, isLoading: loadingTrees } = useListTrees(
    treesParams,
    { query: { enabled: view === "map", queryKey: getListTreesQueryKey(treesParams) } },
  );

  const runAnalysis = useRunPhotoAnalysis();
  const reviewAnalysis = useReviewAnalysisResult();
  const createTask = useCreateTaskFromAnalysis();

  const handleRunAnalysis = async (photoId: number) => {
    try {
      await runAnalysis.mutateAsync({ data: { mediaId: photoId } });
      toast({ title: "Analysis started" });
      queryClient.invalidateQueries({ queryKey: getListAnalysisResultsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Analysis failed" });
    }
  };

  const handleReview = async (id: number, approved: boolean) => {
    try {
      await reviewAnalysis.mutateAsync({ id, data: { reviewStatus: approved ? "confirmed" : "rejected" } });
      toast({ title: approved ? "Approved" : "Rejected" });
      queryClient.invalidateQueries({ queryKey: getListAnalysisResultsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Review failed" });
    }
  };

  const handleCreateTask = async (analysisId: number) => {
    try {
      await createTask.mutateAsync({
        id: analysisId,
        data: { taskType: "tree_inspection", priority: "medium", title: "Follow up on AI finding" },
      });
      toast({ title: "Task created from finding" });
    } catch {
      toast({ variant: "destructive", title: "Failed to create task" });
    }
  };

  const mapPhotos: MapPhoto[] = useMemo(
    () =>
      (photos ?? [])
        .filter((p): p is typeof p & { gpsLat: number; gpsLon: number } =>
          typeof p.gpsLat === "number" && typeof p.gpsLon === "number",
        )
        .map((p) => ({
          id: p.id,
          fileUrl: p.fileUrl,
          thumbnailUrl: p.thumbnailUrl ?? null,
          gpsLat: p.gpsLat,
          gpsLon: p.gpsLon,
          treeCode: p.treeCode ?? null,
          groveName: p.groveName ?? null,
          caption: p.caption ?? null,
          capturedAt: p.capturedAt ?? null,
          uploadedAt: p.uploadedAt,
        })),
    [photos],
  );

  const mapTrees: MapTree[] = useMemo(
    () =>
      (treesResp?.trees ?? []).map((t) => ({
        id: t.id,
        treeCode: t.treeCode,
        centroidLat: t.centroidLat ?? null,
        centroidLon: t.centroidLon ?? null,
        currentHealthIndex: t.currentHealthIndex ?? null,
        currentAlertStatus: t.currentAlertStatus ?? null,
        ancientStatus: t.ancientStatus ?? null,
      })),
    [treesResp],
  );

  const photosWithGpsCount = mapPhotos.length;

  if (loadingPhotos || loadingAnalysis) {
    return (
      <div className="p-4 grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md bg-primary/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md border border-border bg-card p-1 shadow-sm">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors",
              view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
          <button
            onClick={() => setView("map")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors",
              view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MapIcon className="h-3.5 w-3.5" /> Map
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {view === "map"
            ? `${photosWithGpsCount} on map · ${(photos?.length ?? 0) - photosWithGpsCount} no GPS`
            : `${photos?.length ?? 0} photos`}
        </span>
      </div>

      {pendingAnalysis && pendingAnalysis.length > 0 && view === "grid" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-primary flex items-center gap-2">
            <Brain className="h-4 w-4" /> Pending Analysis
          </h2>
          <div className="space-y-3">
            {pendingAnalysis.map((result) => (
              <div key={result.id} className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex gap-3">
                  <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
                    {result.media && (
                      <img
                        src={result.media.thumbnailUrl || result.media.fileUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {result.treeCode ? `Tree ${result.treeCode}` : "AI Finding"}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {result.summary || result.recommendedFollowUp || "Awaiting review."}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleCreateTask(result.id)}
                    disabled={createTask.isPending}
                    className="flex-1 flex justify-center items-center gap-1 rounded bg-secondary p-2 text-xs font-medium text-secondary-foreground"
                  >
                    <Plus className="h-3 w-3" /> Task
                  </button>
                  <button
                    onClick={() => handleReview(result.id, false)}
                    disabled={reviewAnalysis.isPending}
                    className="flex justify-center items-center rounded border border-border p-2 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleReview(result.id, true)}
                    disabled={reviewAnalysis.isPending}
                    className="flex justify-center items-center rounded bg-primary p-2 text-primary-foreground"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "map" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Photo Map
            </h2>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Tree
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-600" /> Alert
              </span>
            </div>
          </div>

          {photosWithGpsCount === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-lg border border-dashed">
              <MapIcon className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No GPS-tagged photos yet.</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Photos uploaded with location data will appear here on the satellite map.
              </p>
            </div>
          ) : (
            <div className="relative">
              {loadingTrees && (
                <div className="absolute top-2 right-2 z-10 rounded bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow">
                  Loading trees…
                </div>
              )}
              <PhotoMap
                trees={mapTrees}
                photos={mapPhotos}
                onSelectPhoto={setSelectedPhoto}
                className="h-[60vh] w-full rounded-lg border border-border overflow-hidden bg-muted"
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center">
            Tap a photo pin to view it. Tree dots are colored by health and alert status.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent Photos
          </h2>

          {!photos?.length ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-lg border border-dashed">
              <Camera className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No photos yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-md overflow-hidden bg-muted group"
                >
                  <img
                    src={photo.thumbnailUrl || photo.fileUrl}
                    alt={photo.caption || "Field photo"}
                    className="w-full h-full object-cover"
                  />
                  {typeof photo.gpsLat === "number" && (
                    <div className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white flex items-center gap-0.5">
                      <MapIcon className="h-2.5 w-2.5" /> GPS
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 flex flex-col justify-end">
                    <p className="text-[10px] text-white font-medium line-clamp-1 mb-1">
                      {photo.treeCode ? `Tree ${photo.treeCode}` : photo.caption || "Untagged"}
                    </p>
                    <button
                      onClick={() => handleRunAnalysis(photo.id)}
                      disabled={runAnalysis.isPending}
                      className="w-full rounded bg-white/20 hover:bg-white/30 backdrop-blur-sm p-1.5 text-[10px] font-medium text-white flex items-center justify-center gap-1 transition-colors"
                    >
                      <Brain className="h-3 w-3" /> Analyze
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-md w-full rounded-lg bg-card overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-2 right-2 z-10 rounded-full bg-black/60 text-white p-1.5 hover:bg-black/80"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={
                selectedPhoto.fileUrl.startsWith("/objects/")
                  ? `/api/storage${selectedPhoto.fileUrl}`
                  : selectedPhoto.fileUrl
              }
              alt={selectedPhoto.caption ?? "Photo"}
              className="w-full max-h-[60vh] object-contain bg-black"
            />
            <div className="p-3 space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                {selectedPhoto.treeCode ? `Tree ${selectedPhoto.treeCode}` : "Unlinked photo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedPhoto.groveName ?? ""}
                {selectedPhoto.groveName && selectedPhoto.capturedAt ? " · " : ""}
                {selectedPhoto.capturedAt
                  ? new Date(selectedPhoto.capturedAt).toLocaleString()
                  : new Date(selectedPhoto.uploadedAt).toLocaleString()}
              </p>
              {selectedPhoto.caption && (
                <p className="text-xs text-foreground/80 pt-1">{selectedPhoto.caption}</p>
              )}
              <p className="text-[10px] text-muted-foreground pt-1">
                GPS: {selectedPhoto.gpsLat?.toFixed(6)}, {selectedPhoto.gpsLon?.toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
