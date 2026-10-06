"use client";

import React from "react";
import { FilterX } from "lucide-react";

export interface MapFilterState {
  severity: string;
  status: string;
  timeRangeHours: string;
  team: string;
  sector: string;
  source: string;
  recordType: string;
}

export const DEFAULT_MAP_FILTERS: MapFilterState = {
  severity: "",
  status: "",
  timeRangeHours: "",
  team: "",
  sector: "",
  source: "",
  recordType: "",
};

interface MapFiltersProps {
  value: MapFilterState;
  onChange: (next: MapFilterState) => void;
  sectors: string[];
  teams: string[];
}

const selectClass =
  "mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-1.5 font-mono text-xs text-[#0F172A]";
const labelClass = "block font-mono text-[9px] font-bold uppercase tracking-widest text-[#475569]";

export const MapFilters: React.FC<MapFiltersProps> = ({ value, onChange, sectors, teams }) => {
  const set = (key: keyof MapFilterState) => (event: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...value, [key]: event.target.value });
  const hasActive = Object.values(value).some((item) => item !== "");

  return (
    <section aria-label="Map filters" className="border border-[#CBDCEB] bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#0F172A]">Filters</span>
        <button
          type="button"
          disabled={!hasActive}
          onClick={() => onChange({ ...DEFAULT_MAP_FILTERS })}
          className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#0284C7] disabled:opacity-40"
        >
          <FilterX className="h-3.5 w-3.5" /> Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <label className={labelClass}>
          Severity
          <select className={selectClass} value={value.severity} onChange={set("severity")}>
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select className={selectClass} value={value.status} onChange={set("status")}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className={labelClass}>
          Time range
          <select className={selectClass} value={value.timeRangeHours} onChange={set("timeRangeHours")}>
            <option value="">All time</option>
            <option value="1">Last hour</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
        </label>
        <label className={labelClass}>
          Team
          <select className={selectClass} value={value.team} onChange={set("team")}>
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Sector
          <select className={selectClass} value={value.sector} onChange={set("sector")}>
            <option value="">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Source
          <select className={selectClass} value={value.source} onChange={set("source")}>
            <option value="">All sources</option>
            <option value="ai_frame">AI / camera</option>
            <option value="community_report">Community</option>
            <option value="demo">Demo</option>
            <option value="uploaded">Uploaded</option>
          </select>
        </label>
        <label className={labelClass}>
          Record type
          <select className={selectClass} value={value.recordType} onChange={set("recordType")}>
            <option value="">All types</option>
            <option value="alert">Alerts</option>
            <option value="camera">Cameras</option>
            <option value="community">Communities</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="resource">Resources</option>
            <option value="road">Roads</option>
          </select>
        </label>
      </div>
    </section>
  );
};
