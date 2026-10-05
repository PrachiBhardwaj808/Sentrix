"use client";

import React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, Building2, FileText, Globe2, Route, ShieldCheck, Timer, Users } from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { DemoModeBadge } from "@/components/demo/DemoIncidentButton";
import { SENTRIX_COMMUNITIES, SENTRIX_RESOURCES, communityVulnerability, riskBandForScore, riskScoreForArea, sectorRisk } from "@/lib/geospatial/sentrixIntel";

const CHART_COLORS = ["#0284C7", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2"];

export default function AnalyticsPage() {
  const { alerts, cameras, guards, sectors, activityLog } = useIBVAPStore();
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;
  const assignedAlerts = alerts.filter((alert) => alert.dispatchStatus === "dispatched" || alert.assignedGuardId).length;
  const resolvedAlerts = alerts.filter((alert) => alert.status === "resolved").length;
  const onDuty = guards.filter((guard) => ["on_post", "patrolling", "unreachable"].includes(guard.status)).length;
  const communityData = SENTRIX_COMMUNITIES.map((community) => ({ ...community, vulnerability: communityVulnerability(community, alerts, cameras), risk: riskScoreForArea(community.coordinates, alerts, cameras) }));
  const sectorRiskData = sectors.map((sector) => ({ code: sector.code, name: sector.name, ...sectorRisk(sector, alerts, cameras) }));
  const affectedPopulation = communityData.filter((community) => community.risk >= 38 || community.vulnerability >= 60).reduce((sum, community) => sum + community.population, 0);
  const availableResources = SENTRIX_RESOURCES.filter((resource) => resource.available).length;
  const communityReports = alerts.filter((alert) => alert.evidenceSource === "community_report").length;
  const correlatedSignals = alerts.filter((alert) => alert.evidenceSource === "community_report" && alerts.some((candidate) => candidate.id !== alert.id && candidate.sourceCameraId !== alert.sourceCameraId && candidate.coordinates && Math.abs(candidate.coordinates.lat - alert.coordinates.lat) < 0.02 && Math.abs(candidate.coordinates.lng - alert.coordinates.lng) < 0.02)).length;

  const sectorData = sectors.map((sector) => ({
    name: sector.code,
    alerts: alerts.filter((alert) => alert.sector.includes(sector.name) || alert.sector.includes(sector.code)).length,
    guards: guards.filter((guard) => guard.currentSector?.includes(sector.name) || guard.currentSector?.includes(sector.code)).length,
  }));
  if (sectorData.length === 0) sectorData.push({ name: "LIVE", alerts: alerts.length, guards: onDuty });

  const severityData = ["critical", "high", "medium"].map((level) => ({
    name: level.toUpperCase(),
    value: alerts.filter((alert) => alert.level === level).length,
  }));

  const activityData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toLocaleDateString("en-IN", { weekday: "short" }),
      detections: alerts.filter((alert) => alert.timestamp.slice(0, 10) === key).length,
      actions: activityLog.filter((entry) => entry.timestamp.slice(0, 10) === key).length,
    };
  });

  const tooltipStyle = { backgroundColor: "#FFFFFF", border: "1px solid #CBDCEB", fontSize: 11 };

  return (
    <div className="space-y-6 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-[#0284C7] text-white"><BarChart3 className="h-4 w-4" /></div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">RISK INTELLIGENCE // COMMUNITY IMPACT BOARD</h1>
            <p className="mt-0.5 text-[11px] font-sans text-[#475569]">Historical incidents, risk zones, vulnerable communities and response capacity from the current Sentrix state.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><DemoModeBadge /><Link href="/alerts" className="border border-[#CBDCEB] bg-[#F0F6FC] px-3 py-2 text-[10px] font-bold uppercase text-[#0369A1] hover:bg-[#E0F2FE]">OPEN EVIDENCE →</Link></div>
      </div>

      <div className="grid grid-cols-1 gap-px border border-[#CBDCEB] bg-[#CBDCEB] sm:grid-cols-2 lg:grid-cols-4 shadow-sm">
        {[
          { label: "ACTIVE INCIDENTS", value: openAlerts, icon: ShieldCheck, color: "text-[#DC2626]" },
          { label: "GUARD RESPONSE", value: `${assignedAlerts}/${alerts.length || 0}`, icon: Users, color: "text-[#0284C7]" },
          { label: "RESOLVED RECORDS", value: resolvedAlerts, icon: FileText, color: "text-[#16A34A]" },
          { label: "CAMERA UPLINK", value: `${cameras.filter((camera) => camera.status === "online").length}/${cameras.length}`, icon: Activity, color: "text-[#D97706]" },
        ].map((metric) => (
          <div key={metric.label} className="bg-[#FFFFFF] p-5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#475569]"><span>{metric.label}</span><metric.icon className={`h-4 w-4 ${metric.color}`} /></div>
            <div className="mt-3 text-3xl font-bold text-[#0F172A]">{metric.value}</div>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><Globe2 className="h-4 w-4 text-[#0284C7]" /> PREDICTIVE RISK ZONES</div><span className="text-[10px] text-[#64748B]">RECENT + HISTORICAL SIGNALS</span></div>
          <div className="space-y-2">{(sectorRiskData.length ? sectorRiskData : [{ code: "LIVE", name: "Current operating area", score: riskScoreForArea({ lat: 27.245, lng: 88.765 }, alerts, cameras), band: riskBandForScore(riskScoreForArea({ lat: 27.245, lng: 88.765 }, alerts, cameras)) }]).map((zone) => <div key={zone.code} className="border border-[#CBDCEB] bg-[#F8FBFE] p-3"><div className="flex items-center justify-between text-[10px] font-bold uppercase"><span className="text-[#0F172A]">{zone.code} // {zone.name}</span><span className={zone.band === "HIGH" ? "text-[#DC2626]" : zone.band === "MEDIUM" ? "text-[#D97706]" : "text-[#16A34A]"}>{zone.band} {zone.score}/100</span></div><div className="mt-2 h-2 bg-[#E0ECF8]"><div className={zone.band === "HIGH" ? "h-full bg-[#DC2626]" : zone.band === "MEDIUM" ? "h-full bg-[#D97706]" : "h-full bg-[#16A34A]"} style={{ width: `${Math.max(zone.score, 6)}%` }} /></div><div className="mt-2 text-[10px] text-[#64748B]">Score combines incident count, recent activity, severity and camera coverage. It ranks attention; it does not make an autonomous decision.</div></div>)}</div>
        </div>
        <div className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0F172A]"><Users className="h-4 w-4 text-[#A855F7]" /> SOCIAL IMPACT SNAPSHOT</div><span className="text-[10px] text-[#64748B]">DECISION SUPPORT</span></div>
          <div className="grid grid-cols-2 gap-px border border-[#CBDCEB] bg-[#CBDCEB]">{[{ label: "POPULATION IN RISK ZONES", value: affectedPopulation.toLocaleString(), icon: Users }, { label: "AVAILABLE RESPONSE RESOURCES", value: `${availableResources}/${SENTRIX_RESOURCES.length}`, icon: Route }, { label: "COMMUNITY REPORTS", value: communityReports, icon: Globe2 }, { label: "CORRELATED SIGNALS", value: correlatedSignals, icon: ShieldCheck }].map((metric) => <div key={metric.label} className="bg-[#F8FBFE] p-3"><div className="flex items-center justify-between text-[10px] font-bold text-[#475569]"><span>{metric.label}</span><metric.icon className="h-3.5 w-3.5 text-[#0284C7]" /></div><div className="mt-2 text-2xl font-bold text-[#0F172A]">{metric.value}</div></div>)}</div>
          <div className="mt-4 space-y-2">{communityData.sort((a, b) => b.vulnerability - a.vulnerability).slice(0, 3).map((community) => <div key={community.id} className="flex items-center justify-between border-b border-[#E2E8F0] py-2 text-[10px]"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-[#A855F7]" />{community.name}</span><span className="font-bold text-[#A855F7]">VULNERABILITY {community.vulnerability}/100</span></div>)}</div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">SECTOR RESPONSE LOAD</h2><span className="text-[10px] text-[#64748B]">ALERTS / GUARDS</span></div>
          <div className="h-64 min-h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBDCEB" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="alerts" name="Alerts" fill="#DC2626" radius={[0, 0, 0, 0]} />
                <Bar dataKey="guards" name="Guards" fill="#0284C7" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">SEVEN-DAY EVENT PULSE</h2><span className="text-[10px] text-[#64748B]">DETECTIONS / ACTIONS</span></div>
          <div className="h-64 min-h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBDCEB" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="detections" name="Detections" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="actions" name="Actions" stroke="#0284C7" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">INCIDENT SEVERITY MIX</h2><span className="text-[10px] text-[#64748B]">CURRENT RECORDS</span></div>
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
            <div className="h-52 min-h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={severityData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={3}>{severityData.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index + 3]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-[10px]">{severityData.map((item, index) => <div key={item.name} className="flex items-center justify-between border border-[#CBDCEB] bg-[#F8FBFE] px-3 py-2"><span className="flex items-center gap-2 font-bold"><span className="h-2 w-2" style={{ backgroundColor: CHART_COLORS[index + 3] }} />{item.name}</span><strong className="text-[#0F172A]">{item.value}</strong></div>)}</div>
          </div>
        </section>

        <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#CBDCEB] pb-2"><h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">RESPONSE WORKFLOW</h2><Timer className="h-4 w-4 text-[#0284C7]" /></div>
          <div className="space-y-3">
            {[{ label: "DETECTED", value: alerts.length, tone: "bg-[#DC2626]" }, { label: "ASSIGNED TO GUARD", value: assignedAlerts, tone: "bg-[#D97706]" }, { label: "RESOLVED", value: resolvedAlerts, tone: "bg-[#16A34A]" }].map((stage, index) => <div key={stage.label} className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white ${stage.tone}`}>{index + 1}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-[10px] font-bold uppercase"><span className="text-[#475569]">{stage.label}</span><span className="text-[#0F172A]">{stage.value}</span></div><div className="mt-1 h-2 bg-[#E0ECF8]"><div className={`h-full ${stage.tone}`} style={{ width: `${alerts.length ? Math.min(100, (stage.value / alerts.length) * 100) : 0}%` }} /></div></div></div>)}
            <div className="mt-4 border-t border-[#CBDCEB] pt-3 text-[10px] text-[#64748B]">Workflow data is derived from alert state, guard assignment, and audit activity. It is a decision-support view, not an autonomous command system.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
