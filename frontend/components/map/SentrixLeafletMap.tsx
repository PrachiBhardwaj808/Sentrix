"use client";

import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord, riskScoreForArea, communityVulnerability, riskBandForScore } from "@/lib/geospatial/sentrixIntel";
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

const fallbackCenter: LatLngExpression = [20.5937, 78.9629];

const alertColor = (level: Alert["level"]) => level === "critical" ? "#DC2626" : level === "high" ? "#EA580C" : "#D97706";
const roadColor = (status: RoadRecord["status"]) => status === "affected" ? "#DC2626" : status === "high_risk" ? "#D97706" : "#0284C7";

function MapViewport({ points }: { points: LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (points.length > 1) {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [32, 32], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [map, points]);

  return null;
}

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
  const points = useMemo<LatLngExpression[]>(() => [
    ...alerts.map((item) => [item.coordinates.lat, item.coordinates.lng] as LatLngExpression),
    ...cameras.map((item) => [item.coordinates.lat, item.coordinates.lng] as LatLngExpression),
    ...communities.map((item) => [item.coordinates.lat, item.coordinates.lng] as LatLngExpression),
    ...resources.map((item) => [item.coordinates.lat, item.coordinates.lng] as LatLngExpression),
  ], [alerts, cameras, communities, resources]);

  const center = points[0] || fallbackCenter;
  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors";

  return (
    <MapContainer center={center} zoom={points.length ? 12 : 5} scrollWheelZoom className="h-full min-h-[580px] w-full bg-[#0B192C]">
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <MapViewport points={points} />

      {layers.roads && roads.map((road) => (
        <Polyline key={road.id} positions={road.points.map((point) => [point.lat, point.lng] as LatLngExpression)} pathOptions={{ color: roadColor(road.status), weight: road.status === "open" ? 4 : 6, dashArray: road.status === "open" ? undefined : "10 7" }}>
          <Popup><strong>{road.name}</strong><br />Status: {road.status.replace("_", " ")}</Popup>
        </Polyline>
      ))}

      {layers.riskZones && communities.map((community) => {
        const score = riskScoreForArea(community.coordinates, alerts, cameras);
        return <Circle key={`risk-${community.id}`} center={[community.coordinates.lat, community.coordinates.lng]} radius={score >= 70 ? 700 : score >= 38 ? 500 : 320} pathOptions={{ color: score >= 70 ? "#DC2626" : score >= 38 ? "#D97706" : "#16A34A", fillOpacity: 0.12, dashArray: "6 4" }} />;
      })}

      {layers.vulnerability && communities.map((community) => {
        const score = communityVulnerability(community, alerts, cameras);
        return <Circle key={`vulnerability-${community.id}`} center={[community.coordinates.lat, community.coordinates.lng]} radius={Math.max(80, score * 12)} pathOptions={{ color: "#A855F7", fill: false, weight: 2, opacity: 0.75 }} />;
      })}

      {layers.heatmap && alerts.map((alert) => <Circle key={`heat-${alert.id}`} center={[alert.coordinates.lat, alert.coordinates.lng]} radius={800} pathOptions={{ color: "#FB923C", fillColor: "#FB923C", fillOpacity: 0.11, stroke: false }} />)}

      {layers.infrastructure && infrastructure.map((item) => (
        <CircleMarker key={item.id} center={[item.coordinates.lat, item.coordinates.lng]} radius={7} pathOptions={{ color: "#0F172A", fillColor: "#FDE68A", fillOpacity: 1 }}>
          <Popup><strong>{item.name}</strong><br />{item.type} · {item.criticality} criticality</Popup>
        </CircleMarker>
      ))}

      {layers.cameras && cameras.map((camera) => (
        <CircleMarker key={camera.id} center={[camera.coordinates.lat, camera.coordinates.lng]} radius={8} pathOptions={{ color: "#38BDF8", fillColor: "#0F172A", fillOpacity: 1 }}>
          <Popup><strong>{camera.name || camera.id}</strong><br />{camera.status} · {camera.aiActive ? "AI active" : "AI inactive"}</Popup>
        </CircleMarker>
      ))}

      {layers.resources && resources.map((resource) => (
        <CircleMarker key={resource.id} center={[resource.coordinates.lat, resource.coordinates.lng]} radius={8} pathOptions={{ color: "#0F172A", fillColor: resource.available ? "#34D399" : "#64748B", fillOpacity: 1 }}>
          <Popup><strong>{resource.name}</strong><br />{resource.type} · {resource.available ? `${resource.capacity} ready` : "unavailable"}</Popup>
        </CircleMarker>
      ))}

      {layers.communities && communities.map((community) => {
        const vulnerability = communityVulnerability(community, alerts, cameras);
        return <CircleMarker key={community.id} center={[community.coordinates.lat, community.coordinates.lng]} radius={8} pathOptions={{ color: "#F3E8FF", fillColor: "#A855F7", fillOpacity: 0.95 }}>
          <Popup><strong>{community.name}</strong><br />Population: {community.population.toLocaleString()}<br />Vulnerability: {vulnerability}/100</Popup>
        </CircleMarker>;
      })}

      {layers.incidents && alerts.map((alert) => (
        <CircleMarker key={alert.id} center={[alert.coordinates.lat, alert.coordinates.lng]} radius={selectedAlertId === alert.id ? 13 : 9} eventHandlers={{ click: () => onSelectAlert(alert.id) }} pathOptions={{ color: "#FFFFFF", weight: selectedAlertId === alert.id ? 3 : 1.5, fillColor: alertColor(alert.level), fillOpacity: alert.status === "resolved" ? 0.55 : 1 }}>
          <Popup><strong>{alert.eventType}</strong><br />{alert.level.toUpperCase()} · {alert.status}<br />{alert.coordinates.lat.toFixed(5)}, {alert.coordinates.lng.toFixed(5)}</Popup>
        </CircleMarker>
      ))}

      {sectors.map((sector) => sector.polygon.length > 2 ? (
        <Polygon key={sector.id} positions={sector.polygon.map((point) => [point.lat, point.lng] as LatLngExpression)} pathOptions={{ color: "#38BDF8", fillOpacity: 0.04, dashArray: "4 5" }}>
          <Popup><strong>{sector.name}</strong><br />Sector {sector.code}</Popup>
        </Polygon>
      ) : null)}
    </MapContainer>
  );
}
