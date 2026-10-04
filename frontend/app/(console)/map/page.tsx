"use client";

import React from "react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { TacticalSectorMap } from "@/components/map/TacticalSectorMap";
import { TacticalCard } from "@/components/shared/TacticalCard";
import { MapPin } from "lucide-react";
import { StatusPill } from "@/components/shared/StatusPill";

export default function MapPage() {
  const { sectors, cameras, alerts, guards, acknowledgeAlert } = useIBVAPStore();

  const totalPosts = sectors.reduce((acc, s) => acc + s.postsCount, 0);
  const staffedPosts = sectors.reduce((acc, s) => acc + s.staffedCount, 0);
  const totalTripwires = sectors.reduce((acc, s) => acc + s.tripwires.length, 0);
  const armedTripwires = sectors.reduce(
    (acc, s) => acc + s.tripwires.filter((t) => t.armed).length,
    0
  );

  return (
    <div className="space-y-6 font-mono">
      {/* Top Header */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              SECTOR GIS RADAR // ZERO-LINE DEMARCATION
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Geospatial coordinate overlay of optical sensors, sentry patrol pins, and tripwires. Use GEOREFERENCE to switch between the Punjab demo area and border-specific reference envelopes. Satellite imagery is a periodic basemap, not a live feed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill type="high" label="1 SECTOR GAP (A4)" size="sm" />
          <StatusPill type="online" label="GIS SYNCHRONIZED" size="sm" />
        </div>
      </div>

      {/* Main Interactive Map */}
      <TacticalSectorMap
        sectors={sectors}
        cameras={cameras}
        alerts={alerts}
        guards={guards}
        onAcknowledgeAlert={acknowledgeAlert}
        className="h-[640px]"
      />

      {/* Sector Intelligence Breakdown Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TacticalCard title="SENTRY POSTS STAFFED" subtitle="HUMAN COVERAGE">
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-[#0F172A]">
              {staffedPosts} of {totalPosts}
            </span>
            <span className="text-xs text-[#DC2626] font-bold">1 Deficit</span>
          </div>
        </TacticalCard>

        <TacticalCard title="TACTICAL CAMERAS" subtitle="FOV COVERAGE">
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-[#0F172A]">
              {cameras.length} Sensors
            </span>
            <span className="text-xs text-[#0284C7] font-bold">6 PTZ • 4 Thermal</span>
          </div>
        </TacticalCard>

        <TacticalCard title="PERIMETER TRIPWIRES" subtitle="SEISMIC & OPTICAL">
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-[#0F172A]">
              {armedTripwires} / {totalTripwires} Armed
            </span>
            <span className="text-xs text-[#16A34A] font-bold">Breakbeams Active</span>
          </div>
        </TacticalCard>

        <TacticalCard title="ACTIVE THREAT ALERTS" subtitle="GIS BLIPS">
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-[#DC2626]">
              {alerts.filter((a) => a.status === "open").length} Active
            </span>
            <span className="text-xs text-[#DC2626] font-bold">Pulsing</span>
          </div>
        </TacticalCard>
      </div>
    </div>
  );
}
