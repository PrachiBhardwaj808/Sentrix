import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";

export type GeoPoint = { lat: number; lng: number };
export type RiskBand = "LOW" | "MEDIUM" | "HIGH";

export interface CommunityRecord {
  id: string;
  name: string;
  population: number;
  coordinates: GeoPoint;
  accessScore: number;
  emergencyDistanceKm: number;
}

export interface InfrastructureRecord {
  id: string;
  name: string;
  type: "school" | "hospital" | "health centre" | "road junction";
  coordinates: GeoPoint;
  criticality: "high" | "medium";
}

export interface RoadRecord {
  id: string;
  name: string;
  points: GeoPoint[];
  status: "open" | "affected" | "high_risk";
}

const severityWeight: Record<Alert["level"], number> = { critical: 100, high: 72, medium: 42 };

export const haversineKm = (a: GeoPoint, b: GeoPoint) => {
  const earthRadius = 6371;
  const latDelta = ((b.lat - a.lat) * Math.PI) / 180;
  const lngDelta = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(latDelta / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const riskBandForScore = (score: number): RiskBand => (score >= 70 ? "HIGH" : score >= 38 ? "MEDIUM" : "LOW");

export const riskScoreForArea = (center: GeoPoint, alerts: Alert[], cameras: Camera[]) => {
  const nearby = alerts.filter((alert) => haversineKm(center, alert.coordinates) <= 3.2);
  const recent = nearby.filter((alert) => Date.now() - new Date(alert.timestamp).getTime() < 24 * 60 * 60 * 1000).length;
  const severity = nearby.reduce((max, alert) => Math.max(max, severityWeight[alert.level] || 0), 0);
  const cameraCoverage = cameras.filter((camera) => haversineKm(center, camera.coordinates) <= 2.5).length;
  return Math.min(100, Math.round(nearby.length * 12 + recent * 9 + severity * 0.25 + Math.max(0, 18 - cameraCoverage * 5)));
};

export const nearestResources = (point: GeoPoint, resources: ResourceRecord[], limit = 3) => resources
  .map((resource) => ({ ...resource, distanceKm: haversineKm(point, resource.coordinates) }))
  .sort((a, b) => a.distanceKm - b.distanceKm)
  .slice(0, limit);

export const communitiesNear = (point: GeoPoint, communities: CommunityRecord[], radiusKm = 4) => communities.filter((community) => haversineKm(point, community.coordinates) <= radiusKm);

export const infrastructureNear = (point: GeoPoint, infrastructure: InfrastructureRecord[], radiusKm = 3.5) => infrastructure.filter((item) => haversineKm(point, item.coordinates) <= radiusKm);

export const communityVulnerability = (community: CommunityRecord, alerts: Alert[], cameras: Camera[]) => {
  const exposure = alerts.filter((alert) => haversineKm(community.coordinates, alert.coordinates) <= 3.5).length;
  const coverageGap = cameras.some((camera) => haversineKm(community.coordinates, camera.coordinates) <= 2.5) ? 8 : 22;
  return Math.min(100, Math.round(exposure * 13 + (100 - community.accessScore) * 0.42 + community.emergencyDistanceKm * 5 + coverageGap));
};

export const routeRecommendation = (point: GeoPoint, alerts: Alert[], roads: RoadRecord[]) => {
  const nearbyRisks = alerts.filter((alert) => alert.status !== "resolved" && haversineKm(point, alert.coordinates) <= 2.5);
  const affectedRoad = roads.find((road) => road.status === "affected" && road.points.some((roadPoint) => haversineKm(point, roadPoint) < 2.5));
  return {
    route: affectedRoad ? "North Ridge Road → East Market Connector" : "North Ridge Road → direct approach",
    avoid: affectedRoad?.name || (nearbyRisks.length ? "Active incident perimeter" : "No restricted segment identified"),
    reason: affectedRoad ? "Affected segment excluded from route recommendation." : nearbyRisks.length ? "Route keeps response team outside the active incident perimeter." : "No affected road or high-risk segment is within the response corridor.",
  };
};

export const correlatedAlertIds = (alert: Alert, alerts: Alert[]) => alerts
  .filter((candidate) => candidate.id !== alert.id && candidate.evidenceSource !== alert.evidenceSource)
  .filter((candidate) => haversineKm(alert.coordinates, candidate.coordinates) <= 1.5)
  .filter((candidate) => Math.abs(new Date(alert.timestamp).getTime() - new Date(candidate.timestamp).getTime()) <= 45 * 60 * 1000)
  .map((candidate) => candidate.id);

export const sectorRisk = (sector: Sector, alerts: Alert[], cameras: Camera[]) => {
  const score = riskScoreForArea(sector.centerCoordinates, alerts, cameras);
  return { score, band: riskBandForScore(score) };
};
