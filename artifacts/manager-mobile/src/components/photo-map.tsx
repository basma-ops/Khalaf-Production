import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapTree = {
  id: number;
  treeCode: string;
  centroidLat?: number | null;
  centroidLon?: number | null;
  currentHealthIndex?: number | null;
  currentAlertStatus?: string | null;
  ancientStatus?: string | null;
};

export type MapPhoto = {
  id: number;
  fileUrl: string;
  thumbnailUrl?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  treeCode?: string | null;
  groveName?: string | null;
  caption?: string | null;
  capturedAt?: string | null;
  uploadedAt: string;
};

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function healthColor(t: MapTree): string {
  if (t.currentAlertStatus && t.currentAlertStatus !== "none" && t.currentAlertStatus !== "unknown") {
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

function toPublicUrl(p: string | null | undefined): string {
  if (!p) return "";
  if (p.startsWith("/objects/")) return `/api/storage${p}`;
  return p;
}

interface PhotoMapProps {
  trees: MapTree[];
  photos: MapPhoto[];
  onSelectPhoto?: (photo: MapPhoto) => void;
  className?: string;
}

export function PhotoMap({ trees, photos, onSelectPhoto, className }: PhotoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const photoLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      minZoom: 12,
      maxZoom: 21,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(SATELLITE_URL, {
      maxZoom: 21,
      maxNativeZoom: 18,
      attribution: "Esri — World Imagery",
    }).addTo(map);
    treeLayerRef.current = L.layerGroup().addTo(map);
    photoLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      treeLayerRef.current = null;
      photoLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = treeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const t of trees) {
      if (typeof t.centroidLat !== "number" || typeof t.centroidLon !== "number") continue;
      const isAncient = t.ancientStatus === "verified" || t.ancientStatus === "confirmed_ancient";
      const marker = L.circleMarker([t.centroidLat, t.centroidLon], {
        radius: isAncient ? 4 : 3,
        color: healthColor(t),
        weight: 1,
        fillColor: healthColor(t),
        fillOpacity: 0.85,
        bubblingMouseEvents: false,
      });
      marker.bindTooltip(t.treeCode, { direction: "top", offset: [0, -4] });
      marker.addTo(layer);
    }
  }, [trees]);

  useEffect(() => {
    const layer = photoLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of photos) {
      if (typeof p.gpsLat !== "number" || typeof p.gpsLon !== "number") continue;
      const thumb = toPublicUrl(p.thumbnailUrl ?? p.fileUrl);
      const icon = L.divIcon({
        className: "photo-map-pin",
        html:
          `<div class="photo-map-pin__inner">` +
          (thumb
            ? `<img src="${thumb}" alt="" loading="lazy" />`
            : `<div class="photo-map-pin__fallback">📷</div>`) +
          `</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const marker = L.marker([p.gpsLat, p.gpsLon], { icon, riseOnHover: true });
      const tooltipText =
        (p.treeCode ? `Tree ${p.treeCode}` : p.groveName ?? "Unlinked photo") +
        (p.caption ? ` · ${p.caption}` : "");
      marker.bindTooltip(tooltipText, { direction: "top", offset: [0, -16] });
      marker.on("click", () => onSelectPhoto?.(p));
      marker.addTo(layer);
    }
  }, [photos, onSelectPhoto]);

  const fitKey = useMemo(() => `${trees.length}:${photos.length}`, [trees.length, photos.length]);
  const didFitRef = useRef<string>("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (didFitRef.current === fitKey) return;
    const points: L.LatLngExpression[] = [];
    for (const p of photos) {
      if (typeof p.gpsLat === "number" && typeof p.gpsLon === "number") {
        points.push([p.gpsLat, p.gpsLon]);
      }
    }
    if (points.length === 0) {
      for (const t of trees) {
        if (typeof t.centroidLat === "number" && typeof t.centroidLon === "number") {
          points.push([t.centroidLat, t.centroidLon]);
        }
      }
    }
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
      didFitRef.current = fitKey;
    }
  }, [fitKey, trees, photos]);

  return <div ref={containerRef} className={className} />;
}
