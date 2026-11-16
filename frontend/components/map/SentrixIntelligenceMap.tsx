"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ambulance, Building2, CheckCircle2, Flame, Hospital, MapPinned, Radio, Route, Send, ShieldAlert, Upload, Users, X } from "lucide-react";
import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord, correlatedAlertIds, communitiesNear, communityVulnerability, infrastructureNear, nearestResources, riskBandForScore, riskScoreForArea, routeRecommendation } from "@/lib/geospatial/sentrixIntel";
import { cn } from "@/lib/utils";
import { getAuthSession } from "@/lib/auth";
import { MapSearchResult, LocationWorkspace, NearbyAssets, backendApi } from "@/lib/api/client";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { MapSearchBox } from "./MapSearchBox";
import { MapControls, MeasureMode } from "./MapControls";
import { DEFAULT_MAP_FILTERS, MapFilters, MapFilterState } from "./MapFilters";
import { CreateLocationDialog } from "./CreateLocationDialog";
import { LocationWorkspacePanel } from "./LocationWorkspacePanel";
import type { LeafletMapHandle, MapFocus, MapLayerVisibility } from "./SentrixLeafletMap";

const SentrixLeafletMap = dynamic(() => import("./SentrixLeafletMap"), {
  ssr: false,
  loading: () => <div className="flex min-h-[580px] items-center justify-center bg-[#0B192C] font-mono text-[10px] font-bold uppercase tracking-widest text-[#BAE6FD]">Loading live GIS layer…</div>,
});

export interface CommunityReportInput {
  category: string;
  description: string;
  reporterName: string;
  coordinates: { lat: number; lng: number };
  evidenceUrl?: string;
  attachmentName?: string;
}

interface SentrixIntelligenceMapProps {
  sectors: Sector[];
  cameras: Camera[];
  alerts: Alert[];
  communities: CommunityRecord[];
  resources: ResourceRecord[];
  infrastructure: InfrastructureRecord[];
  roads: RoadRecord[];
  onAcknowledgeAlert?: (alertId: string) => void;
  onSubmitCommunityReport: (report: CommunityReportInput) => void;
  className?: string;
}

const layerLabels: Record<keyof MapLayerVisibility, string> = {
  incidents: "INCIDENTS · REPORTED EVENTS",
  cameras: "CAMERAS · LOCATIONS",
  communities: "COMMUNITIES · VULNERABILITY",
  resources: "EMERGENCY RESOURCES",
  roads: "ROADS · CONNECTED ROUTES",
  riskZones: "RISK ZONES",
  vulnerability: "VULNERABILITY",
  heatmap: "HEATMAP · HOTSPOTS",
  infrastructure: "CRITICAL INFRASTRUCTURE",
};

const resourceIcon = (type: string) => type === "hospital" ? Hospital : type === "ambulance" ? Ambulance : type === "fire" ? Flame : Radio;
const scoreTone = (score: number) => score >= 70 ? "text-[#DC2626]" : score >= 38 ? "text-[#D97706]" : "text-[#16A34A]";
const DEMO_DELHI = { lat: 28.6139, lng: 77.2090 };
const demoAlerts: Alert[] = [
  { id: "DEMO-DELHI-01", level: "high", timestamp: new Date().toISOString(), sourceCameraId: "DEMO-CCTV-01", sourceCameraName: "Connaught Place Demo Camera", eventType: "Person detected — demo", confidence: 87, coordinates: { lat: 28.6315, lng: 77.2167 }, objectClass: "Person", evidenceUrl: "", status: "open", acknowledgedBy: null, sector: "New Delhi", notes: "Sample map record. Not a live incident.", evidenceSource: "demo" },
  { id: "DEMO-DELHI-02", level: "medium", timestamp: new Date().toISOString(), sourceCameraId: "DEMO-CCTV-02", sourceCameraName: "India Gate Demo Camera", eventType: "Community report — demo", confidence: 74, coordinates: { lat: 28.6129, lng: 77.2295 }, objectClass: "Unknown", evidenceUrl: "", status: "open", acknowledgedBy: null, sector: "Central Delhi", notes: "Sample map record. Not a live incident.", evidenceSource: "demo" },
  ...([
    ["Kashmere Gate", 28.6675, 77.2280, "critical"], ["Karol Bagh", 28.6514, 77.1907, "high"], ["Paharganj", 28.6442, 77.2166, "medium"], ["Lodhi Garden", 28.5931, 77.2197, "high"], ["Hauz Khas", 28.5494, 77.2001, "medium"], ["Saket", 28.5245, 77.2066, "high"], ["Lajpat Nagar", 28.5677, 77.2433, "medium"], ["Akshardham", 28.6127, 77.2773, "critical"], ["Rajouri Garden", 28.6421, 77.1167, "high"], ["Dwarka Sector 10", 28.5816, 77.0581, "medium"], ["Red Fort", 28.6562, 77.2410, "high"], ["Nehru Place", 28.5491, 77.2533, "medium"],
  ] as [string, number, number, string][]).map(([name, lat, lng, level], index) => ({ id: `DEMO-DELHI-${String(index + 3).padStart(2, "0")}`, level: level as Alert["level"], timestamp: new Date().toISOString(), sourceCameraId: `DEMO-CCTV-${index + 3}`, sourceCameraName: `${name} Demo Camera`, eventType: `Demo incident · ${name}`, confidence: 68 + index, coordinates: { lat, lng }, objectClass: "Person" as const, evidenceUrl: "", status: "open" as const, acknowledgedBy: null, sector: name, notes: "Sample map record. Not a live incident.", evidenceSource: "demo" as const })),
];
const demoCommunities: CommunityRecord[] = [
  { id: "DEMO-COMM-01", name: "Demo Community · Connaught Place", population: 12000, coordinates: { lat: 28.635, lng: 77.21 }, accessScore: 72, emergencyDistanceKm: 1.2 },
  { id: "DEMO-COMM-02", name: "Demo Community · India Gate", population: 18500, coordinates: { lat: 28.608, lng: 77.225 }, accessScore: 61, emergencyDistanceKm: 2.1 },
  ...[["Kashmere Gate", 28.667, 77.228], ["Karol Bagh", 28.651, 77.191], ["Lodhi Garden", 28.593, 77.22], ["Hauz Khas", 28.549, 77.2], ["Saket", 28.524, 77.207], ["Lajpat Nagar", 28.568, 77.243], ["Dwarka", 28.582, 77.058], ["Rajouri Garden", 28.642, 77.117]].map(([name, lat, lng], i) => ({ id: `DEMO-COMM-${String(i + 3).padStart(2, "0")}`, name: `Demo Community · ${name}`, population: 8000 + i * 2300, coordinates: { lat: Number(lat), lng: Number(lng) }, accessScore: 55 + (i % 4) * 9, emergencyDistanceKm: 1 + (i % 3) }))
];

export const SentrixIntelligenceMap: React.FC<SentrixIntelligenceMapProps> = ({
  sectors,
  cameras,
  alerts,
  communities,
  resources,
  infrastructure,
  roads,
  onAcknowledgeAlert,
  onSubmitCommunityReport,
  className,
}) => {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(alerts[0]?.id || null);
  const [layers, setLayers] = useState<MapLayerVisibility>({ incidents: true, cameras: true, communities: true, resources: true, roads: true, riskZones: true, vulnerability: true, heatmap: false, infrastructure: true });
  const [searchFocus, setSearchFocus] = useState<MapFocus | null>(null);
  const [filters, setFilters] = useState<MapFilterState>({ ...DEFAULT_MAP_FILTERS });
  const [measureMode, setMeasureMode] = useState<MeasureMode>(null);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [locateError, setLocateError] = useState("");
  const [measureResult, setMeasureResult] = useState("");
  const [createPoint, setCreatePoint] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<NearbyAssets | null>(null);
  const [workspace, setWorkspace] = useState<LocationWorkspace | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const mapHandle = useRef<LeafletMapHandle | null>(null);
  const [report, setReport] = useState<CommunityReportInput>({ category: "suspicious activity", description: "", reporterName: "", coordinates: { lat: 28.6139, lng: 77.2090 }, evidenceUrl: "", attachmentName: "" });
  const [reportSent, setReportSent] = useState(false);
  const [canImportGeoJson, setCanImportGeoJson] = useState(false);
  const [geoJsonCollection, setGeoJsonCollection] = useState<"communities" | "resources" | "infrastructure" | "roads">("communities");
  const [geoJsonImporting, setGeoJsonImporting] = useState(false);
  const [geoJsonImportMessage, setGeoJsonImportMessage] = useState("");

  useEffect(() => {
    setCanImportGeoJson(getAuthSession()?.tier === "admin");
  }, []);

  const mapAlerts = alerts.length ? alerts : demoAlerts;
  const mapCommunities = communities.length ? communities : demoCommunities;
  const mapResources = resources.length ? resources : [
    { id: "DEMO-RES-01", name: "Demo Police Response · Connaught Place", type: "police" as const, coordinates: { lat: 28.628, lng: 77.219 }, available: true, capacity: 3 },
    { id: "DEMO-RES-02", name: "Demo Ambulance · India Gate", type: "ambulance" as const, coordinates: { lat: 28.615, lng: 77.222 }, available: true, capacity: 2 },
  ];
  const mapInfrastructure = infrastructure.length ? infrastructure : [
    { id: "DEMO-INFRA-01", name: "Demo Critical Site · Central Secretariat", type: "school" as const, coordinates: { lat: 28.614, lng: 77.212 }, criticality: "high" as const },
  ];
  const mapRoads = roads.length ? roads : [{ id: "DEMO-ROAD-01", name: "Demo Central Delhi Route", points: [{ lat: 28.635, lng: 77.209 }, { lat: 28.625, lng: 77.217 }, { lat: 28.613, lng: 77.229 }], status: "open" as const }];
  const mapCameras = cameras.length ? cameras : [{ id: "DEMO-CCTV-01", name: "Demo CCTV · Connaught Place", sector: "New Delhi", rtspUrl: "", type: "fixed" as const, aiActive: true, personDetection: true, vehicleDetection: true, coordinates: { lat: 28.632, lng: 77.214 }, status: "online" } as Camera];
  const selectedAlert = mapAlerts.find((alert) => alert.id === selectedAlertId) || mapAlerts[0] || null;
  const mapSectors = sectors.length ? sectors : [{ id: "DEMO-SECTOR-CENTRAL", code: "ND-01", name: "Central Delhi", postsCount: 0, staffedCount: 0, threatLevel: "elevated" as const, centerCoordinates: DEMO_DELHI, polygon: [], posts: [], tripwires: [] }];
  const selectedPoint = selectedAlert?.coordinates || mapCommunities[0]?.coordinates || mapCameras[0]?.coordinates || DEMO_DELHI;
  const filteredAlerts = useMemo(() => mapAlerts.filter((alert) => {
    if (filters.severity && alert.level !== filters.severity) return false;
    if (filters.status && alert.status !== filters.status) return false;
    if (filters.sector && !alert.sector.toLowerCase().includes(filters.sector.toLowerCase())) return false;
    if (filters.source && (alert.evidenceSource || "") !== filters.source) return false;
    if (filters.team && !`${alert.assignedGuardName || ""} ${alert.sector}`.toLowerCase().includes(filters.team.toLowerCase())) return false;
    if (filters.timeRangeHours) {
      const hours = Number(filters.timeRangeHours);
      if (Number.isFinite(hours) && Date.now() - new Date(alert.timestamp).getTime() > hours * 3600 * 1000) return false;
    }
    if (filters.recordType && filters.recordType !== "alert") return false;
    return true;
  }), [mapAlerts, filters]);
  const visibleAlertsForInspector = filters.severity || filters.status || filters.sector || filters.source || filters.team || filters.timeRangeHours || filters.recordType ? filteredAlerts : mapAlerts;
  const selectedResources = useMemo(() => nearestResources(selectedPoint, mapResources), [selectedPoint, mapResources]);
  const selectedCommunities = useMemo(() => communitiesNear(selectedPoint, mapCommunities), [selectedPoint, mapCommunities]);
  const selectedInfrastructure = useMemo(() => infrastructureNear(selectedPoint, mapInfrastructure), [selectedPoint, mapInfrastructure]);
  const selectedCorrelations = selectedAlert ? correlatedAlertIds(selectedAlert, mapAlerts) : [];
  const selectedRoute = routeRecommendation(selectedPoint, mapAlerts, mapRoads);
  const overallRiskScore = Math.max(0, ...mapSectors.map((sector) => riskScoreForArea(sector.centerCoordinates, mapAlerts, mapCameras)));
  const overallRiskBand = riskBandForScore(overallRiskScore);
  const toggleLayer = (key: keyof MapLayerVisibility) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const layerCounts: Record<keyof MapLayerVisibility, number> = {
    incidents: mapAlerts.length,
    cameras: cameras.length || 1,
    communities: mapCommunities.length,
    resources: mapResources.length,
    roads: mapRoads.length,
    riskZones: mapCommunities.length,
    vulnerability: mapCommunities.length,
    heatmap: mapAlerts.length,
    infrastructure: mapInfrastructure.length,
  };

  const loadWorkspace = (lat: number, lng: number, label: string) => {
    setWorkspaceLabel(label);
    setWorkspaceLoading(true);
    void backendApi.locationWorkspace(lat, lng, 4)
      .then((data) => setWorkspace(data))
      .catch(() => setWorkspace(null))
      .finally(() => setWorkspaceLoading(false));
  };

  const handleSearchSelect = (result: MapSearchResult) => {
    setSearchFocus({ lat: result.lat, lng: result.lng, zoom: 14, label: result.label });
    setLocateError("");
    if (result.kind === "alert" && result.recordId) setSelectedAlertId(result.recordId);
    loadWorkspace(result.lat, result.lng, `${result.label} · ${result.sublabel}`);
  };

  const handleMapClick = (point: { lat: number; lng: number }) => {
    setCreatePoint(point);
    loadWorkspace(point.lat, point.lng, `Map point ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
  };

  useEffect(() => {
    if (!selectedPoint) return;
    let cancelled = false;
    void backendApi.nearbyAssets(selectedPoint.lat, selectedPoint.lng, 4, 5)
      .then((assets) => {
        if (!cancelled) setNearby(assets);
      })
      .catch(() => {
        if (!cancelled) setNearby(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAlertId]);

  const submitReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!report.description.trim() || !report.reporterName.trim()) return;
    onSubmitCommunityReport(report);
    setReportSent(true);
    setReport((current) => ({ ...current, description: "" }));
  };

  const importGeoJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setGeoJsonImportMessage("Import files must be 5 MB or smaller.");
      return;
    }
    setGeoJsonImporting(true);
    setGeoJsonImportMessage("");
    try {
      const document = JSON.parse(await file.text()) as unknown;
      const result = await backendApi.importGeoJson(geoJsonCollection, document);
      await useIBVAPStore.getState().hydrateFromBackend();
      setGeoJsonImportMessage(`Imported ${result.imported} verified ${geoJsonCollection} feature${result.imported === 1 ? "" : "s"}.`);
    } catch (error) {
      setGeoJsonImportMessage(error instanceof Error ? error.message : "GeoJSON import failed.");
    } finally {
      setGeoJsonImporting(false);
    }
  };

  return (
    <div className={cn("space-y-4 font-mono", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#CBDCEB] bg-white p-4 shadow-sm">
        <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><MapPinned className="h-4 w-4 text-[#0284C7]" /> SENTRIX INTERACTIVE GIS</div><p className="mt-1 text-[11px] font-sans text-[#475569]">Live backend-owned incidents, cameras, response resources, community impact and infrastructure layers.</p></div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase"><span className="border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1 text-[#475569]">{mapAlerts.length} EVENTS{alerts.length ? "" : " · DEMO"}</span><span className={cn("border px-2 py-1", overallRiskBand === "HIGH" ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]" : overallRiskBand === "MEDIUM" ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]" : "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]")}>{overallRiskBand} RISK // {overallRiskScore}</span></div>
      </div>

      {canImportGeoJson && <section className="flex flex-wrap items-end gap-3 border border-[#CBDCEB] bg-white p-3 shadow-sm" aria-label="Administrator GeoJSON import">
        <div className="min-w-48 flex-1"><label htmlFor="geojson-collection" className="block text-[10px] font-bold uppercase tracking-wider text-[#475569]">Import layer</label><select id="geojson-collection" value={geoJsonCollection} onChange={(event) => setGeoJsonCollection(event.target.value as typeof geoJsonCollection)} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs"><option value="communities">Communities (Point)</option><option value="resources">Resources (Point)</option><option value="infrastructure">Infrastructure (Point)</option><option value="roads">Roads (LineString)</option></select></div>
        <label className="min-w-56 flex-1 text-[10px] font-bold uppercase tracking-wider text-[#475569]">GeoJSON FeatureCollection<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => void importGeoJsonFile(event)} disabled={geoJsonImporting} className="mt-1 block w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1.5 text-xs font-normal normal-case" /></label>
        <div role="status" aria-live="polite" className="min-w-48 flex-1 text-[10px] text-[#475569]">{geoJsonImporting ? "Validating and importing features…" : geoJsonImportMessage || "Admin only · max 500 features · 5 MB"}</div>
        <Upload className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
      </section>}

      <div className="flex flex-wrap items-center gap-1 border border-[#CBDCEB] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#475569]"><span className="text-[#0284C7]">COLLECT</span><span>→</span><span className="text-[#0284C7]">DETECT</span><span>→</span><span className="text-[#0284C7]">LOCATE</span><span>→</span><span className="text-[#0284C7]">CORRELATE</span><span>→</span><span className="text-[#0284C7]">ASSESS</span><span>→</span><span className="text-[#0284C7]">RESPOND</span></div>

      <MapSearchBox onSelect={handleSearchSelect} className="w-full" />

      <MapFilters
        value={filters}
        onChange={setFilters}
        sectors={Array.from(new Set(mapAlerts.map((alert) => alert.sector).filter(Boolean)))}
        teams={Array.from(new Set(mapAlerts.map((alert) => alert.assignedGuardName || "").filter(Boolean)))}
      />

      <div className="overflow-hidden border border-[#CBDCEB] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#CBDCEB] bg-[#F0F6FC] p-3"><span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-[#475569]">DELHI GIS LAYERS</span>{(Object.keys(layerLabels) as Array<keyof MapLayerVisibility>).map((key) => <button key={key} type="button" aria-pressed={layers[key]} onClick={() => toggleLayer(key)} className={cn("border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors", layers[key] ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-[#CBDCEB] bg-white text-[#64748B]")}>{layerLabels[key]} · {layers[key] ? "ON" : "OFF"} · {layerCounts[key]}</button>)}</div>
        <div className="border-b border-[#CBDCEB] bg-white px-3 py-1.5 text-[10px] text-[#475569]" role="status" aria-live="polite">
          {Object.entries(layerLabels).filter(([key]) => layers[key as keyof MapLayerVisibility] && layerCounts[key as keyof MapLayerVisibility] === 0).length
            ? `No Delhi records loaded for: ${Object.entries(layerLabels).filter(([key]) => layers[key as keyof MapLayerVisibility] && layerCounts[key as keyof MapLayerVisibility] === 0).map(([, label]) => label).join(", ")}. Import verified Delhi GeoJSON records or add records through the admin workflow.`
            : "Layer visibility updated. Counts show loaded records for each layer."}
        </div>
        <div className="grid min-h-[610px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[580px] bg-[#0B192C]">
            <SentrixLeafletMap
              ref={mapHandle}
              sectors={sectors}
              cameras={mapCameras}
              alerts={mapAlerts}
              communities={mapCommunities}
              resources={mapResources}
              infrastructure={mapInfrastructure}
              roads={mapRoads}
              layers={layers}
              selectedAlertId={selectedAlertId}
              onSelectAlert={setSelectedAlertId}
              searchFocus={searchFocus}
              filteredAlerts={filteredAlerts}
              measureMode={measureMode}
              onMapClick={handleMapClick}
              onCursorChange={setCursor}
              onLocateError={setLocateError}
              onMeasureResult={setMeasureResult}
            />
            <div className="absolute left-3 top-3 w-[min(420px,calc(100%-24px))]">
              <MapSearchBox onSelect={handleSearchSelect} />
            </div>
            <div className="absolute right-3 top-3">
              <MapControls
                onZoomIn={() => mapHandle.current?.zoomIn()}
                onZoomOut={() => mapHandle.current?.zoomOut()}
                onReset={() => mapHandle.current?.reset()}
                onFullscreen={() => mapHandle.current?.fullscreen()}
                onLocate={() => mapHandle.current?.locate()}
                onCopyCenter={() => mapHandle.current?.copyCenter()}
                onMeasureChange={setMeasureMode}
                measureMode={measureMode}
                locateError={locateError}
                cursor={cursor}
                centerLabel={searchFocus ? `${searchFocus.lat.toFixed(5)}, ${searchFocus.lng.toFixed(5)}` : "Delhi overview"}
              />
            </div>
            {(measureResult || nearby) && (
              <div className="absolute bottom-12 left-3 max-w-[min(420px,calc(100%-24px))] border border-[#38BDF8]/40 bg-[#0F172A]/92 px-3 py-2 font-mono text-[10px] text-[#BAE6FD]" role="status">
                {measureResult && <div>{measureResult}</div>}
                {nearby && <div className="mt-1">Nearby: {nearby.cameras.length} cameras · {nearby.alerts.length} alerts · {nearby.communities.length} communities.</div>}
                <div className="mt-1">Click any map point to draft a camera, alert, community, checkpoint, resource, road, or zone record.</div>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-h-[34%] max-w-[min(620px,calc(100%-24px))] overflow-y-auto border border-[#38BDF8]/50 bg-[#0F172A]/95 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[#BAE6FD] shadow-lg sm:max-h-[25%]">
              <div className="mb-1 text-white">MAP LEGEND · DEMO RECORDS</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#DC2626]" />Critical incident / high risk</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#EA580C]" />High incident / hotspot</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#D97706]" />Medium incident / hotspot</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#A855F7]" />Community / vulnerability</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#38BDF8]" />CCTV camera</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#34D399]" />Available response resource</span><span><i className="mr-1 inline-block h-2 w-2 bg-[#FDE68A]" />Critical infrastructure</span><span><i className="mr-1 inline-block h-0.5 w-3 bg-[#0284C7]" />Open road / route</span><span><i className="mr-1 inline-block h-0.5 w-3 bg-[#DC2626]" />Affected road</span><span><i className="mr-1 inline-block h-0.5 w-3 bg-[#D97706]" />High-risk road</span>
              </div>
            </div>
          </div>

          <aside className="space-y-4 border-t border-[#CBDCEB] bg-white p-4 xl:border-l xl:border-t-0">
            {(workspace || workspaceLoading) && (
              <LocationWorkspacePanel
                label={workspaceLabel || "Selected location"}
                workspace={workspace}
                loading={workspaceLoading}
                onClose={() => {
                  setWorkspace(null);
                  setWorkspaceLabel("");
                }}
                onSelectAlert={setSelectedAlertId}
              />
            )}
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2"><span className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">IMPACT INSPECTOR</span><span className="text-[10px] text-[#0284C7]">HUMAN REVIEW</span></div>
            {selectedAlert ? <>
              <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold uppercase text-[#64748B]">SELECTED INCIDENT</div><div className="mt-1 text-sm font-bold text-[#0F172A]">{selectedAlert.eventType}</div></div><button type="button" onClick={() => setSelectedAlertId(null)} className="text-[#64748B]" aria-label="Close incident inspector"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><span className="block text-[#64748B]">SOURCE</span><strong>{selectedAlert.evidenceSource === "community_report" ? "COMMUNITY" : "AI / CAMERA"}</strong></div><div><span className="block text-[#64748B]">SEVERITY</span><strong className={selectedAlert.level === "critical" ? "text-[#DC2626]" : "text-[#D97706]"}>{selectedAlert.level.toUpperCase()}</strong></div><div><span className="block text-[#64748B]">LOCATION</span><strong>{selectedAlert.coordinates.lat.toFixed(4)}, {selectedAlert.coordinates.lng.toFixed(4)}</strong></div><div><span className="block text-[#64748B]">CORRELATED</span><strong>{selectedCorrelations.length} SOURCE LINK{selectedCorrelations.length === 1 ? "" : "S"}</strong></div></div></div>
              <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]"><Route className="h-3.5 w-3.5 text-[#0284C7]" /> RESPONSE RECOMMENDATION</div><div className="border border-[#BAE6FD] bg-[#F0F9FF] p-3 text-[10px] text-[#075985]"><strong className="block">{selectedRoute.route}</strong><span className="mt-1 block">Avoid: {selectedRoute.avoid}</span><span className="mt-1 block">{selectedRoute.reason}</span></div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">NEAREST RESOURCES</div><div className="space-y-1.5">{selectedResources.length ? selectedResources.map((resource) => { const Icon = resourceIcon(resource.type); return <div key={resource.id} className="flex items-center justify-between border border-[#CBDCEB] px-2 py-2 text-[10px]"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-[#0284C7]" />{resource.name}</span><strong className={resource.available ? "text-[#166534]" : "text-[#64748B]"}>{resource.distanceKm.toFixed(1)} KM // {resource.available ? `${resource.capacity} READY` : "BUSY"}</strong></div>; }) : <span className="text-[10px] text-[#64748B]">No response resources are configured near this incident.</span>}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">COMMUNITY IMPACT</div><div className="grid grid-cols-2 gap-2">{selectedCommunities.length ? selectedCommunities.map((community) => { const score = communityVulnerability(community, mapAlerts, mapCameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2 text-[10px]"><strong className="block truncate text-[#0F172A]">{community.name}</strong><span className="mt-1 block text-[#64748B]">{community.population.toLocaleString()} people</span><span className={cn("mt-1 block font-bold", scoreTone(score))}>VULNERABILITY {score}</span></div>; }) : <div className="col-span-2 text-[10px] text-[#64748B]">No community is configured within the current 4 km impact radius.</div>}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">CRITICAL INFRASTRUCTURE</div><div className="space-y-1 text-[10px]">{selectedInfrastructure.length ? selectedInfrastructure.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#E2E8F0] py-1"><span className="flex items-center gap-1.5"><Building2 className="h-3 w-3 text-[#D97706]" />{item.name}</span><span className="uppercase text-[#64748B]">{item.criticality}</span></div>) : <span className="text-[#64748B]">No infrastructure records are configured near this incident.</span>}</div></div>
              {onAcknowledgeAlert && selectedAlert.status === "open" && <button type="button" onClick={() => onAcknowledgeAlert(selectedAlert.id)} className="flex w-full items-center justify-center gap-2 bg-[#0284C7] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#0369A1]"><CheckCircle2 className="h-3.5 w-3.5" /> ACKNOWLEDGE AND REVIEW</button>}
            </> : <div className="py-10 text-center text-[10px] text-[#64748B]">Select an incident on the map to inspect risk, impact, resources and route guidance.</div>}
          </aside>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="border border-[#CBDCEB] bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><Users className="h-4 w-4 text-[#A855F7]" /> COMMUNITY INCIDENT REPORTING</div><span className="text-[10px] text-[#64748B]">TWO-WAY GROUND TRUTH</span></div><form onSubmit={submitReport} className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Reporter name<input required value={report.reporterName} onChange={(event) => setReport((current) => ({ ...current, reporterName: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Name or field worker ID" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Incident category<select value={report.category} onChange={(event) => setReport((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal"><option>suspicious activity</option><option>accident</option><option>fire</option><option>flood</option><option>missing person</option></select></label><label className="text-[10px] font-bold uppercase text-[#475569] md:col-span-2">Description<textarea required value={report.description} onChange={(event) => setReport((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-20 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Describe what happened, who may be affected, and any immediate access issue." /></label><label className="text-[10px] font-bold uppercase text-[#475569] md:col-span-2">Optional image or video<input type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file || file.size > 2 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => setReport((current) => ({ ...current, evidenceUrl: String(reader.result || ""), attachmentName: file.name })); reader.readAsDataURL(file); }} className="mt-1 block w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" />{report.attachmentName && <span className="mt-1 block normal-case text-[#166534]">Attached: {report.attachmentName}</span>}</label><div className="flex flex-wrap items-end gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Latitude<input type="number" step="0.0001" value={report.coordinates.lat} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lat: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Longitude<input type="number" step="0.0001" value={report.coordinates.lng} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lng: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><button type="submit" className="flex items-center gap-2 bg-[#A855F7] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#7E22CE]"><Send className="h-3.5 w-3.5" /> SUBMIT GEOREPORT</button>{reportSent && <span className="text-[10px] font-bold text-[#166534]">REPORT ADDED TO THE INCIDENT STREAM FOR OPERATOR REVIEW.</span>}</div></form></section>
        <section className="border border-[#CBDCEB] bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><ShieldAlert className="h-4 w-4 text-[#DC2626]" /> RISK AND VULNERABILITY REGISTER</div><span className="text-[10px] text-[#64748B]">EXPLAINABLE MODEL · DEMO DATA</span></div><div className="space-y-2">{mapCommunities.map((community) => { const risk = riskScoreForArea(community.coordinates, mapAlerts, mapCameras); const vulnerability = communityVulnerability(community, mapAlerts, mapCameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2.5"><div className="flex items-center justify-between gap-2 text-[10px] font-bold"><span className="truncate text-[#0F172A]">{community.name}</span><span className={scoreTone(Math.max(risk, vulnerability))}>{riskBandForScore(risk)} // RISK {risk}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#64748B]"><span>Population <strong className="text-[#0F172A]">{community.population.toLocaleString()}</strong></span><span>Vulnerability <strong className="text-[#A855F7]">{vulnerability}/100</strong></span></div><div className="mt-2 h-1.5 bg-[#E0ECF8]"><div className={cn("h-full", risk >= 70 ? "bg-[#DC2626]" : risk >= 38 ? "bg-[#D97706]" : "bg-[#16A34A]")} style={{ width: `${Math.max(risk, 10)}%` }} /></div></div>; })}</div></section>
      </div>
      <div className="border border-[#CBDCEB] bg-[#F8FBFE] px-4 py-3 text-[10px] text-[#64748B]">Sentrix ranks evidence, impact context and recommendations for authorized operators. It does not autonomously make law-enforcement or emergency decisions. Community reports and AI alerts require human review.</div>
      {createPoint && (
        <CreateLocationDialog
          point={createPoint}
          nearestPlace={communitiesNear(createPoint, communities, 12)[0]?.name || sectors[0]?.name || "Map area"}
          onClose={() => setCreatePoint(null)}
          onSaved={() => setCreatePoint(null)}
        />
      )}
    </div>
  );
};
