import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Supercluster from "supercluster";

// These WGS84 bounds describe a rectangle in EPSG:3857 (Web Mercator) — the
// orthomosaic was reprojected from UTM 36N to EPSG:3857 with gdalwarp so it
// fits Leaflet's tile coordinate system without skew. Do not edit by hand;
// they are derived from the warped GeoTIFF corners by `convert-bounds.ts`.
export const IMAGE_BOUNDS = {
  west: 35.365682206333126,
  south: 32.91089258283152,
  east: 35.4084340105814,
  north: 32.9350199077019,
};

const ORTHO_URL = "/api/static/imagery/display.png";

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export type Grove = {
  id: number;
  name: string;
  boundaryGeojson?: any;
  centroidLat?: number | null;
  centroidLon?: number | null;
};

export type Tree = {
  id: number;
  treeCode: string;
  variety?: string | null;
  centroidLat?: number | null;
  centroidLon?: number | null;
  pointGeojson?: any;
  currentHealthIndex?: number | null;
  currentAlertStatus?: string | null;
  ancientStatus?: string | null;
};

function healthColor(t: Tree): string {
  if (t.currentAlertStatus && t.currentAlertStatus !== "none") {
    if (t.currentAlertStatus === "urgent" || t.currentAlertStatus === "high") return "#dc2626";
    return "#f59e0b";
  }
  const raw = t.currentHealthIndex ?? 70;
  const h = raw > 1.5 ? raw / 100 : raw;
  if (h >= 0.75) return "#16a34a";
  if (h >= 0.5) return "#84cc16";
  if (h >= 0.3) return "#eab308";
  return "#dc2626";
}

function treeLatLng(t: Tree): [number, number] | null {
  if (typeof t.centroidLat === "number" && typeof t.centroidLon === "number") {
    return [t.centroidLat, t.centroidLon];
  }
  const c = t.pointGeojson?.coordinates;
  if (Array.isArray(c) && c.length >= 2) return [c[1], c[0]];
  return null;
}

function isPriorityTree(t: Tree): boolean {
  // Alert + ancient pins always render unclustered so a manager can
  // see flagged / heritage trees the second the map loads, even at
  // low zoom over thousands of markers.
  if (t.ancientStatus === "confirmed_ancient" || t.ancientStatus === "ancient") return true;
  const a = t.currentAlertStatus;
  return Boolean(a && a !== "none");
}

interface GroveMapProps {
  /**
   * "overview" — satellite base + grove polygons (no trees, no orthomosaic).
   *              Click a polygon to select.
   * "grove"    — satellite base + orthomosaic overlay + tree markers for the
   *              selected grove. Click a marker to select a tree.
   */
  mode?: "overview" | "grove";
  groves: Grove[];
  trees?: Tree[];
  selectedGroveId?: number | null;
  selectedTreeId?: number | null;
  onSelectGrove?: (groveId: number) => void;
  onSelectTree?: (treeId: number) => void;
  className?: string;
  showLabels?: boolean;
  fitToGroveId?: number | null;
}

interface TreeProps {
  treeId: number;
  color: string;
  isAncient: boolean;
}

export function GroveMap({
  mode = "overview",
  groves,
  trees = [],
  selectedGroveId,
  selectedTreeId,
  onSelectGrove,
  onSelectTree,
  className,
  showLabels = false,
  fitToGroveId,
}: GroveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.LayerGroup | null>(null);
  const orthoRef = useRef<L.ImageOverlay | null>(null);
  const indexRef = useRef<Supercluster<TreeProps> | null>(null);
  const treeByIdRef = useRef<Map<number, Tree>>(new Map());
  const onSelectTreeRef = useRef(onSelectTree);
  onSelectTreeRef.current = onSelectTree;

  const fullBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [IMAGE_BOUNDS.south, IMAGE_BOUNDS.west],
      [IMAGE_BOUNDS.north, IMAGE_BOUNDS.east],
    ],
    [],
  );

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      crs: L.CRS.EPSG3857,
      minZoom: 12,
      maxZoom: 21,
      zoomControl: true,
      attributionControl: true,
    });
    map.fitBounds(fullBounds);
    L.tileLayer(SATELLITE_URL, {
      maxZoom: 21,
      maxNativeZoom: 18,
      attribution: "Tiles © Esri — World Imagery",
    }).addTo(map);
    mapRef.current = map;
    polygonLayerRef.current = L.layerGroup().addTo(map);
    clusterLayerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      polygonLayerRef.current = null;
      clusterLayerRef.current = null;
      orthoRef.current = null;
      indexRef.current = null;
    };
  }, [fullBounds]);

  // Toggle orthomosaic overlay based on mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "grove") {
      if (!orthoRef.current) {
        orthoRef.current = L.imageOverlay(ORTHO_URL, fullBounds, {
          opacity: 0.85,
          interactive: false,
        }).addTo(map);
      }
    } else if (orthoRef.current) {
      map.removeLayer(orthoRef.current);
      orthoRef.current = null;
    }
  }, [mode, fullBounds]);

  // Render grove polygons (always, regardless of mode).
  useEffect(() => {
    const map = mapRef.current;
    const layers = polygonLayerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    for (const g of groves) {
      if (!g.boundaryGeojson) continue;
      const isSelected = selectedGroveId === g.id;
      const dimmed = mode === "grove" && !isSelected;
      const poly = L.geoJSON(g.boundaryGeojson, {
        style: {
          color: isSelected ? "#facc15" : dimmed ? "#94a3b8" : "#fbbf24",
          weight: isSelected ? 3 : dimmed ? 1 : 2,
          opacity: dimmed ? 0.5 : 0.95,
          fillColor: isSelected ? "#facc15" : "#fbbf24",
          fillOpacity: isSelected ? 0.18 : dimmed ? 0.0 : 0.22,
          className: "grove-polygon",
        },
      });
      poly.on("click", () => onSelectGrove?.(g.id));
      poly.on("mouseover", (e) => {
        const target = (e as any).target as L.GeoJSON;
        if (selectedGroveId !== g.id) {
          target.setStyle({ fillOpacity: 0.4, weight: 2.5, color: "#fde68a" });
        }
      });
      poly.on("mouseout", (e) => {
        const target = (e as any).target as L.GeoJSON;
        if (selectedGroveId !== g.id) {
          target.setStyle({
            fillOpacity: dimmed ? 0.0 : 0.22,
            weight: dimmed ? 1 : 2,
            color: dimmed ? "#94a3b8" : "#fbbf24",
          });
        }
      });
      poly.bindTooltip(g.name, {
        permanent: showLabels || mode === "overview",
        direction: "center",
        className: "grove-label",
      });
      poly.addTo(layers);
    }
  }, [groves, selectedGroveId, mode, onSelectGrove, showLabels]);

  // Build the supercluster index whenever the tree list changes.
  // Priority trees (ancient + alert) are kept on a separate non-
  // clustered layer rendered by the same effect that draws clusters.
  useEffect(() => {
    if (mode !== "grove") {
      indexRef.current = null;
      treeByIdRef.current = new Map();
      return;
    }
    const points: Supercluster.PointFeature<TreeProps>[] = [];
    const map = new Map<number, Tree>();
    for (const t of trees) {
      const ll = treeLatLng(t);
      if (!ll) continue;
      map.set(t.id, t);
      // Skip priority trees from the cluster index — they always render
      // as standalone pins below.
      if (isPriorityTree(t)) continue;
      points.push({
        type: "Feature",
        properties: {
          treeId: t.id,
          color: healthColor(t),
          isAncient: false,
        },
        geometry: {
          type: "Point",
          coordinates: [ll[1], ll[0]],
        },
      });
    }
    treeByIdRef.current = map;
    const idx = new Supercluster<TreeProps>({
      radius: 60,
      maxZoom: 19,
      minPoints: 4,
    });
    idx.load(points);
    indexRef.current = idx;
  }, [trees, mode]);

  // Render clusters + priority pins on every move/zoom + when index/tree
  // selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = clusterLayerRef.current;
    if (!map || !layer) return;
    if (mode !== "grove") {
      layer.clearLayers();
      return;
    }

    const render = () => {
      layer.clearLayers();
      const idx = indexRef.current;
      const treeMap = treeByIdRef.current;
      if (!idx) return;
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const zoom = Math.min(Math.round(map.getZoom()), 19);
      const clusters = idx.getClusters(bbox, zoom);
      for (const c of clusters) {
        const [lng, lat] = c.geometry.coordinates as [number, number];
        // supercluster.getClusters returns either a synthesized cluster
        // feature (properties.cluster === true with point_count, etc.)
        // or one of our own PointFeatures with TreeProps. Discriminate
        // on the `cluster` flag so each branch keeps real types.
        const props = c.properties as
          | Supercluster.ClusterProperties
          | TreeProps;
        if ("cluster" in props && props.cluster === true) {
          const cp = props as Supercluster.ClusterProperties;
          // Cluster bubble — size scales with point count, color stays
          // neutral so it doesn't impersonate a health signal.
          const count = cp.point_count;
          const r = count >= 1000 ? 22 : count >= 200 ? 18 : count >= 50 ? 14 : 11;
          const marker = L.circleMarker([lat, lng], {
            radius: r,
            color: "#1e293b",
            weight: 1.5,
            fillColor: "#fef3c7",
            fillOpacity: 0.92,
            className: "tree-cluster",
            bubblingMouseEvents: false,
          });
          const formatted = cp.point_count_abbreviated;
          marker.bindTooltip(`${formatted} شجرة — اضغط للتكبير`, { direction: "top" });
          marker.on("click", () => {
            const expansionZoom = Math.min(
              indexRef.current!.getClusterExpansionZoom(cp.cluster_id),
              19,
            );
            map.flyTo([lat, lng], expansionZoom, { duration: 0.4 });
          });
          marker.addTo(layer);
          // Render the count as a small text label using a divIcon so
          // we don't pull in another library for label positioning.
          const labelIcon = L.divIcon({
            html: `<span class="text-[11px] font-semibold text-slate-900">${formatted}</span>`,
            className: "tree-cluster-label pointer-events-none",
            iconSize: [r * 2, r * 2],
            iconAnchor: [r, r],
          });
          L.marker([lat, lng], { icon: labelIcon, interactive: false }).addTo(layer);
        } else {
          const tp = props as TreeProps;
          const t = treeMap.get(tp.treeId);
          if (!t) continue;
          renderTreeMarker(layer, t, [lat, lng], selectedTreeId === t.id);
        }
      }
      // Priority pins (ancient + alert) — always on top, never clustered.
      for (const t of treeMap.values()) {
        if (!isPriorityTree(t)) continue;
        const ll = treeLatLng(t);
        if (!ll) continue;
        renderTreeMarker(layer, t, ll, selectedTreeId === t.id);
      }
    };

    function renderTreeMarker(
      target: L.LayerGroup,
      t: Tree,
      ll: [number, number],
      isSelected: boolean,
    ) {
      const isAncient = t.ancientStatus === "confirmed_ancient" || t.ancientStatus === "ancient";
      const baseRadius = isAncient ? 5 : 3.5;
      const marker = L.circleMarker(ll, {
        radius: isSelected ? 9 : baseRadius,
        color: isSelected ? "#ffffff" : healthColor(t),
        weight: isSelected ? 3 : 1,
        fillColor: healthColor(t),
        fillOpacity: 0.9,
        className: "tree-marker",
        bubblingMouseEvents: false,
      });
      marker.on("click", () => onSelectTreeRef.current?.(t.id));
      marker.bindTooltip(`${t.treeCode}${t.variety ? ` · ${t.variety}` : ""}`, {
        direction: "top",
        offset: [0, -4],
      });
      marker.addTo(target);
    }

    render();
    map.on("moveend", render);
    map.on("zoomend", render);
    return () => {
      map.off("moveend", render);
      map.off("zoomend", render);
    };
  }, [mode, trees, selectedTreeId]);

  // Fit to grove when one is selected; otherwise fit to full extent
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fitToGroveId) {
      map.fitBounds(fullBounds, { padding: [20, 20] });
      return;
    }
    const g = groves.find((x) => x.id === fitToGroveId);
    if (!g) return;
    if (g.boundaryGeojson) {
      const layer = L.geoJSON(g.boundaryGeojson);
      const b = layer.getBounds();
      // Cap the autofit zoom so small groves don't end up past the imagery's
      // native pixel density (Esri ~z18, orthomosaic ~z19 at this latitude).
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 19 });
    } else if (g.centroidLat && g.centroidLon) {
      map.setView([g.centroidLat, g.centroidLon], 17);
    }
  }, [fitToGroveId, groves, fullBounds]);

  return <div ref={containerRef} className={className} />;
}
