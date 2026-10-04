"use client";

import React, { useState } from "react";
import {
  Grid2X2,
  Grid3X3,
  Maximize,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { CameraVideoFeed } from "@/components/video/CameraVideoFeed";
import { LocalCameraFeed } from "@/components/video/LocalCameraFeed";
import { StatusPill } from "@/components/shared/StatusPill";
import { tacticalSound } from "@/lib/sound";

export default function LiveFeedPage() {
  const { cameras, sectors } = useIBVAPStore();

  const [layout, setLayout] = useState<"2x2" | "3x2" | "focus">("2x2");
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [selectedCameraType, setSelectedCameraType] = useState<string>("ALL");
  const [focusCameraId, setFocusCameraId] = useState<string>(cameras[0]?.id || "");

  const handleLayoutChange = (newLayout: "2x2" | "3x2" | "focus") => {
    tacticalSound.playClick();
    setLayout(newLayout);
  };

  const filteredCameras = cameras.filter((cam) => {
    const matchSector = selectedSector === "ALL" || cam.sector.includes(selectedSector);
    const matchType = selectedCameraType === "ALL" || cam.type === selectedCameraType;
    return matchSector && matchType;
  });

  const displayedCameras =
    layout === "2x2"
      ? filteredCameras.slice(0, 4)
      : layout === "3x2"
      ? filteredCameras.slice(0, 6)
      : filteredCameras;

  const focusCamera = cameras.find((c) => c.id === focusCameraId) || cameras[0];
  const onlineCameraCount = cameras.filter((camera) => camera.status === "online").length;
  const signalLostCameraCount = cameras.filter((camera) => camera.status === "signal_lost").length;

  return (
    <div className="space-y-6 font-mono">
      {/* Real Local Camera / Screen Preview */}
      <LocalCameraFeed className="w-full" />

      {/* Top Matrix Controls Toolbar */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs shadow-sm">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest">SECTOR:</span>
            <select
              value={selectedSector}
              onChange={(e) => {
                tacticalSound.playClick();
                setSelectedSector(e.target.value);
              }}
              className="bg-[#F0F6FC] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-xs text-[#0F172A] focus:border-[#0284C7] font-mono font-bold"
            >
              <option value="ALL">ALL SECTORS ({cameras.length} CAMERAS)</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.code}: {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest">OPTICS:</span>
            <select
              value={selectedCameraType}
              onChange={(e) => {
                tacticalSound.playClick();
                setSelectedCameraType(e.target.value);
              }}
              className="bg-[#F0F6FC] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-xs text-[#0F172A] focus:border-[#0284C7] font-mono font-bold"
            >
              <option value="ALL">ALL SENSOR TYPES</option>
              <option value="ptz">PTZ OPTICAL</option>
              <option value="thermal">THERMAL INFRARED</option>
              <option value="fixed">FIXED OPTICAL</option>
            </select>
          </div>
        </div>

        {/* Layout Mode Switchers */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest mr-1 hidden sm:inline">
            LAYOUT:
          </span>

          <button
            onClick={() => handleLayoutChange("2x2")}
            className={`px-3 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              layout === "2x2"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            <Grid2X2 className="w-3.5 h-3.5" />
            <span>2x2</span>
          </button>

          <button
            onClick={() => handleLayoutChange("3x2")}
            className={`px-3 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              layout === "3x2"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>3x2</span>
          </button>

          <button
            onClick={() => handleLayoutChange("focus")}
            className={`px-3 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              layout === "focus"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            <Maximize className="w-3.5 h-3.5" />
            <span>FOCUS</span>
          </button>
        </div>
      </div>

      {/* Main Video Matrix */}
      {cameras.length > 0 && (layout === "focus" ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            {focusCamera && (
              <CameraVideoFeed
                camera={focusCamera}
                showBoundingBoxes={true}
                showPTZ={focusCamera.type === "ptz"}
                className="h-[580px]"
              />
            )}
          </div>

          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            <span className="text-[10px] text-[#475569] uppercase tracking-widest font-bold block mb-2">
              STREAM SELECTOR ({filteredCameras.length})
            </span>
            {filteredCameras.map((cam) => {
              const isSelected = cam.id === focusCamera?.id;
              return (
                <div
                  key={cam.id}
                  onClick={() => {
                    tacticalSound.playClick();
                    setFocusCameraId(cam.id);
                  }}
                  className={`p-3 border rounded-none cursor-pointer transition-colors ${
                    isSelected
                      ? "border-[#0284C7] bg-[#E0F2FE]"
                      : "border-[#CBDCEB] bg-[#FFFFFF] hover:bg-[#F8FBFE]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-[#0F172A] truncate max-w-[140px]">
                      {cam.id}
                    </span>
                    <StatusPill type={cam.status} size="sm" />
                  </div>
                  <p className="text-[10px] text-[#475569] truncate">{cam.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            layout === "2x2"
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {displayedCameras.map((cam) => (
            <CameraVideoFeed
              key={cam.id}
              camera={cam}
              showBoundingBoxes={true}
              className="aspect-video"
            />
          ))}
        </div>
      ))}

      {cameras.length === 0 && (
        <div className="p-8 bg-[#FFFFFF] border border-[#CBDCEB] text-center text-xs text-[#475569] shadow-sm">
          No CCTV cameras configured. Use the local camera above to test real-time AI inference.
        </div>
      )}

      {/* Footer Telemetry */}
      <div className="p-3 bg-[#FFFFFF] border border-[#CBDCEB] flex flex-wrap items-center justify-between text-[11px] text-[#475569] shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-[#0F172A] font-bold">{onlineCameraCount}/{cameras.length} CONFIGURED CAMERAS ONLINE</span>
          {signalLostCameraCount > 0 && <><span>•</span><span className="text-[#DC2626] font-bold">{signalLostCameraCount} SIGNAL LOST</span></>}
        </div>
        <div>
          <span className="text-[#64748B]">AI OVERLAYS REQUIRE ACTIVE VIDEO SOURCE</span>
        </div>
      </div>
    </div>
  );
}
