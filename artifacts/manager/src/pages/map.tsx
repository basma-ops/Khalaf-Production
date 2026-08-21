import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListGroves, useListTrees } from "@workspace/api-client-react";
import { GroveMap, type Grove, type Tree } from "@/components/grove-map";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trees as TreesIcon,
  MapPin,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

export default function MapPage() {
  const [location] = useLocation();
  const initialGroveId = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("groveId");
    return v ? Number(v) : null;
  }, []);
  const [selectedGroveId, setSelectedGroveId] = useState<number | null>(initialGroveId);
  const [selectedTreeId, setSelectedTreeId] = useState<number | null>(null);

  const { data: groves, isLoading: lg } = useListGroves();
  // Raised from 2000 to 5000 in Task #27 — paired with supercluster
  // rendering in GroveMap, the map can now ingest the full estate
  // without dropping markers.
  const { data: treeRes, isLoading: lt } = useListTrees({ limit: 5000 });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (selectedGroveId == null) q.delete("groveId");
    else q.set("groveId", String(selectedGroveId));
    const qs = q.toString();
    const next = `/map${qs ? `?${qs}` : ""}`;
    if (next !== `${location}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [selectedGroveId, location]);

  const trees = (treeRes?.trees ?? []) as Tree[];
  const groveTrees = useMemo(
    () => (selectedGroveId ? trees.filter((t: any) => t.groveId === selectedGroveId) : []),
    [trees, selectedGroveId],
  );

  const selectedTree = trees.find((t) => t.id === selectedTreeId);
  const selectedGrove = groves?.find((g) => g.id === selectedGroveId);
  const isGroveView = !!selectedGroveId;

  if (lg || lt) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-3xl font-serif font-bold">Grove Map</h1>
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isGroveView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedGroveId(null);
                setSelectedTreeId(null);
              }}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              All Groves
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">
              {isGroveView ? selectedGrove?.name ?? "Grove" : "Grove Map"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isGroveView
                ? `${groveTrees.length.toLocaleString()} trees · click a tree to view & tag`
                : `${groves?.length ?? 0} groves · click a polygon to view trees`}
            </p>
          </div>
        </div>
        {isGroveView && (
          <div className="flex gap-2 text-xs">
            <LegendDot color="#16a34a" label="Healthy" />
            <LegendDot color="#84cc16" label="Good" />
            <LegendDot color="#eab308" label="Stressed" />
            <LegendDot color="#f59e0b" label="Alert" />
            <LegendDot color="#dc2626" label="Critical" />
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r bg-card flex flex-col">
          <div className="p-3 border-b">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Groves
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {groves?.map((g) => {
                const count = trees.filter((t: any) => t.groveId === g.id).length;
                const isActive = selectedGroveId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      setSelectedGroveId(g.id);
                      setSelectedTreeId(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex justify-between items-center ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span className="truncate flex items-center gap-2">
                      <TreesIcon className="h-3.5 w-3.5 shrink-0" />
                      {g.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs opacity-70">
                      {count}
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          {!isGroveView && (
            <div className="p-3 border-t text-xs text-muted-foreground leading-relaxed">
              Pick a grove from the list, or click a yellow polygon on the map to drill in and tag
              individual trees.
            </div>
          )}
        </aside>

        <div className="flex-1 relative">
          <GroveMap
            mode={isGroveView ? "grove" : "overview"}
            groves={(groves ?? []) as Grove[]}
            trees={groveTrees}
            selectedGroveId={selectedGroveId}
            selectedTreeId={selectedTreeId}
            onSelectGrove={(id) => {
              setSelectedGroveId(id);
              setSelectedTreeId(null);
            }}
            onSelectTree={setSelectedTreeId}
            fitToGroveId={selectedGroveId}
            showLabels={!isGroveView}
            className="absolute inset-0"
          />
        </div>

        {isGroveView && (selectedTree || selectedGrove) && (
          <aside className="w-80 border-l bg-card overflow-auto">
            {selectedTree ? (
              <Card className="m-3 border-0 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Tree
                      </p>
                      <h3 className="text-lg font-bold">{selectedTree.treeCode}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedTreeId(null)}
                      className="text-muted-foreground hover:text-foreground text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <KV k="Variety" v={selectedTree.variety ?? "—"} />
                    <KV
                      k="Health"
                      v={`${Math.round((selectedTree.currentHealthIndex ?? 0))}%`}
                    />
                    <KV k="Status" v={selectedTree.currentAlertStatus ?? "none"} />
                    <KV k="Ancient" v={selectedTree.ancientStatus ?? "unknown"} />
                  </div>
                  {selectedTree.currentAlertStatus &&
                    selectedTree.currentAlertStatus !== "none" && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Open alert
                      </Badge>
                    )}
                  <Link
                    href={`/trees/${selectedTree.id}`}
                    className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    Open tree details <ExternalLink className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            ) : selectedGrove ? (
              <Card className="m-3 border-0 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Grove
                    </p>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <TreesIcon className="h-5 w-5 text-primary" /> {selectedGrove.name}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {selectedGrove.centroidLat?.toFixed(4)}, {selectedGrove.centroidLon?.toFixed(4)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <KV k="Trees" v={groveTrees.length.toString()} />
                    <KV
                      k="Avg Health"
                      v={
                        groveTrees.length
                          ? `${Math.round(
                              groveTrees.reduce(
                                (s, t) => s + (t.currentHealthIndex ?? 0),
                                0,
                              ) / groveTrees.length,
                            )}%`
                          : "—"
                      }
                    />
                    <KV
                      k="Alerts"
                      v={groveTrees
                        .filter(
                          (t) => t.currentAlertStatus && t.currentAlertStatus !== "none",
                        )
                        .length.toString()}
                    />
                    <KV
                      k="Ancient"
                      v={groveTrees
                        .filter(
                          (t) =>
                            t.ancientStatus === "confirmed_ancient" ||
                            t.ancientStatus === "ancient",
                        )
                        .length.toString()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    Click any tree dot on the map to view & tag it.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="font-semibold capitalize">{v}</p>
    </div>
  );
}
