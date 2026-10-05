"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord, communityVulnerability, riskScoreForArea } from "@/lib/geospatial/sentrixIntel";
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
}

const fallbackCenter: L.LatLngExpression = [20.5937, 78.9629];
const alertColor = (level: Alert["level"]) => level === "critical" ? "#DC2626" : level === "high" ? "#EA580C" : "#D97706";
const roadColor = (status: RoadRecord["status"]) => status === "affected" ? "#DC2626" : status === "high_risk" ? "#D97706" : "#0284C7";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));

export default function SentrixLeafletMap({
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
}: SentrixLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);

  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true, zoomControl: true });
    L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    map.setView(fallbackCenter, 5);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [tileAttribution, tileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();

    const points: L.LatLngExpression[] = [
      ...alerts.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...cameras.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...communities.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
      ...resources.map((item) => [item.coordinates.lat, item.coordinates.lng] as L.LatLngExpression),
    ];
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 14);

    if (layers.roads) roads.forEach((road) => {
      L.polyline(road.points.map((point) => [point.lat, point.lng] as L.LatLngExpression), { color: roadColor(road.status), weight: road.status === "open" ? 4 : 6, dashArray: road.status === "open" ? undefined : "10 7" })
        .bindPopup(`<strong>${escapeHtml(road.name)}</strong><br>Status: ${escapeHtml(road.status.replace("_", " "))}`)
        .addTo(overlay);
    });

    if (layers.riskZones) communities.forEach((community) => {
      const score = riskScoreForArea(community.coordinates, alerts, cameras);
      L.circle([community.coordinates.lat, community.coordinates.lng], { radius: score >= 70 ? 700 : score >= 38 ? 500 : 320, color: score >= 70 ? "#DC2626" : score >= 38 ? "#D97706" : "#16A34A", fillOpacity: 0.12, dashArray: "6 4" }).addTo(overlay);
    });

    if (layers.vulnerability) communities.forEach((community) => {
      const score = communityVulnerability(community, alerts, cameras);
      L.circle([community.coordinates.lat, community.coordinates.lng], { radius: Math.max(80, score * 12), color: "#A855F7", fill: false, weight: 2, opacity: 0.75 }).addTo(overlay);
    });

    if (layers.heatmap) alerts.forEach((alert) => L.circle([alert.coordinates.lat, alert.coordinates.lng], { radius: 800, color: "#FB923C", fillColor: "#FB923C", fillOpacity: 0.11, stroke: false }).addTo(overlay));

    if (layers.infrastructure) infrastructure.forEach((item) => L.circleMarker([item.coordinates.lat, item.coordinates.lng], { radius: 7, color: "#0F172A", fillColor: "#FDE68A", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.type)} · ${escapeHtml(item.criticality)} criticality`).addTo(overlay));
    if (layers.cameras) cameras.forEach((camera) => L.circleMarker([camera.coordinates.lat, camera.coordinates.lng], { radius: 8, color: "#38BDF8", fillColor: "#0F172A", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(camera.name || camera.id)}</strong><br>${escapeHtml(camera.status)} · ${camera.aiActive ? "AI active" : "AI inactive"}`).addTo(overlay));
    if (layers.resources) resources.forEach((resource) => L.circleMarker([resource.coordinates.lat, resource.coordinates.lng], { radius: 8, color: "#0F172A", fillColor: resource.available ? "#34D399" : "#64748B", fillOpacity: 1 }).bindPopup(`<strong>${escapeHtml(resource.name)}</strong><br>${escapeHtml(resource.type)} · ${resource.available ? `${resource.capacity} ready` : "unavailable"}`).addTo(overlay));
    if (layers.communities) communities.forEach((community) => {
      const vulnerability = communityVulnerability(community, alerts, cameras);
      L.circleMarker([community.coordinates.lat, community.coordinates.lng], { radius: 8, color: "#F3E8FF", fillColor: "#A855F7", fillOpacity: 0.95 }).bindPopup(`<strong>${escapeHtml(community.name)}</strong><br>Population: ${community.population.toLocaleString()}<br>Vulnerability: ${vulnerability}/100`).addTo(overlay);
    });
    if (layers.incidents) alerts.forEach((alert) => {
      const marker = L.circleMarker([alert.coordinates.lat, alert.coordinates.lng], { radius: selectedAlertId === alert.id ? 13 : 9, color: "#FFFFFF", weight: selectedAlertId === alert.id ? 3 : 1.5, fillColor: alertColor(alert.level), fillOpacity: alert.status === "resolved" ? 0.55 : 1 });
      marker.bindPopup(`<strong>${escapeHtml(alert.eventType)}</strong><br>${escapeHtml(alert.level.toUpperCase())} · ${escapeHtml(alert.status)}<br>${alert.coordinates.lat.toFixed(5)}, ${alert.coordinates.lng.toFixed(5)}`);
      marker.on("click", () => onSelectAlert(alert.id));
      marker.addTo(overlay);
    });
    sectors.forEach((sector) => {
      if (sector.polygon.length < 3) return;
      L.polygon(sector.polygon.map((point) => [point.lat, point.lng] as L.LatLngExpression), { color: "#38BDF8", fillOpacity: 0.04, dashArray: "4 5" }).bindPopup(`<strong>${escapeHtml(sector.name)}</strong><br>Sector ${escapeHtml(sector.code)}`).addTo(overlay);
    });
  }, [alerts, cameras, communities, infrastructure, layers, onSelectAlert, resources, roads, sectors, selectedAlertId]);

  return <div ref={containerRef} className="h-full min-h-[580px] w-full bg-[#0B192C]" aria-label="Interactive Sentrix GIS map" />;
}
