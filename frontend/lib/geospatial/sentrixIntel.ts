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

export const SENTRIX_COMMUNITIES: CommunityRecord[] = [
  { id: "COMM-NORTH-RIDGE", name: "North Ridge Hamlet", population: 860, coordinates: { lat: 27.254, lng: 88.768 }, accessScore: 68, emergencyDistanceKm: 3.8 },
  { id: "COMM-RIVER-BEND", name: "River Bend Settlement", population: 1240, coordinates: { lat: 27.238, lng: 88.777 }, accessScore: 52, emergencyDistanceKm: 5.1 },
  { id: "COMM-EAST-MARKET", name: "East Market Cluster", population: 2140, coordinates: { lat: 27.247, lng: 88.751 }, accessScore: 81, emergencyDistanceKm: 2.4 },
  { id: "COMM-SOUTH-GATE", name: "South Gate Community", population: 1760, coordinates: { lat: 27.229, lng: 88.758 }, accessScore: 59, emergencyDistanceKm: 4.2 },
];

export const SENTRIX_RESOURCES: ResourceRecord[] = [
  { id: "RES-POLICE-NORTH", name: "North Police Post", type: "police", coordinates: { lat: 27.252, lng: 88.759 }, available: true, capacity: 4 },
  { id: "RES-DISTRICT-HOSPITAL", name: "District Hospital", type: "hospital", coordinates: { lat: 27.241, lng: 88.748 }, available: true, capacity: 24 },
  { id: "RES-FIRE-EAST", name: "East Fire Station", type: "fire", coordinates: { lat: 27.246, lng: 88.785 }, available: true, capacity: 3 },
  { id: "RES-AMBULANCE-02", name: "Ambulance Unit 02", type: "ambulance", coordinates: { lat: 27.232, lng: 88.771 }, available: true, capacity: 1 },
  { id: "RES-RESPONSE-TEAM", name: "Community Response Team", type: "response_team", coordinates: { lat: 27.258, lng: 88.781 }, available: false, capacity: 0 },
];

export const SENTRIX_INFRASTRUCTURE: InfrastructureRecord[] = [
  { id: "INF-SCHOOL-01", name: "Ridge Government School", type: "school", coordinates: { lat: 27.255, lng: 88.764 }, criticality: "high" },
  { id: "INF-HEALTH-01", name: "River Bend Health Centre", type: "health centre", coordinates: { lat: 27.238, lng: 88.774 }, criticality: "high" },
  { id: "INF-JUNCTION-01", name: "East Market Junction", type: "road junction", coordinates: { lat: 27.246, lng: 88.753 }, criticality: "medium" },
  { id: "INF-HOSPITAL-01", name: "District Hospital Campus", type: "hospital", coordinates: { lat: 27.241, lng: 88.748 }, criticality: "high" },
];

export const SENTRIX_ROADS: RoadRecord[] = [
  { id: "ROAD-NORTH-01", name: "North Ridge Road", status: "open", points: [{ lat: 27.226, lng: 88.744 }, { lat: 27.24, lng: 88.758 }, { lat: 27.258, lng: 88.781 }, { lat: 27.264, lng: 88.79 }] },
  { id: "ROAD-EAST-02", name: "East Market Connector", status: "high_risk", points: [{ lat: 27.244, lng: 88.741 }, { lat: 27.246, lng: 88.753 }, { lat: 27.246, lng: 88.77 }, { lat: 27.254, lng: 88.789 }] },
  { id: "ROAD-RIVER-03", name: "River Bend Access", status: "affected", points: [{ lat: 27.226, lng: 88.77 }, { lat: 27.238, lng: 88.777 }, { lat: 27.251, lng: 88.79 }] },
];

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

export const nearestResources = (point: GeoPoint, resources = SENTRIX_RESOURCES, limit = 3) => resources
  .map((resource) => ({ ...resource, distanceKm: haversineKm(point, resource.coordinates) }))
  .sort((a, b) => a.distanceKm - b.distanceKm)
  .slice(0, limit);

export const communitiesNear = (point: GeoPoint, radiusKm = 4) => SENTRIX_COMMUNITIES.filter((community) => haversineKm(point, community.coordinates) <= radiusKm);

export const infrastructureNear = (point: GeoPoint, radiusKm = 3.5) => SENTRIX_INFRASTRUCTURE.filter((item) => haversineKm(point, item.coordinates) <= radiusKm);

export const communityVulnerability = (community: CommunityRecord, alerts: Alert[], cameras: Camera[]) => {
  const exposure = alerts.filter((alert) => haversineKm(community.coordinates, alert.coordinates) <= 3.5).length;
  const coverageGap = cameras.some((camera) => haversineKm(community.coordinates, camera.coordinates) <= 2.5) ? 8 : 22;
  return Math.min(100, Math.round(exposure * 13 + (100 - community.accessScore) * 0.42 + community.emergencyDistanceKm * 5 + coverageGap));
};

export const routeRecommendation = (point: GeoPoint, alerts: Alert[]) => {
  const nearbyRisks = alerts.filter((alert) => alert.status !== "resolved" && haversineKm(point, alert.coordinates) <= 2.5);
  const affectedRoad = SENTRIX_ROADS.find((road) => road.status === "affected" && road.points.some((roadPoint) => haversineKm(point, roadPoint) < 2.5));
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
