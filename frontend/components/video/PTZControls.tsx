import React, { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";

interface PTZControlsProps {
  cameraId: string;
  cameraName?: string;
  onMove?: (pan: number, tilt: number) => void;
  onZoom?: (zoom: number) => void;
  className?: string;
}

export const PTZControls: React.FC<PTZControlsProps> = ({
  cameraId,
  onMove,
  onZoom,
  className,
}) => {
  const [pan, setPan] = useState(45);
  const [tilt, setTilt] = useState(-10);
  const [zoom, setZoom] = useState(2.0);

  const handlePanTilt = (deltaPan: number, deltaTilt: number) => {
    tacticalSound.playClick();
    const nextPan = Math.max(-180, Math.min(180, pan + deltaPan));
    const nextTilt = Math.max(-90, Math.min(90, tilt + deltaTilt));
    setPan(nextPan);
    setTilt(nextTilt);
    if (onMove) onMove(nextPan, nextTilt);
  };

  const handleZoomChange = (deltaZoom: number) => {
    tacticalSound.playClick();
    const nextZoom = Math.max(1.0, Math.min(10.0, Number((zoom + deltaZoom).toFixed(1))));
    setZoom(nextZoom);
    if (onZoom) onZoom(nextZoom);
  };

  const setPreset = (p: number, t: number, z: number) => {
    tacticalSound.playClick();
    setPan(p);
    setTilt(t);
    setZoom(z);
    if (onMove) onMove(p, t);
    if (onZoom) onZoom(z);
  };

  return (
    <div
      className={cn(
        "bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-3 font-mono select-none shadow-md text-[#0F172A]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2 mb-3">
        <div className="flex items-center gap-1.5 text-[#0284C7] text-xs font-bold uppercase tracking-wider">
          <Crosshair className="w-3.5 h-3.5" />
          <span>PTZ_CONTROLLER</span>
        </div>
        <span className="text-[10px] text-[#64748B]">ID: {cameraId}</span>
      </div>

      {/* D-Pad & Zoom Column */}
      <div className="flex items-center justify-between gap-4">
        {/* Joystick D-Pad */}
        <div className="relative w-28 h-28 bg-[#F0F6FC] border border-[#CBDCEB] flex items-center justify-center p-2">
          <button
            onClick={() => handlePanTilt(0, 5)}
            className="absolute top-1 p-1 text-[#475569] hover:text-[#0284C7] hover:bg-[#E0F2FE] transition-colors"
            title="Tilt Up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePanTilt(0, -5)}
            className="absolute bottom-1 p-1 text-[#475569] hover:text-[#0284C7] hover:bg-[#E0F2FE] transition-colors"
            title="Tilt Down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePanTilt(-5, 0)}
            className="absolute left-1 p-1 text-[#475569] hover:text-[#0284C7] hover:bg-[#E0F2FE] transition-colors"
            title="Pan Left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePanTilt(5, 0)}
            className="absolute right-1 p-1 text-[#475569] hover:text-[#0284C7] hover:bg-[#E0F2FE] transition-colors"
            title="Pan Right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Center Coordinates Readout */}
          <div className="text-center">
            <div className="text-[9px] text-[#0284C7] font-bold">P: {pan}°</div>
            <div className="text-[9px] text-[#0284C7] font-bold">T: {tilt}°</div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[10px] text-[#64748B] font-bold uppercase">ZOOM</span>
          <button
            onClick={() => handleZoomChange(0.5)}
            className="p-1.5 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0284C7] border border-[#CBDCEB] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-[#0F172A]">{zoom.toFixed(1)}x</span>
          <button
            onClick={() => handleZoomChange(-0.5)}
            className="p-1.5 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0284C7] border border-[#CBDCEB] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="mt-3 pt-2 border-t border-[#CBDCEB] flex items-center justify-between text-[10px]">
        <span className="text-[#64748B] uppercase">PRESETS:</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreset(0, 0, 1.0)}
            className="px-1.5 py-0.5 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] font-bold"
          >
            RESET
          </button>
          <button
            onClick={() => setPreset(90, -15, 3.0)}
            className="px-1.5 py-0.5 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] font-bold"
          >
            P1 (GATE)
          </button>
          <button
            onClick={() => setPreset(-60, 10, 4.5)}
            className="px-1.5 py-0.5 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] font-bold"
          >
            P2 (HILL)
          </button>
        </div>
      </div>
    </div>
  );
};
