"use client";

import React, { useState } from "react";
import { Bot, CheckCircle2, Play } from "lucide-react";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { evidenceSource } from "@/lib/evidence";

export const DemoIncidentButton: React.FC = () => {
  const { cameras, watchlistEntries, addAlert } = useIBVAPStore();
  const [created, setCreated] = useState(false);

  const runDemoIncident = () => {
    const camera = cameras[0];
    const plateEntry = watchlistEntries.find((entry) => entry.type === "plate" && entry.status !== "Authorized");
    const plate = plateEntry?.value || "DL01AB1234";
    addAlert({
      level: plateEntry?.status === "Blacklisted" ? "critical" : "high",
      sourceCameraId: camera?.id || "DEMO-CAMERA",
      sourceCameraName: camera?.name || "Demonstration Camera",
      eventType: `ANPR WATCHLIST MATCH // ${plateEntry?.label || "Demo transport alert"}`,
      confidence: 96,
      coordinates: camera?.coordinates || { lat: 31.65, lng: 74.88 },
      objectClass: "Vehicle",
      evidenceUrl: evidenceSource(),
      sector: camera?.sector || "Sector Alpha",
      notes: `Scripted demo incident. Plate ${plate} matched the ${plateEntry?.status || "Blacklisted"} watchlist rule. Assign a guard, acknowledge, and export the report.`,
      plateNumber: plate,
      watchlistEntryId: plateEntry?.id,
      evidenceSource: "demo",
    });
    setCreated(true);
    window.setTimeout(() => setCreated(false), 5000);
  };

  return created ? (
    <div className="flex items-center gap-2 border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[10px] font-bold uppercase text-[#166534]">
      <CheckCircle2 className="h-3.5 w-3.5" /> DEMO INCIDENT CREATED // OPEN EVIDENCE VAULT
    </div>
  ) : (
    <TacticalButton variant="secondary" size="sm" onClick={runDemoIncident} icon={<Play className="h-3.5 w-3.5" />}>
      <span className="hidden sm:inline">RUN DEMO INCIDENT</span>
      <span className="sm:hidden">DEMO</span>
    </TacticalButton>
  );
};

export const DemoModeBadge: React.FC = () => (
  <div className="flex items-center gap-1.5 border border-[#BAE6FD] bg-[#F0F9FF] px-2 py-1 text-[9px] font-bold uppercase text-[#0369A1]">
    <Bot className="h-3.5 w-3.5" /> PRESENTATION-SAFE DEMO MODE
  </div>
);
