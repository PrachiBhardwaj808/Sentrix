"use client";

import React from "react";
import { Compass, Copy, Fullscreen, LocateFixed, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

export type MeasureMode = "distance" | "area" | null;

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen: () => void;
  onLocate: () => void;
  onCopyCenter: () => void;
  onMeasureChange: (mode: MeasureMode) => void;
  measureMode: MeasureMode;
  locateError: string;
  cursor: { lat: number; lng: number } | null;
  centerLabel: string;
}

const buttonClass =
  "flex h-9 w-9 items-center justify-center border border-[#CBDCEB] bg-white text-[#0F172A] shadow-sm transition-colors hover:bg-[#F0F9FF] focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-40";

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
  onLocate,
  onCopyCenter,
  onMeasureChange,
  measureMode,
  locateError,
  cursor,
  centerLabel,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Map view controls">
      <button type="button" className={buttonClass} onClick={onZoomIn} aria-label="Zoom in">
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" className={buttonClass} onClick={onZoomOut} aria-label="Zoom out">
        <Minus className="h-4 w-4" />
      </button>
      <button type="button" className={buttonClass} onClick={onReset} aria-label="Reset view">
        <RotateCcw className="h-4 w-4" />
      </button>
      <button type="button" className={buttonClass} onClick={onFullscreen} aria-label="Toggle full screen">
        <Fullscreen className="h-4 w-4" />
      </button>
      <button type="button" className={buttonClass} onClick={onLocate} aria-label="Use my location">
        <LocateFixed className="h-4 w-4" />
      </button>
      <button type="button" className={buttonClass} onClick={onCopyCenter} aria-label="Copy map center coordinates">
        <Copy className="h-4 w-4" />
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Measurement controls">
      <button
        type="button"
        aria-pressed={measureMode === "distance"}
        onClick={() => onMeasureChange(measureMode === "distance" ? null : "distance")}
        className={cn(
          "flex h-9 items-center gap-1 border px-2 font-mono text-[10px] font-bold uppercase shadow-sm",
          measureMode === "distance"
            ? "border-[#0284C7] bg-[#0284C7] text-white"
            : "border-[#CBDCEB] bg-white text-[#475569] hover:bg-[#F0F9FF]"
        )}
      >
        <Ruler className="h-3.5 w-3.5" /> Distance
      </button>
      <button
        type="button"
        aria-pressed={measureMode === "area"}
        onClick={() => onMeasureChange(measureMode === "area" ? null : "area")}
        className={cn(
          "flex h-9 items-center gap-1 border px-2 font-mono text-[10px] font-bold uppercase shadow-sm",
          measureMode === "area"
            ? "border-[#0284C7] bg-[#0284C7] text-white"
            : "border-[#CBDCEB] bg-white text-[#475569] hover:bg-[#F0F9FF]"
        )}
      >
        <Compass className="h-3.5 w-3.5" /> Area
      </button>
    </div>
    <div className="border border-[#CBDCEB] bg-white/95 px-2 py-1.5 font-mono text-[10px] text-[#475569] shadow-sm" aria-live="polite">
      <div className="font-bold uppercase tracking-widest text-[#0284C7]">Cursor</div>
      <div>{cursor ? `${cursor.lat.toFixed(5)}, ${cursor.lng.toFixed(5)}` : "Move over map"}</div>
      <div className="mt-1 border-t border-[#E2E8F0] pt-1">Center {centerLabel}</div>
      {measureMode && <div className="mt-1 text-[#0284C7]">Click map points to measure {measureMode}.</div>}
      {locateError && <div className="mt-1 text-[#B91C1C]">{locateError}</div>}
    </div>
  </div>
);
