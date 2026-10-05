"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ambulance,
  Building2,
  CarFront,
  CheckCircle2,
  Flame,
  Hospital,
  MapPinned,
  Radio,
  Route,
  Send,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { Alert, Camera, Sector } from "@/lib/types";
import {
  SENTRIX_COMMUNITIES,
  SENTRIX_INFRASTRUCTURE,
  SENTRIX_RESOURCES,
  SENTRIX_ROADS,
  correlatedAlertIds,
  communitiesNear,
  communityVulnerability,
  haversineKm,
  infrastructureNear,
  nearestResources,
  riskBandForScore,
  riskScoreForArea,
  routeRecommendation,
} from "@/lib/geospatial/sentrixIntel";
import { cn } from "@/lib/utils";

export interface CommunityReportInput {
  category: string;
  description: string;
  reporterName: string;
  coordinates: { lat: number; lng: number };
}

interface SentrixIntelligenceMapProps {
  sectors: Sector[];
  cameras: Camera[];
  alerts: Alert[];
  onAcknowledgeAlert?: (alertId: string) => void;
  onSubmitCommunityReport: (report: CommunityReportInput) => void;
  className?: string;
}

const BOUNDS = { minLat: 27.222, maxLat: 27.268, minLng: 88.738, maxLng: 88.795 };
const layerLabels = {
  incidents: "INCIDENTS",
  cameras: "CAMERAS",
  communities: "COMMUNITIES",
  resources: "RESOURCES",
  roads: "ROUTES",
  riskZones: "RISK ZONES",
  vulnerability: "VULNERABILITY",
  heatmap: "HEATMAP",
  infrastructure: "INFRASTRUCTURE",
} as const;

type LayerKey = keyof typeof layerLabels;

const resourceIcon = (type: string) => {
  if (type === "hospital") return Hospital;
  if (type === "ambulance") return Ambulance;
  if (type === "fire") return Flame;
  return Radio;
};

const scoreTone = (score: number) => score >= 70 ? "text-[#DC2626]" : score >= 38 ? "text-[#D97706]" : "text-[#16A34A]";

export const SentrixIntelligenceMap: React.FC<SentrixIntelligenceMapProps> = ({
  sectors,
  cameras,
  alerts,
  onAcknowledgeAlert,
  onSubmitCommunityReport,
  className,
}) => {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(alerts[0]?.id || null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    incidents: true,
    cameras: true,
    communities: true,
    resources: true,
    roads: true,
    riskZones: true,
    vulnerability: true,
    heatmap: false,
    infrastructure: true,
  });
  const [report, setReport] = useState<CommunityReportInput>({ category: "suspicious activity", description: "", reporterName: "", coordinates: { lat: 27.245, lng: 88.765 } });
  const [reportSent, setReportSent] = useState(false);

  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || null;
  const selectedPoint = selectedAlert?.coordinates || { lat: 27.245, lng: 88.765 };
  const selectedResources = useMemo(() => nearestResources(selectedPoint), [selectedPoint]);
  const selectedCommunities = useMemo(() => communitiesNear(selectedPoint), [selectedPoint]);
  const selectedInfrastructure = useMemo(() => infrastructureNear(selectedPoint), [selectedPoint]);
  const selectedCorrelations = selectedAlert ? correlatedAlertIds(selectedAlert, alerts) : [];
  const selectedRoute = routeRecommendation(selectedPoint, alerts);
  const overallRiskScore = Math.max(0, ...sectors.map((sector) => riskScoreForArea(sector.centerCoordinates, alerts, cameras)));
  const overallRiskBand = riskBandForScore(overallRiskScore);

  const toMapCoords = (lat: number, lng: number) => ({
    x: ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 900 + 50,
    y: ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 470 + 45,
  });

  const toggleLayer = (key: LayerKey) => setLayers((current) => ({ ...current, [key]: !current[key] }));

  const submitReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!report.description.trim() || !report.reporterName.trim()) return;
    onSubmitCommunityReport(report);
    setReportSent(true);
    setReport((current) => ({ ...current, description: "" }));
  };

  return (
    <div className={cn("space-y-4 font-mono", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><MapPinned className="h-4 w-4 text-[#0284C7]" /> SENTRIX INTELLIGENCE MAP</div>
          <p className="mt-1 text-[11px] font-sans text-[#475569]">AI detections, community reports, risk intelligence, vulnerable communities and response resources in one decision-support view.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase"><span className="border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1 text-[#475569]">{alerts.length} EVENTS</span><span className={cn("border px-2 py-1", overallRiskBand === "HIGH" ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]" : overallRiskBand === "MEDIUM" ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]" : "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]")}>{overallRiskBand} RISK // {overallRiskScore}</span></div>
      </div>

      <div className="overflow-hidden border border-[#CBDCEB] bg-[#FFFFFF] shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#CBDCEB] bg-[#F0F6FC] p-3">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-[#475569]">GIS LAYERS</span>
          {(Object.keys(layerLabels) as LayerKey[]).map((key) => (
            <button key={key} type="button" onClick={() => toggleLayer(key)} className={cn("border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors", layers[key] ? "border-[#0284C7] bg-[#0284C7] text-white" : "border-[#CBDCEB] bg-white text-[#64748B]")}>{layerLabels[key]}</button>
          ))}
        </div>

        <div className="grid min-h-[610px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative min-h-[580px] overflow-hidden bg-[#0B192C]">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(#1E4B6B 1px, transparent 1px), linear-gradient(90deg, #1E4B6B 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
            <svg viewBox="0 0 1000 560" className="absolute inset-0 h-full w-full">
              <text x="42" y="28" fill="#BAE6FD" fontSize="11" fontFamily="monospace" fontWeight="bold">COMMUNITY RESILIENCE OPERATING VIEW // REFERENCE GRID</text>
              {layers.roads && SENTRIX_ROADS.map((road) => {
                const points = road.points.map((point) => { const pos = toMapCoords(point.lat, point.lng); return `${pos.x},${pos.y}`; }).join(" ");
                return <polyline key={road.id} points={points} fill="none" stroke={road.status === "affected" ? "#F87171" : road.status === "high_risk" ? "#FBBF24" : "#38BDF8"} strokeWidth={road.status === "open" ? 3 : 5} strokeDasharray={road.status === "open" ? undefined : "10 7"} opacity="0.86" />;
              })}
              {layers.riskZones && SENTRIX_COMMUNITIES.map((community) => {
                const pos = toMapCoords(community.coordinates.lat, community.coordinates.lng);
                const score = riskScoreForArea(community.coordinates, alerts, cameras);
                return <circle key={`risk-${community.id}`} cx={pos.x} cy={pos.y} r={score >= 70 ? 55 : score >= 38 ? 42 : 30} fill={score >= 70 ? "#DC2626" : score >= 38 ? "#D97706" : "#16A34A"} opacity="0.10" stroke={score >= 70 ? "#F87171" : score >= 38 ? "#FBBF24" : "#34D399"} strokeWidth="1.5" strokeDasharray="6 4" />;
              })}
              {layers.vulnerability && SENTRIX_COMMUNITIES.map((community) => {
                const pos = toMapCoords(community.coordinates.lat, community.coordinates.lng);
                const score = communityVulnerability(community, alerts, cameras);
                return <circle key={`vuln-${community.id}`} cx={pos.x} cy={pos.y} r={8 + score / 9} fill="none" stroke="#C084FC" strokeWidth="1.5" opacity="0.65" />;
              })}
              {layers.heatmap && alerts.map((alert) => { const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng); return <circle key={`heat-${alert.id}`} cx={pos.x} cy={pos.y} r="34" fill="#FB923C" opacity="0.13" />; })}
              {layers.infrastructure && SENTRIX_INFRASTRUCTURE.map((item) => { const pos = toMapCoords(item.coordinates.lat, item.coordinates.lng); return <g key={item.id}><rect x={pos.x - 5} y={pos.y - 5} width="10" height="10" fill="#FDE68A" stroke="#0F172A" strokeWidth="1" /><text x={pos.x + 9} y={pos.y + 3} fill="#FDE68A" fontSize="8" fontFamily="monospace">{item.name}</text></g>; })}
              {layers.cameras && cameras.map((camera) => { const pos = toMapCoords(camera.coordinates.lat, camera.coordinates.lng); return <g key={camera.id}><circle cx={pos.x} cy={pos.y} r="7" fill="#0F172A" stroke="#38BDF8" strokeWidth="2" /><text x={pos.x + 10} y={pos.y + 3} fill="#BAE6FD" fontSize="8" fontFamily="monospace">{camera.id}</text></g>; })}
              {layers.resources && SENTRIX_RESOURCES.map((resource) => { const pos = toMapCoords(resource.coordinates.lat, resource.coordinates.lng); return <g key={resource.id}><path d={`M ${pos.x} ${pos.y - 7} L ${pos.x + 7} ${pos.y} L ${pos.x} ${pos.y + 7} L ${pos.x - 7} ${pos.y} Z`} fill={resource.available ? "#34D399" : "#64748B"} stroke="#0F172A" strokeWidth="1" /><text x={pos.x + 10} y={pos.y + 3} fill="#A7F3D0" fontSize="8" fontFamily="monospace">{resource.name}</text></g>; })}
              {layers.communities && SENTRIX_COMMUNITIES.map((community) => { const pos = toMapCoords(community.coordinates.lat, community.coordinates.lng); const selected = selectedCommunities.some((item) => item.id === community.id); return <g key={community.id}><circle cx={pos.x} cy={pos.y} r={selected ? 7 : 5} fill="#A855F7" stroke="#F3E8FF" strokeWidth={selected ? 2 : 1} /><text x={pos.x + 9} y={pos.y + 3} fill="#E9D5FF" fontSize="8" fontFamily="monospace">{community.name}</text></g>; })}
              {layers.incidents && alerts.map((alert) => { const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng); const selected = selectedAlertId === alert.id; const color = alert.level === "critical" ? "#EF4444" : alert.level === "high" ? "#F97316" : "#FBBF24"; return <g key={alert.id} onClick={() => setSelectedAlertId(alert.id)} className="cursor-pointer"><circle cx={pos.x} cy={pos.y} r={selected ? 12 : 8} fill={color} opacity={alert.status === "resolved" ? "0.55" : "1"} stroke="#FFFFFF" strokeWidth={selected ? 3 : 1.5} /><text x={pos.x + 13} y={pos.y + 3} fill="#FFFFFF" fontSize="8" fontFamily="monospace" fontWeight="bold">{alert.eventType.slice(0, 28)}</text></g>; })}
              {sectors.map((sector) => sector.polygon.length > 2 ? <polygon key={sector.id} points={sector.polygon.map((point) => { const pos = toMapCoords(point.lat, point.lng); return `${pos.x},${pos.y}`; }).join(" ")} fill="#38BDF8" opacity="0.04" stroke="#38BDF8" strokeWidth="1" strokeDasharray="4 5" /> : null)}
            </svg>
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 border border-[#38BDF8]/40 bg-[#0F172A]/90 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[#BAE6FD]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#EF4444]" />INCIDENT</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#A855F7]" />COMMUNITY</span><span><i className="mr-1 inline-block h-2 w-2 rotate-45 bg-[#34D399]" />RESOURCE</span><span><i className="mr-1 inline-block h-2 w-2 bg-[#FDE68A]" />INFRASTRUCTURE</span></div>
          </div>

          <aside className="space-y-4 border-t border-[#CBDCEB] bg-[#FFFFFF] p-4 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2"><span className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">IMPACT INSPECTOR</span><span className="text-[10px] text-[#0284C7]">HUMAN REVIEW</span></div>
            {selectedAlert ? <>
              <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold uppercase text-[#64748B]">SELECTED INCIDENT</div><div className="mt-1 text-sm font-bold text-[#0F172A]">{selectedAlert.eventType}</div></div><button type="button" onClick={() => setSelectedAlertId(null)} className="text-[#64748B]"><X className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><span className="block text-[#64748B]">SOURCE</span><strong>{selectedAlert.evidenceSource === "community_report" ? "COMMUNITY" : "AI / CAMERA"}</strong></div><div><span className="block text-[#64748B]">SEVERITY</span><strong className={selectedAlert.level === "critical" ? "text-[#DC2626]" : "text-[#D97706]"}>{selectedAlert.level.toUpperCase()}</strong></div><div><span className="block text-[#64748B]">LOCATION</span><strong>{selectedAlert.coordinates.lat.toFixed(4)}, {selectedAlert.coordinates.lng.toFixed(4)}</strong></div><div><span className="block text-[#64748B]">CORRELATED</span><strong>{selectedCorrelations.length} SOURCE LINK{selectedCorrelations.length === 1 ? "" : "S"}</strong></div></div></div>
              <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]"><Route className="h-3.5 w-3.5 text-[#0284C7]" /> RESPONSE RECOMMENDATION</div><div className="border border-[#BAE6FD] bg-[#F0F9FF] p-3 text-[10px] text-[#075985]"><strong className="block">{selectedRoute.route}</strong><span className="mt-1 block">Avoid: {selectedRoute.avoid}</span><span className="mt-1 block">{selectedRoute.reason}</span></div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">NEAREST RESOURCES</div><div className="space-y-1.5">{selectedResources.map((resource) => { const Icon = resourceIcon(resource.type); return <div key={resource.id} className="flex items-center justify-between border border-[#CBDCEB] px-2 py-2 text-[10px]"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-[#0284C7]" />{resource.name}</span><strong className={resource.available ? "text-[#166534]" : "text-[#64748B]"}>{resource.distanceKm.toFixed(1)} KM // {resource.available ? `${resource.capacity} READY` : "BUSY"}</strong></div>; })}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">COMMUNITY IMPACT</div><div className="grid grid-cols-2 gap-2">{selectedCommunities.length ? selectedCommunities.map((community) => { const score = communityVulnerability(community, alerts, cameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2 text-[10px]"><strong className="block truncate text-[#0F172A]">{community.name}</strong><span className="mt-1 block text-[#64748B]">{community.population.toLocaleString()} people</span><span className={cn("mt-1 block font-bold", scoreTone(score))}>VULNERABILITY {score}</span></div>; }) : <div className="col-span-2 text-[10px] text-[#64748B]">No community within the current 4 km impact radius.</div>}</div></div>
              <div><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#475569]">CRITICAL INFRASTRUCTURE</div><div className="space-y-1 text-[10px]">{selectedInfrastructure.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#E2E8F0] py-1"><span className="flex items-center gap-1.5"><Building2 className="h-3 w-3 text-[#D97706]" />{item.name}</span><span className="uppercase text-[#64748B]">{item.criticality}</span></div>)}</div></div>
              {onAcknowledgeAlert && selectedAlert.status === "open" && <button type="button" onClick={() => onAcknowledgeAlert(selectedAlert.id)} className="flex w-full items-center justify-center gap-2 bg-[#0284C7] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#0369A1]"><CheckCircle2 className="h-3.5 w-3.5" /> ACKNOWLEDGE AND REVIEW</button>}
            </> : <div className="py-10 text-center text-[10px] text-[#64748B]">Select an incident on the map to inspect risk, impact, resources and route guidance.</div>}
          </aside>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><Users className="h-4 w-4 text-[#A855F7]" /> COMMUNITY INCIDENT REPORTING</div><span className="text-[10px] text-[#64748B]">TWO-WAY GROUND TRUTH</span></div><form onSubmit={submitReport} className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Reporter name<input required value={report.reporterName} onChange={(event) => setReport((current) => ({ ...current, reporterName: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Name or field worker ID" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Incident category<select value={report.category} onChange={(event) => setReport((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal"><option>suspicious activity</option><option>accident</option><option>fire</option><option>flood</option><option>missing person</option></select></label><label className="text-[10px] font-bold uppercase text-[#475569] md:col-span-2">Description<textarea required value={report.description} onChange={(event) => setReport((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-20 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Describe what happened, who may be affected, and any immediate access issue." /></label><div className="flex flex-wrap items-end gap-2 md:col-span-2"><label className="text-[10px] font-bold uppercase text-[#475569]">Latitude<input type="number" step="0.0001" value={report.coordinates.lat} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lat: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><label className="text-[10px] font-bold uppercase text-[#475569]">Longitude<input type="number" step="0.0001" value={report.coordinates.lng} onChange={(event) => setReport((current) => ({ ...current, coordinates: { ...current.coordinates, lng: Number(event.target.value) } }))} className="mt-1 block w-32 border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal" /></label><button type="submit" className="flex items-center gap-2 bg-[#A855F7] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#7E22CE]"><Send className="h-3.5 w-3.5" /> SUBMIT GEOREPORT</button>{reportSent && <span className="text-[10px] font-bold text-[#166534]">REPORT ADDED TO THE INCIDENT STREAM FOR OPERATOR REVIEW.</span>}</div></form></section>
        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm"><div className="mb-3 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><ShieldAlert className="h-4 w-4 text-[#DC2626]" /> RISK AND VULNERABILITY REGISTER</div><span className="text-[10px] text-[#64748B]">EXPLAINABLE MODEL</span></div><div className="space-y-2">{SENTRIX_COMMUNITIES.map((community) => { const risk = riskScoreForArea(community.coordinates, alerts, cameras); const vulnerability = communityVulnerability(community, alerts, cameras); return <div key={community.id} className="border border-[#CBDCEB] bg-[#F8FBFE] p-2.5"><div className="flex items-center justify-between gap-2 text-[10px] font-bold"><span className="truncate text-[#0F172A]">{community.name}</span><span className={scoreTone(Math.max(risk, vulnerability))}>{riskBandForScore(risk)} // RISK {risk}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#64748B]"><span>Population <strong className="text-[#0F172A]">{community.population.toLocaleString()}</strong></span><span>Vulnerability <strong className="text-[#A855F7]">{vulnerability}/100</strong></span></div><div className="mt-2 h-1.5 bg-[#E0ECF8]"><div className={cn("h-full", risk >= 70 ? "bg-[#DC2626]" : risk >= 38 ? "bg-[#D97706]" : "bg-[#16A34A]")} style={{ width: `${Math.max(risk, 10)}%` }} /></div></div>; })}</div></section>
      </div>
      <div className="flex flex-wrap items-center gap-3 border border-[#CBDCEB] bg-[#F8FBFE] px-4 py-3 text-[10px] text-[#64748B]"><AlertTriangle className="h-3.5 w-3.5 text-[#D97706]" /> Sentrix provides ranked evidence, impact context and recommendations for authorized operators. It does not autonomously make law-enforcement or emergency decisions. Community reports and AI alerts require human review.</div>
    </div>
  );
};
