"use client";

import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  Eye,
  Flame,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { Camera } from "@/lib/types";
import { cn, formatTimeIST } from "@/lib/utils";
import { PTZControls } from "./PTZControls";
import { tacticalSound } from "@/lib/sound";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { backendApi } from "@/lib/api/client";

interface CameraVideoFeedProps {
  camera: Camera;
  mode?: "optical" | "thermal" | "night_vision";
  showBoundingBoxes?: boolean;
  showPTZ?: boolean;
  interactive?: boolean;
  onFlagIncident?: (camera: Camera) => void;
  className?: string;
}

export const CameraVideoFeed: React.FC<CameraVideoFeedProps> = ({
  camera,
  mode: initialMode,
  showPTZ: initialShowPTZ = false,
  onFlagIncident,
  className,
}) => {
  const { addAlert, updateCameraDetection } = useIBVAPStore();
  const [viewMode, setViewMode] = useState<"optical" | "thermal" | "night_vision">(
    initialMode || (camera.type === "thermal" ? "thermal" : "optical")
  );
  const [showPTZ, setShowPTZ] = useState(initialShowPTZ);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timecode, setTimecode] = useState("");
  const [utcTime, setUtcTime] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [streamUrl, setStreamUrl] = useState(camera.hlsUrl || "");
  const [streamActive, setStreamActive] = useState(false);

  useEffect(() => {
    const adaptUrl = (url: string) => {
      let finalUrl = url;
      if (finalUrl && !finalUrl.includes("cookieCheck")) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + "cookieCheck=1";
      }
      if (typeof window !== "undefined" && finalUrl) {
        return finalUrl.replace(/^https?:\/\/[^/]+:8888\//, "/relay-media/");
      }
      return finalUrl;
    };
    if (camera.hlsUrl) {
      setStreamUrl(adaptUrl(camera.hlsUrl));
    } else if (camera.rtspUrl || camera.ipAddress) {
      void backendApi
        .getCameraStream(camera.id)
        .then((info) => {
          if (info.hlsUrl) setStreamUrl(adaptUrl(info.hlsUrl));
        })
        .catch(() => {});
    }
  }, [camera.hlsUrl, camera.id, camera.ipAddress, camera.rtspUrl]);

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 0 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamActive(true);
        void videoRef.current?.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, () => {
        setStreamActive(false);
      });
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = streamUrl;
      setStreamActive(true);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  useEffect(() => {
    const update = () => {
      setTimecode(formatTimeIST());
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + " UTC");
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleManualAlert = () => {
    tacticalSound.playAlert();
    addAlert({
      level: "critical",
      sourceCameraId: camera.id,
      sourceCameraName: camera.name,
      eventType: "Manual Operator Incident Flag",
      confidence: 0,
      coordinates: camera.coordinates,
      objectClass: "Unknown",
      evidenceUrl: "",
      sector: camera.sector,
      notes: `Operator flagged an incident from ${camera.name}. Evidence capture is not attached yet.`,
    });
    onFlagIncident?.(camera);
  };

  const isSignalLost = camera.status === "signal_lost";
  const streamConfigured = Boolean(camera.rtspUrl || camera.ipAddress || streamUrl);

  return (
    <div
      className={cn(
        "relative bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden flex flex-col select-none font-mono shadow-sm",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        className
      )}
    >
      {/* Top HUD Overlay */}
      <div className="absolute top-0 inset-x-0 bg-[#0F172A]/90 border-b border-[#38BDF8]/40 p-2.5 z-20 flex items-center justify-between text-[11px] font-mono text-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-2 h-2 rounded-full shrink-0", isSignalLost ? "bg-[#DC2626]" : "bg-[#0284C7] animate-pulse")} />
          <span className="font-bold tracking-widest text-white truncate max-w-[180px] sm:max-w-xs uppercase">
            {camera.id} // {camera.sector}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#1E293B] border border-[#38BDF8]/30 text-[10px] text-[#BAE6FD] uppercase rounded-none">
            {streamActive ? "LIVE RELAY" : viewMode.replace("_", " ")}
          </span>
          {camera.fps > 0 && <span className="font-semibold text-[#BAE6FD] text-[10px] hidden sm:inline">{camera.fps} FPS</span>}
          <span className="text-[#38BDF8] font-bold">{utcTime || timecode}</span>
        </div>
      </div>

      {/* Video Content Canvas */}
      <div className="relative flex-1 min-h-[220px] bg-[#0B1320] flex items-center justify-center overflow-hidden">
        {streamActive && !isSignalLost && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}

        {/* Decorative Target Reticle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-[#38BDF8]/30 pointer-events-none flex items-center justify-center z-10">
          <div className="w-1 h-3 bg-[#38BDF8]/60 absolute top-0" />
          <div className="w-1 h-3 bg-[#38BDF8]/60 absolute bottom-0" />
          <div className="w-3 h-1 bg-[#38BDF8]/60 absolute left-0" />
          <div className="w-3 h-1 bg-[#38BDF8]/60 absolute right-0" />
          <div className="w-1 h-1 bg-[#38BDF8]" />
        </div>

        {/* GPS Coordinate Watermark Overlay */}
        <div className="absolute bottom-3 left-3 z-10 text-[10px] text-[#BAE6FD] pointer-events-none">
          <div>LAT: 26.8467° N</div>
          <div>LON: 80.9462° E</div>
        </div>

        {!streamActive && (
          <div className="relative z-10 max-w-sm p-6 text-center font-mono">
            {isSignalLost ? (
              <WifiOff className="w-8 h-8 mx-auto mb-3 text-[#DC2626]" />
            ) : (
              <Radio className="w-8 h-8 mx-auto mb-3 text-[#38BDF8] opacity-80" />
            )}
            <h4 className={cn("text-xs font-bold uppercase tracking-widest", isSignalLost ? "text-[#FCA5A5]" : "text-white")}>
              {isSignalLost ? "SIGNAL LOST // LINK_DROP" : "STREAM STANDBY"}
            </h4>
            <p className="text-[11px] text-[#94A3B8] mt-2 leading-relaxed font-sans">
              {isSignalLost
                ? "The configured CCTV source is currently unreachable."
                : streamConfigured
                ? "RTSP source registered. Connecting low-latency HLS relay to browser..."
                : "No stream URL configured for this node."}
            </p>
            {streamConfigured && <p className="text-[10px] text-[#38BDF8] mt-2 break-all font-mono">SOURCE: {camera.ipAddress || camera.rtspUrl}</p>}
            {isSignalLost && (
              <div className="mt-3 inline-flex items-center gap-2 text-[10px] text-white bg-[#DC2626] px-3 py-1 border border-[#FCA5A5] rounded-none">
                <RefreshCw className="w-3 h-3 text-white animate-spin" />
                <span>AWAITING LINK RECOVERY</span>
              </div>
            )}
          </div>
        )}

        {showPTZ && !isSignalLost && (
          <div className="absolute bottom-3 right-3 z-30 max-w-xs">
            <PTZControls
              cameraId={camera.id}
              cameraName={camera.name}
              onMove={(pan, tilt) => updateCameraDetection(camera.id, { pan, tilt })}
              onZoom={(zoom) => updateCameraDetection(camera.id, { zoom })}
            />
          </div>
        )}
      </div>

      {/* Bottom Controls Toolbar */}
      <div className="bg-[#F0F6FC] border-t border-[#CBDCEB] px-3 py-2 flex items-center justify-between gap-2 z-20 shrink-0 font-mono text-xs text-[#0F172A]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { tacticalSound.playClick(); setViewMode("optical"); }}
            title="Optical mode"
            className={cn("px-2 py-1 rounded-none border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors", viewMode === "optical" ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]")}
          >
            <Eye className="w-3 h-3" /><span className="hidden sm:inline">OPT</span>
          </button>
          <button
            onClick={() => { tacticalSound.playClick(); setViewMode("thermal"); }}
            title="Thermal mode"
            className={cn("px-2 py-1 rounded-none border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors", viewMode === "thermal" ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]")}
          >
            <Flame className="w-3 h-3" /><span className="hidden sm:inline">THERM</span>
          </button>
          <button
            onClick={() => { tacticalSound.playClick(); setViewMode("night_vision"); }}
            title="Night vision mode"
            className={cn("px-2 py-1 rounded-none border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors", viewMode === "night_vision" ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]")}
          >
            <Moon className="w-3 h-3" /><span className="hidden sm:inline">NV</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {camera.type === "ptz" && !isSignalLost && (
            <button
              onClick={() => { tacticalSound.playClick(); setShowPTZ(!showPTZ); }}
              className={cn("px-2 py-1 rounded-none border text-[10px] font-bold uppercase tracking-wider transition-colors", showPTZ ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]")}
            >
              <span>PTZ</span>
            </button>
          )}
          <button
            onClick={handleManualAlert}
            title="Flag an incident"
            className="px-2.5 py-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white border border-[#DC2626] rounded-none text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider shadow-sm transition-colors"
          >
            <AlertTriangle className="w-3 h-3" /><span>FLAG INCIDENT</span>
          </button>
          <button
            onClick={() => { tacticalSound.playClick(); setIsFullscreen(!isFullscreen); }}
            title="Toggle fullscreen"
            className="p-1 text-[#475569] hover:text-[#0F172A] hover:bg-[#E0F2FE] rounded-none border border-[#CBDCEB] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
