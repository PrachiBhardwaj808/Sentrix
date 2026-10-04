"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Users,
  Video,
  AlertTriangle,
  ChevronRight,
  Phone,
  Shield,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { StatusPill } from "@/components/shared/StatusPill";
import { CameraVideoFeed } from "@/components/video/CameraVideoFeed";
import { formatTimeIST, calculateTimeRemaining } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";
import { DemoIncidentButton } from "@/components/demo/DemoIncidentButton";
import { backendApi, MonitoringMetrics } from "@/lib/api/client";

export default function DashboardPage() {
  const [monitoring, setMonitoring] = useState<MonitoringMetrics | null>(null);
  const {
    alerts,
    cameras,
    guards,
    acknowledgeAlert,
    escalateAlert,
    defconLevel,
  } = useIBVAPStore();

  const openAlerts = alerts.filter((a) => a.status === "open");
  const criticalAlerts = alerts.filter((a) => a.status === "open" && a.level === "critical");
  const onlineCameras = cameras.filter((c) => c.status === "online");
  const onDutyGuards = guards.filter(
    (g) => g.status === "on_post" || g.status === "patrolling" || g.status === "unreachable"
  );

  const previewCameras = cameras.slice(0, 2);
  const unstaffedGuardCount = Math.max(guards.length - onDutyGuards.length, 0);

  useEffect(() => {
    void backendApi.getMonitoringMetrics().then((response) => setMonitoring(response.metrics)).catch(() => setMonitoring(null));
  }, []);

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              COMMAND CONSOLE // SECTOR_NODE_ALPHA_07
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Live automated surveillance overview & post readiness.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <DemoIncidentButton />
          <Link href="/guard-duty">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] border border-[#CBDCEB] text-xs font-bold text-[#0369A1] transition-colors rounded-none">
              <AlertTriangle className="w-4 h-4 text-[#0284C7]" />
              <span>{guards.length > 0 ? `${onDutyGuards.length}/${guards.length} POSTS ON DUTY` : "NO ROSTER DATA"}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#0284C7]" />
            </div>
          </Link>
        </div>
      </div>

      {/* 4 High-Contrast KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#CBDCEB] border border-[#CBDCEB] shadow-sm">
        {/* Alerts KPI */}
        <Link href="/alerts" className="block p-5 bg-[#FFFFFF] hover:bg-[#F8FBFE] transition-colors group">
          <div className="flex items-center justify-between text-[#475569] text-[10px] uppercase tracking-widest font-bold">
            <span>ACTIVE THREATS</span>
            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A]">{openAlerts.length}</span>
            <span className="text-[11px] text-[#DC2626] uppercase font-bold">
              {criticalAlerts.length} CRITICAL
            </span>
          </div>
          <span className="text-[10px] text-[#0284C7] group-hover:underline mt-3 block uppercase tracking-wider font-bold">
            OPEN EVIDENCE VAULT →
          </span>
        </Link>

        {/* Sentry Posts KPI */}
        <Link href="/guard-duty" className="block p-5 bg-[#FFFFFF] hover:bg-[#F8FBFE] transition-colors group">
          <div className="flex items-center justify-between text-[#475569] text-[10px] uppercase tracking-widest font-bold">
            <span>SENTRY POSTS</span>
            <Users className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A]">{onDutyGuards.length} / {guards.length}</span>
            <span className="text-[11px] text-[#0369A1] uppercase font-bold">{guards.length > 0 ? `${unstaffedGuardCount} UNSTAFFED` : "NO ROSTER"}</span>
          </div>
          <span className="text-[10px] text-[#0284C7] group-hover:underline mt-3 block uppercase tracking-wider font-bold">
            MANAGE ROSTER →
          </span>
        </Link>

        {/* Cameras KPI */}
        <Link href="/live-feed" className="block p-5 bg-[#FFFFFF] hover:bg-[#F8FBFE] transition-colors group">
          <div className="flex items-center justify-between text-[#475569] text-[10px] uppercase tracking-widest font-bold">
            <span>CAMERAS ONLINE</span>
            <Video className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A]">
              {onlineCameras.length}/{cameras.length}
            </span>
            <span className="text-[11px] text-[#16A34A] uppercase font-bold">{cameras.length} CONFIGURED</span>
          </div>
          <span className="text-[10px] text-[#0284C7] group-hover:underline mt-3 block uppercase tracking-wider font-bold">
            OPEN CAMERA MATRIX →
          </span>
        </Link>

        {/* DEFCON KPI */}
        <div className="p-5 bg-[#FFFFFF]">
          <div className="flex items-center justify-between text-[#475569] text-[10px] uppercase tracking-widest font-bold">
            <span>DEFENSE LEVEL</span>
            <div className="w-2 h-2 rounded-full bg-[#0284C7] animate-pulse" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A]">DEFCON {defconLevel}</span>
            <span className="text-[11px] text-[#0369A1] uppercase font-bold">NODE ARMED</span>
          </div>
          <span className="text-[10px] text-[#64748B] mt-3 block uppercase tracking-wider font-semibold">
            TELEMETRY LINKED
          </span>
        </div>
      </div>

      <section className="border border-[#CBDCEB] bg-[#FFFFFF] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CBDCEB] pb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#475569]">MODEL_HEALTH // P50_P95_LATENCY</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284C7]">
            {monitoring ? `${monitoring.modules.length} MODULES REPORTING` : "WAITING FOR INFERENCE"}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(monitoring?.modules || []).slice(0, 6).map((module) => (
            <div key={`${module.cameraId}-${module.module}`} className="border border-[#E2E8F0] bg-[#F8FBFE] p-3">
              <div className="truncate text-[10px] font-bold uppercase tracking-wider text-[#0F172A]">{module.module}</div>
              <div className="mt-2 flex items-baseline justify-between text-[10px] text-[#64748B]">
                <span>P50 <strong className="text-[#0369A1]">{module.p50Ms} ms</strong></span>
                <span>P95 <strong className="text-[#DC2626]">{module.p95Ms} ms</strong></span>
              </div>
            </div>
          ))}
          {!monitoring?.modules.length && <div className="text-[10px] text-[#64748B]">Start an authenticated camera inference stream to populate runtime metrics.</div>}
        </div>
      </section>

      {/* Main Grid: Video Stream & Telemetry (Left) + Event Log (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#CBDCEB] border border-[#CBDCEB] shadow-sm">
        {/* Center / Left Column: Video Feeds & Telemetry */}
        <div className="lg:col-span-8 bg-[#FFFFFF] p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#0284C7] animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">
                  PRIMARY SURVEILLANCE FEED
                </h2>
              </div>
              <Link href="/live-feed" className="text-xs text-[#0284C7] hover:text-[#0369A1] uppercase tracking-wider font-bold">
                EXPAND MATRIX →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {previewCameras.map((cam) => (
                <CameraVideoFeed
                  key={cam.id}
                  camera={cam}
                  showBoundingBoxes={true}
                  className="aspect-video"
                />
              ))}
              {previewCameras.length === 0 && (
                <div className="sm:col-span-2 p-8 bg-[#F0F6FC] border border-[#CBDCEB] text-center text-xs text-[#475569]">
                  No CCTV cameras configured. Use Live Cameras to preview local camera.
                </div>
              )}
            </div>
          </div>

          {/* Environmental Telemetry & Uplink */}
          <div className="border-t border-[#CBDCEB] pt-6 space-y-6">
            <div>
              <div className="text-[10px] text-[#475569] uppercase tracking-widest border-b border-[#CBDCEB] pb-2 mb-4 font-bold">
                ENVIRONMENTAL_TELEMETRY
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <span className="text-[10px] text-[#64748B] block uppercase font-bold">TEMP</span>
                  <span className="text-xl font-bold text-[#0F172A]">18.4°C</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748B] block uppercase font-bold">HUMIDITY</span>
                  <span className="text-xl font-bold text-[#0F172A]">42%</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748B] block uppercase font-bold">PRESSURE</span>
                  <span className="text-xl font-bold text-[#0F172A]">1012 hPa</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#475569] uppercase tracking-widest border-b border-[#CBDCEB] pb-2 mb-3 font-bold">
                UPLINK_BANDWIDTH
              </div>
              <div className="h-10 w-full flex items-end gap-1">
                {[40, 60, 30, 80, 50, 90, 45, 70, 85, 65, 55, 95].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className={`flex-1 transition-colors ${i === 11 ? "bg-[#0284C7]" : "bg-[#BAE6FD] hover:bg-[#38BDF8]"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Event Log */}
        <div className="lg:col-span-4 bg-[#FFFFFF] flex flex-col border-t lg:border-t-0 lg:border-l border-[#CBDCEB]">
          <div className="p-4 border-b border-[#CBDCEB] bg-[#F0F6FC] flex justify-between items-center">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              EVENT_LOG // LIVE
            </span>
            <Link href="/alerts" className="text-[10px] text-[#0284C7] hover:text-[#0369A1] uppercase tracking-wider font-bold">
              VIEW_ALL ({alerts.length})
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#CBDCEB] max-h-[600px]">
            {alerts.slice(0, 5).map((alert) => {
              const isOpen = alert.status === "open";
              const isCritical = alert.level === "critical";

              return (
                <div
                  key={alert.id}
                  className={`p-4 transition-colors ${isOpen && isCritical ? "bg-[#FEE2E2]/30" : "hover:bg-[#F8FBFE]"}`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <StatusPill type={alert.level} size="sm" />
                    <span className="text-[10px] text-[#64748B] font-bold">
                      {formatTimeIST(alert.timestamp)}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-[#0F172A] truncate mt-1">
                    {alert.eventType}
                  </h4>
                  <p className="text-[11px] text-[#475569] font-sans mt-0.5 line-clamp-2 leading-snug">
                    {alert.notes}
                  </p>
                  <div className="text-[10px] text-[#64748B] mt-2 flex items-center justify-between">
                    <span>Cam: <strong className="text-[#0F172A]">{alert.sourceCameraId}</strong></span>
                    <span>Sec: <strong className="text-[#0F172A]">{alert.sector}</strong></span>
                  </div>

                  {isOpen && (
                    <div className="grid grid-cols-2 gap-2 pt-2.5 mt-2 border-t border-[#CBDCEB]">
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="py-1.5 px-2 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-[10px] uppercase tracking-wider rounded-none transition-colors shadow-sm"
                      >
                        ACKNOWLEDGE
                      </button>
                      <button
                        onClick={() => escalateAlert(alert.id)}
                        className="py-1.5 px-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-[10px] uppercase tracking-wider rounded-none transition-colors shadow-sm"
                      >
                        ESCALATE (QRF)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {alerts.length === 0 && (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No threat alerts reported.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: On-Duty Sentries Rapid Action */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0284C7]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#0F172A]">
              ON-DUTY SENTRIES (1-TAP CALL & HANDOVER)
            </h2>
          </div>
          <Link href="/guard-duty" className="text-xs text-[#0284C7] hover:text-[#0369A1] uppercase tracking-wider font-bold">
            ROSTER & AUDIT →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#CBDCEB] border border-[#CBDCEB] shadow-sm">
          {onDutyGuards.slice(0, 4).map((guard) => {
            const countdown = calculateTimeRemaining(guard.shiftEnd);
            return (
              <div
                key={guard.id}
                className="p-4 bg-[#FFFFFF] flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <StatusPill type={guard.status} size="sm" />
                    <span className="text-[10px] text-[#64748B] font-bold">{guard.callSign}</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#0F172A] mt-2 truncate">
                    {guard.name}
                  </h4>
                  <p className="text-[11px] text-[#0369A1] font-bold mt-0.5">
                    {guard.currentPostId || "Sector Patrol"}
                  </p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{countdown.text}</p>
                </div>

                <a
                  href={`tel:${guard.phone.replace(/\s+/g, "")}`}
                  onClick={() => tacticalSound.playClick()}
                  className="py-2 px-3 bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] border border-[#CBDCEB] text-xs font-bold flex items-center justify-center gap-2 transition-colors rounded-none uppercase tracking-wider"
                >
                  <Phone className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>CALL SENTRY</span>
                </a>
              </div>
            );
          })}
          {onDutyGuards.length === 0 && (
            <div className="sm:col-span-2 lg:col-span-4 p-8 bg-[#FFFFFF] text-center text-xs text-[#64748B]">
              No guard roster records loaded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
