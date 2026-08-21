import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPhotos,
  getListPhotosQueryKey,
  getListTreesQueryKey,
  useBulkLinkPhotos,
  useListTrees,
  useListGroves,
  type PhotoLibraryItem,
  type PhotoLibraryItemMatchStatus,
  type ListPhotosMatchStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, MapPin, AlertTriangle, Link2 } from "lucide-react";
import { ManagerFlagButton } from "@/components/manager-flag-dialog";
import { useToast } from "@/hooks/use-toast";

const PURPOSES = [
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

// Display labels for the auto-link diagnostic chips. Keep ordering meaningful
// for triage (linked first, then "fixable" unlinks, then errors).
const MATCH_FILTERS: Array<{
  value: "all" | "all_unlinked" | PhotoLibraryItemMatchStatus;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}> = [
  { value: "all", label: "All photos" },
  { value: "linked_gps", label: "Linked by GPS" },
  { value: "linked_explicit", label: "Linked explicitly" },
  { value: "all_unlinked", label: "All unlinked" },
  { value: "unlinked_no_gps", label: "Unlinked — no GPS" },
  { value: "unlinked_no_match", label: "Unlinked — out of range" },
  { value: "unlinked_exif_error", label: "Unlinked — EXIF error" },
];

function matchBadge(status: PhotoLibraryItemMatchStatus | null | undefined) {
  switch (status) {
    case "linked_gps":
      return <Badge variant="secondary" className="text-[10px]">GPS-matched</Badge>;
    case "linked_explicit":
      return <Badge variant="secondary" className="text-[10px]">Linked</Badge>;
    case "unlinked_no_gps":
      return <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">No GPS</Badge>;
    case "unlinked_no_match":
      return <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Out of range</Badge>;
    case "unlinked_exif_error":
      return <Badge variant="destructive" className="text-[10px]">EXIF error</Badge>;
    default:
      return null;
  }
}

export default function PhotosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState<string>("all");
  const [matchFilter, setMatchFilter] = useState<(typeof MATCH_FILTERS)[number]["value"]>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkGroveId, setLinkGroveId] = useState<string>("none");
  const [linkTreeId, setLinkTreeId] = useState<string>("none");

  const params = useMemo(
    () => ({
      purpose: purpose === "all" ? undefined : purpose,
      matchStatus:
        matchFilter === "all" || matchFilter === "all_unlinked"
          ? undefined
          : (matchFilter as ListPhotosMatchStatus),
      unlinked: matchFilter === "all_unlinked" ? true : undefined,
      limit: 200,
    }),
    [purpose, matchFilter],
  );
  const { data, isLoading } = useListPhotos(params, {
    query: { queryKey: getListPhotosQueryKey(params), refetchInterval: 15_000 },
  });

  const { data: groves } = useListGroves();
  const treesParams =
    linkGroveId !== "none"
      ? { groveId: Number(linkGroveId), limit: 5000 }
      : { limit: 5000 };
  const { data: trees } = useListTrees(treesParams, {
    query: { enabled: linkDialogOpen, queryKey: getListTreesQueryKey(treesParams) },
  });

  const bulkLink = useBulkLinkPhotos();

  const showSelection =
    matchFilter === "all_unlinked" ||
    matchFilter === "unlinked_no_gps" ||
    matchFilter === "unlinked_no_match" ||
    matchFilter === "unlinked_exif_error";

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openLinkDialog() {
    setLinkGroveId("none");
    setLinkTreeId("none");
    setLinkDialogOpen(true);
  }

  async function submitBulkLink() {
    const treeIdNum = linkTreeId === "none" ? undefined : Number(linkTreeId);
    const groveIdNum = linkGroveId === "none" ? undefined : Number(linkGroveId);
    if (treeIdNum == null && groveIdNum == null) {
      toast({
        title: "Pick a tree or grove",
        description: "Choose a destination before linking.",
        variant: "destructive",
      });
      return;
    }
    const ids = Array.from(selectedIds);
    try {
      const res = await bulkLink.mutateAsync({
        data: {
          mediaIds: ids,
          treeId: treeIdNum ?? null,
          groveId: groveIdNum ?? null,
        },
      });
      toast({
        title: `Linked ${res.updated} of ${res.requested} photo(s)`,
        description:
          res.failedIds.length > 0
            ? `${res.failedIds.length} could not be updated.`
            : undefined,
      });
      setSelectedIds(new Set());
      setLinkDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["listPhotos"] });
    } catch (err) {
      toast({
        title: "Bulk link failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="p-8 space-y-6 pb-32">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            Photo Library
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Every photo captured by field workers — searchable by purpose, tree, or grove. Each
            photo is auto-analyzed; results are <span className="font-semibold text-amber-700">cautious signals</span> only.
          </p>
        </div>
        <Select value={purpose} onValueChange={setPurpose}>
          <SelectTrigger className="w-[220px]" data-testid="select-purpose">
            <SelectValue placeholder="Purpose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purposes</SelectItem>
            {PURPOSES.map((p) => (
              <SelectItem key={p} value={p}>
                {p.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-sans font-medium text-muted-foreground">
            Match status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {MATCH_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-testid={`chip-match-${f.value}`}
              onClick={() => {
                setMatchFilter(f.value);
                setSelectedIds(new Set());
              }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                matchFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading && [...Array(8)].map((_, i) => <Skeleton key={i} className="h-56" />)}
        {(data ?? []).map((m: PhotoLibraryItem) => {
          const selected = selectedIds.has(m.id);
          return (
            <Card
              key={m.id}
              data-testid={`card-photo-${m.id}`}
              className={selected ? "ring-2 ring-primary" : ""}
            >
              <CardHeader className="p-0 relative">
                {showSelection && (
                  <label
                    className="absolute top-2 left-2 z-10 bg-background/95 border rounded p-1.5 cursor-pointer flex items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleSelected(m.id)}
                      data-testid={`checkbox-photo-${m.id}`}
                    />
                  </label>
                )}
                <a href={m.fileUrl} target="_blank" rel="noreferrer">
                  <img
                    src={m.thumbnailUrl ?? m.fileUrl}
                    alt={m.originalFileName ?? ""}
                    className="w-full h-44 object-cover rounded-t bg-muted"
                  />
                </a>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge variant="outline">{m.purpose.replace(/_/g, " ")}</Badge>
                  <div className="flex items-center gap-1 flex-wrap">
                    {m.gpsLat != null && m.gpsLon != null && (
                      <Badge variant="outline" className="text-[10px]">
                        <MapPin className="h-3 w-3 mr-1" /> GPS
                      </Badge>
                    )}
                    {matchBadge(m.matchStatus ?? null)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {m.treeCode ? (
                    <div className="font-mono flex items-center gap-1.5 flex-wrap">
                      <span>{m.treeCode}</span>
                      {m.photoSide && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded border border-border text-[10px] font-sans uppercase tracking-wider text-foreground/80"
                          data-testid={`photo-side-${m.id}`}
                          title="Side of tree the photo was taken from"
                        >
                          {m.photoSide === "canopy" || m.photoSide === "trunk"
                            ? m.photoSide
                            : `${m.photoSide} face`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> No tree
                    </div>
                  )}
                  {m.groveName && <div>{m.groveName}</div>}
                  <div>{new Date(m.uploadedAt).toLocaleString()}</div>
                  {m.uploadedByName && <div>by {m.uploadedByName}</div>}
                </div>
                {m.latestAnalysis?.summary && (
                  <p className="text-xs text-foreground line-clamp-3 border-t pt-2">
                    {m.latestAnalysis.summary}
                  </p>
                )}
                <div className="pt-1">
                  <ManagerFlagButton entityType="photo" entityId={m.id} label="Flag" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && (data ?? []).length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center text-muted-foreground">
              {matchFilter === "all"
                ? "No photos yet. Field workers capture photos via the Field App."
                : "No photos match this filter."}
            </CardContent>
          </Card>
        )}
      </div>

      {showSelection && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur p-4 flex items-center justify-between gap-4 shadow-lg">
          <div className="text-sm">
            <span className="font-semibold">{selectedIds.size}</span> photo(s) selected
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              data-testid="button-clear-selection"
            >
              Clear
            </Button>
            <Button onClick={openLinkDialog} data-testid="button-link-selected">
              <Link2 className="h-4 w-4 mr-2" /> Link selected…
            </Button>
          </div>
        </div>
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link {selectedIds.size} photo(s) to…</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Grove (optional)</label>
              <Select
                value={linkGroveId}
                onValueChange={(v) => {
                  setLinkGroveId(v);
                  // Reset tree when grove changes so a stale tree from another
                  // grove isn't submitted.
                  setLinkTreeId("none");
                }}
              >
                <SelectTrigger data-testid="select-link-grove">
                  <SelectValue placeholder="Choose grove" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No grove —</SelectItem>
                  {(groves ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tree</label>
              <Select value={linkTreeId} onValueChange={setLinkTreeId}>
                <SelectTrigger data-testid="select-link-tree">
                  <SelectValue placeholder="Choose tree (optional)" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">— No tree —</SelectItem>
                  {((trees as { id: number; treeCode: string }[] | undefined) ?? []).map(
                    (t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.treeCode}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Provide a tree, grove, or both. A tree automatically inherits its grove.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLinkDialogOpen(false)}
              data-testid="button-cancel-link"
            >
              Cancel
            </Button>
            <Button
              onClick={submitBulkLink}
              disabled={bulkLink.isPending}
              data-testid="button-confirm-link"
            >
              {bulkLink.isPending ? "Linking…" : "Link photos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
