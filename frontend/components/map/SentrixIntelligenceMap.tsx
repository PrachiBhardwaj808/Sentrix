"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";
import { Ambulance, Building2, CheckCircle2, Flame, Hospital, MapPinned, Radio, Route, Send, ShieldAlert, Upload, Users, X } from "lucide-react";
import { Alert, Camera, ResourceRecord, Sector } from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord, correlatedAlertIds, communitiesNear, communityVulnerability, infrastructureNear, nearestResources, riskBandForScore, riskScoreForArea, routeRecommendation } from "@/lib/geospatial/sentrixIntel";
import { cn } from "@/lib/utils";
import { getAuthSession } from "@/lib/auth";
import { backendApi } from "@/lib/api/client";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import type { MapLayerVisibility } from "./SentrixLeafletMap";

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
  incidents: "INCIDENTS",
  cameras: "CAMERAS",
  communities: "COMMUNITIES",
  resources: "RESOURCES",
  roads: "ROUTES",
  riskZones: "RISK ZONES",
  vulnerability: "VULNERABILITY",
  heatmap: "HEATMAP",
  infrastructure: "INFRASTRUCTURE",
};

const resourceIcon = (type: string) => type === "hospital" ? Hospital : type === "ambulance" ? Ambulance : type === "fire" ? Flame : Radio;
const scoreTone = (score: number) => score >= 70 ? "text-[#DC2626]" : score >= 38 ? "text-[#D97706]" : "text-[#16A34A]";

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
  const [report, setReport] = useState<CommunityReportInput>({ category: "suspicious activity", description: "", reporterName: "", coordinates: { lat: 20.5937, lng: 78.9629 }, evidenceUrl: "", attachmentName: "" });
  const [reportSent, setReportSent] = useState(false);
  const [canImportGeoJson, setCanImportGeoJson] = useState(false);
  const [geoJsonCollection, setGeoJsonCollection] = useState<"communities" | "resources" | "infrastructure" | "roads">("communities");
  const [geoJsonImporting, setGeoJsonImporting] = useState(false);
  const [geoJsonImportMessage, setGeoJsonImportMessage] = useState("");

  useEffect(() => {
    setCanImportGeoJson(getAuthSession()?.tier === "admin");
  }, []);

  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || null;
  const selectedPoint = selectedAlert?.coordinates || communities[0]?.coordinates || cameras[0]?.coordinates || { lat: 20.5937, lng: 78.9629 };
  const selectedResources = useMemo(() => nearestResources(selectedPoint, resources), [selectedPoint, resources]);
  const selectedCommunities = useMemo(() => communitiesNear(selectedPoint, communities), [selectedPoint, communities]);
  const selectedInfrastructure = useMemo(() => infrastructureNear(selectedPoint, infrastructure), [selectedPoint, infrastructure]);
  const selectedCorrelations = selectedAlert ? correlatedAlertIds(selectedAlert, alerts) : [];
  const selectedRoute = routeRecommendation(selectedPoint, alerts, roads);
  const overallRiskScore = Math.max(0, ...sectors.map((sector) => riskScoreForArea(sector.centerCoordinates, alerts, cameras)));
  const overallRiskBand = riskBandForScore(overallRiskScore);
  const toggleLayer = (key: keyof MapLayerVisibility) => setLayers((current) => ({ ...current, [key]: !current[key] }));

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
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase"><span className="border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1 text-[#475569]">{alerts.length} EVENTS</span><span className={cn("border px-2 py-1", overallRiskBand === "HIGH" ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]" : overallRiskBand === "MEDIUM" ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]" : "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]")}>{overallRiskBand} RISK // {overallRiskScore}</span></div>
      </div>

      {canImportGeoJson && <section className="flex flex-wrap items-end gap-3 border border-[#CBDCEB] bg-white p-3 shadow-sm" aria-label="Administrator GeoJSON import">
        <div className="min-w-48 flex-1"><label htmlFor="geojson-collection" className="block text-[10px] font-bold uppercase tracking-wider text-[#475569]">Import layer</label><select id="geojson-collection" value={geoJsonCollection} onChange={(event) => setGeoJsonCollection(event.target.value as typeof geoJsonCollection)} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs"><option value="communities">Communities (Point)</option><option value="resources">Resources (Point)</option><option value="infrastructure">Infrastructure (Point)</option><option value="roads">Roads (LineString)</option></select></div>
        <label className="min-w-56 flex-1 text-[10px] font-bold uppercase tracking-wider text-[#475569]">GeoJSON FeatureCollection<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => void importGeoJsonFile(event)} disabled={geoJsonImporting} className="mt-1 block w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1.5 text-xs font-normal normal-case" /></label>
        <div role="status" aria-live="polite" className="min-w-48 flex-1 text-[10px] text-[#475569]">{geoJsonImporting ? "Validating and importing features…" : geoJsonImportMessage || "Admin only · max 500 features · 5 MB"}</div>
        <Upload className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
      </section>}

      <div className="flex flex-wrap items-center gap-1 border border-[#CBDCEB] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#475569]"><span className="text-[#0284C7]">COLLECT</span><span>→</span><span className="text-[#0284C7]">DETECT</span><span>→</span><span className="text-[#0284C7]">LOCATE</span><span>→</span><span className="text-[#0284C7]">CORRELATE</span><span>→</span><span className="text-[#0284C7]">ASSESS</span><span>→</span><span className="text-[#0284C7]">RESPOND</span></div>

      <div className="overflow-hidden border border-[#CBDCEB] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#CBDCEB] bg-[#F0F6FC] p-3"><span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-[#475569]">GIS LAYERS</span>{(Object.keys(layerLabels) as Array<keyof MapLayerVisibility>).map((key) => <button key={key} type="button" onClick={() => toggleLayer(key)} className={cn("border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors", layers[key] ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-[#CBDCEB] bg-white text-[#64748B]")}>{layerLabels[key]}</button>)}</div>
        <div className="grid min-h-[610px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[580px] bg-[#0B192C]"><SentrixLeafletMap sectors={sectors} cameras={cameras} alerts={alerts} communities={communities} resources={resources} infrastructure={infrastructure} roads={roads} layers={layers} selectedAlertId={selectedAlertId} onSelectAlert={setSelectedAlertId} /><div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 border border-[#38BDF8]/40 bg-[#0F172A]/90 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[#BAE6FD]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#EF4444]" />INCIDENT</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#A855F7]" />COMMUNITY</span><span><i className="mr-1 inline-block h-2 w-2 rotate-45 bg-[#34D399]" />RESOURCE</span><span><i className="mr-1 inline-block h-2 w-2 bg-[#FDE68A]" />INFRASTRUCTURE</span></div></div>

          <aside className="space-y-4 border-t border-[#CBDCEB] bg-white p-4 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2"><span className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">IMPACT INSPECTOR</span><span className="text-[10px] text-[#0284C7]">HUMAN REVIEW</span></div>
            {selectedAlert ? <>
              <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold uppercase text-[#64748B]">SELECTED INCIDENT</div><div className="mt-1 text-sm font-bold text-[#0F172A]">{selectedAlert.eventType}</div></div><button type="button" onClick={() => setSelectedAlertId(null)} className="text-[#64748B]" aria-label="Close incident inspector"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><span className="block text-[#64748B]">SOURCE</span><strong>{selectedAlert.evidenceSource === "community_report" ? "COMMUNITY" : "AI / CAMERA"}</strong></div><div><span className="block text-[#64748B]">SEVERITY</span><strong className={selectedAlert.level === "critical" ? "text-[#DC2626]" : "text-[#D97706]"}>{selectedAlert.level.toUpperCase()}</strong></div><div><span className="block text-[#64748B]">LOCATION</span><strong>{selectedAlert.coordinates.lat.toFixed(4)}, {selectedAlert.coordinates.lng.toFixed(4)}</strong></div><div><span className="block text-[#64748B]">CORRELATED</span><strong>{selectedCorrelations.length} SOURCE LINK{selectedCorrelations.length === 1 ? "" : "S"}</strong></div></div></div>
              <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]"><Route className="h-3.5 w-3.5 text-[#0284C7]" /> RESPONSE RECOMMENDATION</div><div className="border border-[#BAE6FD] bg-[#F0F9FF] p-3 text-[10px] text-[#075985]"><strong className="block">{selectedRoute.route}</strong><span className="mt-1 block">Avoid: {selectedRoute.avoid}</span><span className="mt-1 block">{selectedRoute.reason}</span></div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">NEAREST RESOURCES</div><div className="space-y-1.5">{selectedResources.length ? selectedResources.map((resource) => { const Icon = resourceIcon(resource.type); return <div key={resource.id} className="flex items-center justify-between border border-[#CBDCEB] px-2 py-2 text-[10px]"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-[#0284C7]" />{resource.name}</span><strong className={resource.available ? "text-[#166534]" : "text-[#64748B]"}>{resource.distanceKm.toFixed(1)} KM // {resource.available ? `${resource.capacity} READY` : "BUSY"}</strong></div>; }) : <span className="text-[10px] text-[#64748B]">No response resources are configured near this incident.</span>}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">COMMUNITY IMPACT</div><div className="grid grid-cols-2 gap-2">{selectedCommunities.length ? selectedCommunities.map((community) => { const score = communityVulnerability(community, alerts, cameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2 text-[10px]"><strong className="block truncate text-[#0F172A]">{community.name}</strong><span className="mt-1 block text-[#64748B]">{community.population.toLocaleString()} people</span><span className={cn("mt-1 block font-bold", scoreTone(score))}>VULNERABILITY {score}</span></div>; }) : <div className="col-span-2 text-[10px] text-[#64748B]">No community is configured within the current 4 km impact radius.</div>}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">CRITICAL INFRASTRUCTURE</div><div className="space-y-1 text-[10px]">{selectedInfrastructure.length ? selectedInfrastructure.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#E2E8F0] py-1"><span className="flex items-center gap-1.5"><Building2 className="h-3 w-3 text-[#D97706]" />{item.name}</span><span className="uppercase text-[#64748B]">{item.criticality}</span></div>) : <span className="text-[#64748B]">No infrastructure records are configured near this incident.</span>}</div></div>
              {onAcknowledgeAlert && selectedAlert.status === "open" && <button type="button" onClick={() => onAcknowledgeAlert(selectedAlert.id)} className="flex w-full items-center justify-center gap-2 bg-[#0284C7] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#0369A1]"><CheckCircle2 className="h-3.5 w-3.5" /> ACKNOWLEDGE AND REVIEW</button>}
            </> : <div className="py-10 text-center text-[10px] text-[#64748B]">Select an incident on the map to inspect risk, impact, resources and route guidance.</div>}
          </aside>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="border border-[#CBDCEB] bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><Users className="h-4 w-4 text-[#A855F7]" /> COMMUNITY INCIDENT REPORTING</div><span className="text-[10px] text-[#64748B]">TWO-WAY GROUND TRUTH</span></div><form onSubmit={submitReport} className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Reporter name<input required value={report.reporterName} onChange={(event) => setReport((current) => ({ ...current, reporterName: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Name or field worker ID" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Incident category<select value={report.category} onChange={(event) => setReport((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal"><option>suspicious activity</option><option>accident</option><option>fire</option><option>flood</option><option>missing person</option></select></label><label className="text-[10px] font-bold uppercase text-[#475569] md:col-span-2">Description<textarea required value={report.description} onChange={(event) => setReport((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-20 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Describe what happened, who may be affected, and any immediate access issue." /></label><label className="text-[10px] font-bold uppercase text-[#475569] md:col-span-2">Optional image or video<input type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file || file.size > 2 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => setReport((current) => ({ ...current, evidenceUrl: String(reader.result || ""), attachmentName: file.name })); reader.readAsDataURL(file); }} className="mt-1 block w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" />{report.attachmentName && <span className="mt-1 block normal-case text-[#166534]">Attached: {report.attachmentName}</span>}</label><div className="flex flex-wrap items-end gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Latitude<input type="number" step="0.0001" value={report.coordinates.lat} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lat: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Longitude<input type="number" step="0.0001" value={report.coordinates.lng} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lng: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><button type="submit" className="flex items-center gap-2 bg-[#A855F7] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#7E22CE]"><Send className="h-3.5 w-3.5" /> SUBMIT GEOREPORT</button>{reportSent && <span className="text-[10px] font-bold text-[#166534]">REPORT ADDED TO THE INCIDENT STREAM FOR OPERATOR REVIEW.</span>}</div></form></section>
        <section className="border border-[#CBDCEB] bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><ShieldAlert className="h-4 w-4 text-[#DC2626]" /> RISK AND VULNERABILITY REGISTER</div><span className="text-[10px] text-[#64748B]">EXPLAINABLE MODEL</span></div><div className="space-y-2">{communities.length ? communities.map((community) => { const risk = riskScoreForArea(community.coordinates, alerts, cameras); const vulnerability = communityVulnerability(community, alerts, cameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2.5"><div className="flex items-center justify-between gap-2 text-[10px] font-bold"><span className="truncate text-[#0F172A]">{community.name}</span><span className={scoreTone(Math.max(risk, vulnerability))}>{riskBandForScore(risk)} // RISK {risk}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#64748B]"><span>Population <strong className="text-[#0F172A]">{community.population.toLocaleString()}</strong></span><span>Vulnerability <strong className="text-[#A855F7]">{vulnerability}/100</strong></span></div><div className="mt-2 h-1.5 bg-[#E0ECF8]"><div className={cn("h-full", risk >= 70 ? "bg-[#DC2626]" : risk >= 38 ? "bg-[#D97706]" : "bg-[#16A34A]")} style={{ width: `${Math.max(risk, 10)}%` }} /></div></div>; }) : <div className="border border-dashed border-[#CBDCEB] p-4 text-[10px] text-[#64748B]">No community reference records are configured. Add verified geography records to enable impact scoring.</div>}</div></section>
      </div>
      <div className="border border-[#CBDCEB] bg-[#F8FBFE] px-4 py-3 text-[10px] text-[#64748B]">Sentrix ranks evidence, impact context and recommendations for authorized operators. It does not autonomously make law-enforcement or emergency decisions. Community reports and AI alerts require human review.</div>
    </div>
  );
};
