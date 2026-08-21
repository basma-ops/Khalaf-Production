import { useState } from "react";
import { Link } from "wouter";
import { useListTrees } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Leaf, ChevronRight, AlertTriangle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

export default function Trees() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // We can pass the search string as treeCode or generic search if the API supports it
  // But for now let's just fetch some and filter locally or pass to API if supported.
  const { data, isLoading } = useListTrees();
  const trees = data?.trees ?? [];

  const filteredTrees = trees.filter((t) =>
    t.treeCode.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (t.groveName ?? "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex flex-col gap-3 pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Tree Registry</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tree code..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg bg-primary/5" />
          ))}
        </div>
      ) : !filteredTrees?.length ? (
        <div className="flex h-[40vh] flex-col items-center justify-center text-center">
          <Leaf className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-foreground">No trees found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrees.map((tree) => (
            <Link
              key={tree.id}
              href={`/trees/${tree.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-card/80 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Tree {tree.treeCode}
                  </span>
                  {tree.currentAlertStatus !== "none" && tree.currentAlertStatus !== "unknown" && (
                    <AlertTriangle className={cn(
                      "h-3 w-3",
                      tree.currentAlertStatus === "urgent" ? "text-destructive" : "text-yellow-500"
                    )} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{tree.groveName}</span>
                  <span>•</span>
                  <span>{tree.variety}</span>
                  {tree.ancientStatus === "verified" && (
                    <>
                      <span>•</span>
                      <span className="text-primary font-medium">Ancient</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
