"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord, communityVulnerability, haversineKm, riskScoreForArea } from "@/lib/geospatial/sentrixIntel";
import { backendApi } from "@/lib/api/client";
import "leaflet/dist/leaflet.css";

export interface MapLayerVisibility {
  incidents: boolean;
  cameras: boolean;
  communities: boolean;
  resources: boolean;
  roads: boolean;
  riskZones: boolean;
  vulnerability: boolean;
  heatmap: boolean;
  infrastructure: boolean;
}

export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  label?: string;
}

export interface LeafletMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  fullscreen: () => void;
  locate: () => void;
  copyCenter: () => void;
  clearMeasurement: () => void;
}

interface SentrixLeafletMapProps {
  sectors: Sector[];
  cameras: Camera[];
  alerts: Alert[];
  communities: CommunityRecord[];
  resources: ResourceRecord[];
  infrastructure: InfrastructureRecord[];
  roads: RoadRecord[];
  layers: MapLayerVisibility;
  selectedAlertId: string | null;
  onSelectAlert: (alertId: string) => void;
  searchFocus?: MapFocus | null;
  filteredAlerts?: Alert[] | null;
  measureMode?: "distance" | "area" | null;
  onMapClick?: (point: { lat: number; lng: number }) => void;
  onCursorChange?: (point: { lat: number; lng: number } | null) => void;
  onLocateError?: (message: string) => void;
  onMeasureResult?: (text: string) => void;
}

const fallbackCenter: L.LatLngExpression = [20.5937, 78.9629];
const alertColor = (level: Alert["level"]) => level === "critical" ? "#DC2626" : level === "high" ? "#EA580C" : "#D97706";
const roadColor = (status: RoadRecord["status"]) => status === "affected" ? "#DC2626" : status === "high_risk" ? "#D97706" : "#0284C7";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));

function clusterAlerts(alerts: Alert[], zoom: number): Array<{ key: string; lat: number; lng: number; items: Alert[] }> {
  const grid = zoom >= 14 ? 0.004 : zoom >= 11 ? 0.012 : zoom >= 8 ? 0.04 : 0.12;
  const groups = new Map<string, { lat: number; lng: number; items: Alert[] }>();
  alerts.forEach((alert) => {
    const key = `${Math.round(alert.coordinates.lat / grid)}:${Math.round(alert.coordinates.lng / grid)}`;
    const entry = groups.get(key);
    if (entry) {
      entry.items.push(alert);
      entry.lat = (entry.lat + alert.coordinates.lat) / 2;
      entry.lng = (entry.lng + alert.coordinates.lng) / 2;
    } else {
      groups.set(key, { lat: alert.coordinates.lat, lng: alert.coordinates.lng, items: [alert] });
    }
  });
  return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
}

const SentrixLeafletMap = forwardRef<LeafletMapHandle, SentrixLeafletMapProps>(function SentrixLeafletMap({
  sectors,
  cameras,
  alerts,
  communities,
  resources,
  infrastructure,
  roads,
  layers,
  selectedAlertId,
  onSelectAlert,
  searchFocus,
  filteredAlerts,
  measureMode,
  onMapClick,
  onCursorChange,
  onLocateError,
  onMeasureResult,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const measureRef = useRef<L.LayerGroup | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const hasInitialFitRef = useRef(false);
  const onSelectAlertRef = useRef(onSelectAlert);
  const onMapClickRef = useRef(onMapClick);
  const [visibleCommunities, setVisibleCommunities] = useState(communities);
  const [visibleResources, setVisibleResources] = useState(resources);
  const [visibleInfrastructure, setVisibleInfrastructure] = useState(infrastructure);
  const [visibleRoads, setVisibleRoads] = useState(roads);
  const [measurePoints, setMeasurePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const measureModeRef = useRef(measureMode || null);
  const measurePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);

  measureModeRef.current = measureMode || null;
  onSelectAlertRef.current = onSelectAlert;
  onMapClickRef.current = onMapClick;

  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors";
  const effectiveAlerts = filteredAlerts || alerts;

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    reset: () => {
      const map = mapRef.current;
      if (!map) return;
      hasInitialFitRef.current = false;
      const params = new URLSearchParams(window.location.search);
      params.delete("lat");
      params.delete("lng");
      params.delete("zoom");
      window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
      map.setView(fallbackCenter, 5);
    },
    fullscreen: () => {
      const element = containerRef.current;
      if (!element) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void element.requestFullscreen().catch(() => undefined);
    },
    locate: () => {
      if (!navigator.geolocation) {
        onLocateError?.("Browser location is not available on this device.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 15),
        () => onLocateError?.("Location permission denied. Enable location access or search coordinates directly."),
        { timeout: 8000 }
      );
    },
    copyCenter: () => {
      const center = mapRef.current?.getCenter();
      if (!center) return;
      const text = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      onMeasureResult?.(`Center copied: ${text}`);
    },
    clearMeasurement: () => {
      measurePointsRef.current = [];
      setMeasurePoints([]);
      measureRef.current?.clearLayers();
    },
  }), [onLocateError, onMeasureResult]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    const zoom = Number(params.get("zoom"));
    const map = L.map(containerRef.current, { scrollWheelZoom: true, zoomControl: true });
    L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    measureRef.current = L.layerGroup().addTo(map);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], Number.isFinite(zoom) && zoom >= 3 && zoom <= 19 ? zoom : 12);
      hasInitialFitRef.current = true;
    } else {
      map.setView(fallbackCenter, 5);
    }
    const element = containerRef.current;
    element.tabIndex = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const center = map.getCenter();
      const step = 0.05;
      if (event.key === "ArrowUp") map.panTo([center.lat + step, center.lng]);
      else if (event.key === "ArrowDown") map.panTo([center.lat - step, center.lng]);
      else if (event.key === "ArrowLeft") map.panTo([center.lat, center.lng - step]);
      else if (event.key === "ArrowRight") map.panTo([center.lat, center.lng + step]);
      else if (event.key === "+" || event.key === "=") map.zoomIn();
      else if (event.key === "-") map.zoomOut();
      else return;
      event.preventDefault();
    };
    element.addEventListener("keydown", onKeyDown);
    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      onCursorChange?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    map.on("mouseout", () => onCursorChange?.(null));
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (measureModeRef.current) {
        const next = [...measurePointsRef.current, { lat: event.latlng.lat, lng: event.latlng.lng }];
        measurePointsRef.current = next;
        setMeasurePoints(next);
        return;
      }
      onMapClickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      const current = new URLSearchParams(window.location.search);
      current.set("lat", center.lat.toFixed(5));
      current.set("lng", center.lng.toFixed(5));
      current.set("zoom", String(map.getZoom()));
      window.history.replaceState(null, "", `${window.location.pathname}?${current.toString()}`);
    });
    mapRef.current = map;

    return () => {
      element.removeEventListener("keydown", onKeyDown);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      measureRef.current = null;
    };
  }, [onCursorChange, tileAttribution, tileUrl]);

  useEffect(() => {
    setVisibleCommunities(communities);
    setVisibleResources(resources);
    setVisibleInfrastructure(infrastructure);
    setVisibleRoads(roads);
  }, [communities, infrastructure, resources, roads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let requestNumber = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadViewportFeatures = () => {
      const bounds = map.getBounds();
      const currentRequest = ++requestNumber;
      void backendApi.geospatialInBounds(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth())
        .then((features) => {
          if (currentRequest !== requestNumber) return;
          setVisibleCommunities(features.communities);
          setVisibleResources(features.resources);
          setVisibleInfrastructure(features.infrastructure);
          setVisibleRoads(features.roads);
        })
        .catch(() => {
          // Non-PostGIS local deployments retain their bootstrap feature set.
        });
    };
    const scheduleViewportLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadViewportFeatures, 150);
    };
    map.on("moveend", scheduleViewportLoad);
    scheduleViewportLoad();
    return () => {
      map.off("moveend", scheduleViewportLoad);
      if (timer) clearTimeout(timer);
      requestNumber += 1;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !searchFocus) return;
    map.setView([searchFocus.lat, searchFocus.lng], searchFocus.zoom || 14);
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    const marker = L.marker([searchFocus.lat, searchFocus.lng], { title: searchFocus.label || "Search result" });
    if (searchFocus.label) marker.bindPopup(`<strong>${escapeHtml(searchFocus.label)}</strong>`).openPopup();
    marker.addTo(map);
    searchMarkerRef.current = marker;
  }, [searchFocus]);

  useEffect(() => {
    const layer = measureRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (measurePoints.length === 0) return;
    const latlngs = measurePoints.map((point) => [point.lat, point.lng] as L.LatLngExpression);
    if (measureMode === "area" && latlngs.length >= 3) {
      L.polygon(latlngs, { color: "#0284C7", dashArray: "6 4" }).addTo(layer);
      let total = 0;
      for (let index = 0; index < measurePoints.length; index += 1) {
        const current = measurePoints[index];
        const next = measurePoints[(index + 1) % measurePoints.length];
        total += (next.lng - current.lng) * (2 + Math.sin((current.lat * Math.PI) / 180) + Math.sin((next.lat * Math.PI) / 180));
      }
      const areaKm2 = Math.abs((total * 6378137 * 6378137) / 2 / 1e6);
      onMeasureResult?.(`Area: ${areaKm2.toFixed(2)} km² (${measurePoints.length} points). Click to add, use controls to clear.`);
    } else {
      L.polyline(latlngs, { color: "#0284C7", dashArray: "6 4" }).addTo(layer);
      let distance = 0;
      for (let index = 1; index < measurePoints.length; index += 1) {
        distance += haversineKm(measurePoints[index - 1], measurePoints[index]);
      }
      if (measurePoints.length >= 2) onMeasureResult?.(`Distance: ${distance.toFixed(2)} km (${measurePoints.length} points).`);
    }
    measurePoints.forEach((point) => L.circleMarker([point.lat, point.lng], { radius: 5, color: "#0284C7", fillColor: "#FFFFFF", fillOpacity: 1 }).addTo(layer));
  }, [measureMode, measurePoints, onMeasureResult]);

  useEffect(() => {
    measurePointsRef.current = [];
    setMeasurePoints([]);
    measureRef.current?.clearLayers();
  }, [measureMode]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();

    const points: L.LatLngExpression[] = [
      ...effectiveAlerts.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...cameras.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...visibleCommunities.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...visibleResources.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
    ];
    if (!hasInitialFitRef.current && points.length > 0 && !searchFocus) {
      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
      else map.setView(points[0], 14);
      hasInitialFitRef.current = true;
    }

    if (layers.roads) visibleRoads.forEach((road) => {
      L.polyline(road.points.map((point) => [point.lat, point.lng] as L.LatLngExpression), { color: roadColor(road.status), weight: road.status === "open" ? 4 : 6, dashArray: road.status === "open" ? undefined : "10 7" })
        .bindPopup(`<strong>${escapeHtml(road.name)}</strong><br>Status: ${escapeHtml(road.status.replace("_", " "))}`)
        .addTo(overlay);
    });

    if (layers.riskZones) visibleCommunities.forEach((community) => {
      const score = riskScoreForArea(community.coordinates, effectiveAlerts, cameras);
      L.circle([community.coordinates.lat, community.coordinates.lng], { radius: score >= 70 ? 700 : score >= 38 ? 500 : 320, color: score >= 70 ? "#DC2626" : score >= 38 ? "#D97706" : "#16A34A", fillOpacity: 0.12, dashArray: "6 4" }).addTo(overlay);
    });

    if (layers.vulnerability) visibleCommunities.forEach((community) => {
      const score = communityVulnerability(community, effectiveAlerts, cameras);
      L.circle([community.coordinates.lat, community.coordinates.lng], { radius: Math.max(80, score * 12), color: "#A855F7", fill: false, weight: 2, opacity: 0.75 }).addTo(overlay);
    });

    if (layers.heatmap) effectiveAlerts.forEach((alert) => L.circle([alert.coordinates.lat, alert.coordinates.lng], { radius: 800, color: "#FB923C", fillColor: "#FB923C", fillOpacity: 0.11, stroke: false }).addTo(overlay));

    if (layers.infrastructure) visibleInfrastructure.forEach((item) => L.circleMarker([item.coordinates.lat, item.coordinates.lng], { radius: 7, color: "#0F172A", fillColor: "#FDE68A", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.type)} · ${escapeHtml(item.criticality)} criticality`).addTo(overlay));
    if (layers.cameras) cameras.forEach((camera) => L.circleMarker([camera.coordinates.lat, camera.coordinates.lng], { radius: 8, color: "#38BDF8", fillColor: "#0F172A", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(camera.name || camera.id)}</strong><br>${escapeHtml(camera.status)} · ${camera.aiActive ? "AI active" : "AI inactive"}`).addTo(overlay));
    if (layers.resources) visibleResources.forEach((resource) => L.circleMarker([resource.coordinates.lat, resource.coordinates.lng], { radius: 8, color: "#0F172A", fillColor: resource.available ? "#34D399" : "#64748B", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(resource.name)}</strong><br>${escapeHtml(resource.type)} · ${resource.available ? `${resource.capacity} ready` : "unavailable"}`).addTo(overlay));
    if (layers.communities) visibleCommunities.forEach((community) => {
      const vulnerability = communityVulnerability(community, effectiveAlerts, cameras);
      L.circleMarker([community.coordinates.lat, community.coordinates.lng], { radius: 8, color: "#F3E8FF", fillColor: "#A855F7", fillOpacity: 0.95 }).bindPopup(`<strong>${escapeHtml(community.name)}</strong><br>Population: ${community.population.toLocaleString()}<br>Vulnerability: ${vulnerability}/100`).addTo(overlay);
    });
    if (layers.incidents) {
      const zoom = map.getZoom();
      clusterAlerts(effectiveAlerts, zoom).forEach((cluster) => {
        if (cluster.items.length === 1) {
          const alert = cluster.items[0];
          const marker = L.circleMarker([alert.coordinates.lat, alert.coordinates.lng], { radius: selectedAlertId === alert.id ? 13 : 9, color: "#FFFFFF", weight: selectedAlertId === alert.id ? 3 : 1.5, fillColor: alertColor(alert.level), fillOpacity: alert.status === "resolved" ? 0.55 : 1 });
          marker.bindPopup(`<strong>${escapeHtml(alert.eventType)}</strong><br>${escapeHtml(alert.level.toUpperCase())} · ${escapeHtml(alert.status)}<br>${alert.coordinates.lat.toFixed(5)}, ${alert.coordinates.lng.toFixed(5)}`);
          marker.on("click", () => onSelectAlertRef.current(alert.id));
          marker.addTo(overlay);
          return;
        }
        const critical = cluster.items.some((item) => item.level === "critical");
        const marker = L.marker([cluster.lat, cluster.lng], {
          icon: L.divIcon({
            className: "sentrix-cluster",
            html: `<div style="display:flex;align-items:center;justify-content:center;min-width:30px;height:30px;border-radius:9999px;background:${critical ? "#DC2626" : "#D97706"};color:#fff;font:700 12px monospace;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${cluster.items.length}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        });
        marker.bindPopup(`<strong>${cluster.items.length} incidents in this area</strong><br>Zoom in to inspect individual severity and status.`);
        marker.on("click", () => map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 18)));
        marker.addTo(overlay);
      });
    }
    sectors.forEach((sector) => {
      if (sector.polygon.length < 3) return;
      L.polygon(sector.polygon.map((point) => [point.lat, point.lng] as L.LatLngExpression), { color: "#38BDF8", fillOpacity: 0.04, dashArray: "4 5" }).bindPopup(`<strong>${escapeHtml(sector.name)}</strong><br>Sector ${escapeHtml(sector.code)}`).addTo(overlay);
    });
  }, [effectiveAlerts, cameras, layers, sectors, selectedAlertId, visibleCommunities, visibleInfrastructure, visibleResources, visibleRoads, searchFocus]);

  return <div ref={containerRef} className="h-full min-h-[580px] w-full bg-[#0B192C]" aria-label="Interactive Sentrix GIS map. Use arrow keys to pan, plus and minus to zoom." />;
});

export default SentrixLeafletMap;
