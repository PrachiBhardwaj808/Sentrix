"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  FileVideo,
  Link2,
  Monitor,
  RefreshCw,
  ShieldAlert,
  Upload,
  Video,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { backendApi, FrameDetection, FrameInferenceModule } from "@/lib/api/client";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

interface LocalCameraFeedProps {
  className?: string;
}

type CameraState = "idle" | "starting" | "live" | "error";
type StreamSource = "camera" | "screen";
type InferenceState = "idle" | "analyzing" | "ready" | "error";
type SourceMode = "camera" | "file" | "network";

interface TimelineEvent {
  id: string;
  label: string;
  source: string;
  confidence: number;
  capturedAt: string;
  videoTime: number | null;
  detail?: string;
}

const INFERENCE_MODULES = ["person_tracking", "face_detection", "anpr"];

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));

const videoClock = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "LIVE";
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60).toString().padStart(2, "0")}:${(wholeSeconds % 60).toString().padStart(2, "0")}`;
};

const sourceButtonClass = (active: boolean) =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-none border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors font-mono",
    active
      ? "border-[#0284C7] bg-[#0284C7] text-white shadow-sm"
      : "border-[#CBDCEB] bg-[#FFFFFF] text-[#475569] hover:border-[#0284C7] hover:text-[#0F172A]"
  );

export const LocalCameraFeed: React.FC<LocalCameraFeedProps> = ({ className }) => {
  const { cameras, watchlistEntries, addAlert, backendStatus } = useIBVAPStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("camera");
  const [activeSourceUrl, setActiveSourceUrl] = useState("");
  const [networkUrl, setNetworkUrl] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [fileName, setFileName] = useState("");
  const [sourceLabel, setSourceLabel] = useState("LOCAL DEVICE CAMERA");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [inferenceState, setInferenceState] = useState<InferenceState>("idle");
  const [inferenceError, setInferenceError] = useState("");
  const [modelName, setModelName] = useState("");
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [pipelineMetrics, setPipelineMetrics] = useState<{
    inferenceFps: number;
    queueDelayMs: number;
    droppedFrames: number;
  } | null>(null);
  const [modules, setModules] = useState<FrameInferenceModule[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const timelineFingerprintRef = useRef({ value: "", timestamp: 0 });
  const reportedMatchesRef = useRef<Set<string>>(new Set());
  const reportedFaceReviewRef = useRef<Set<string>>(new Set());
  const lastAnalyticsAtRef = useRef(0);
  const [analysisCameraId, setAnalysisCameraId] = useState("");
  const selectedAnalyticsCameraId = analysisCameraId || cameras[0]?.id || "";
  const selectedAnalyticsCamera = cameras.find((camera) => camera.id === selectedAnalyticsCameraId);

  const resetAnalysis = useCallback(() => {
    setDetections([]);
    setInferenceState("idle");
    setInferenceError("");
    setModules([]);
    setModelName("");
    setInferenceMs(null);
    setPipelineMetrics(null);
  }, []);

  const resetTimeline = useCallback(() => {
    setTimelineEvents([]);
    timelineFingerprintRef.current = { value: "", timestamp: 0 };
    reportedMatchesRef.current.clear();
    reportedFaceReviewRef.current.clear();
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clearVideoSource = useCallback(() => {
    destroyHls();
    stopStream();
    releaseObjectUrl();
    setActiveSource(null);
    setActiveSourceUrl("");
    setFileName("");
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    resetAnalysis();
    resetTimeline();
  }, [destroyHls, releaseObjectUrl, resetAnalysis, resetTimeline, stopStream]);

  const attachStream = useCallback((stream: MediaStream, source: StreamSource) => {
    streamRef.current = stream;
    setActiveSource(source);
    if (videoRef.current) videoRef.current.srcObject = stream;
    setCameraState("live");

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        if (streamRef.current !== stream) return;
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActiveSource(null);
        setCameraState("idle");
        setError(source === "screen" ? "Screen sharing ended." : "The camera stream ended.");
      };
    }
  }, []);

  const listDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const available = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "videoinput"
    );
    setDevices(available);
    setSelectedDeviceId((current) => current || available[0]?.deviceId || "");
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not expose a local camera.");
        setCameraState("error");
        return;
      }

      setSourceMode("camera");
      setSourceLabel("LOCAL DEVICE CAMERA");
      setCameraState("starting");
      setError("");
      clearVideoSource();
      setActiveSource("camera");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
          audio: false,
        });
        attachStream(stream, "camera");
        await listDevices();
      } catch (cameraError) {
        const errorName = cameraError instanceof DOMException ? cameraError.name : "";
        setError(
          errorName === "NotAllowedError"
            ? "Camera permission was denied. Allow access in the browser and try again."
            : errorName === "NotFoundError"
            ? "No camera device is available on this machine."
            : "The local camera could not be opened. Check that it is not in use by another app."
        );
        setActiveSource(null);
        setCameraState("error");
      }
    },
    [attachStream, clearVideoSource, listDevices]
  );

  const chooseSourceMode = useCallback(
    (mode: SourceMode) => {
      if (mode === sourceMode) return;
      clearVideoSource();
      setSourceMode(mode);
      setSourceLabel(mode === "file" ? "VIDEO FILE" : "NETWORK CCTV");
      setCameraState("idle");
      setError("");
    },
    [clearVideoSource, sourceMode]
  );

  const loadVideoFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      clearVideoSource();
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setSourceMode("file");
      setSourceLabel(file.name.toUpperCase());
      setFileName(file.name);
      setActiveSourceUrl(objectUrl);
      setCameraState("starting");
      setError("");
    },
    [clearVideoSource]
  );

  const connectCameraRelay = useCallback(async (targetId?: string) => {
    const id = targetId || selectedCameraId || cameras[0]?.id;
    if (!id) {
      setError("No camera node is available to connect.");
      setCameraState("error");
      return;
    }
    const cam = cameras.find((c) => c.id === id);
    clearVideoSource();
    setSourceMode("network");
    setSourceLabel(cam ? `${cam.name} // HLS RELAY`.toUpperCase() : `CCTV ${id}`.toUpperCase());
    setCameraState("starting");
    setError("");

    try {
      const stream = await backendApi.getCameraStream(id);
      let hls = stream.hlsUrl;
      if (hls && !hls.includes("cookieCheck")) {
        hls += (hls.includes("?") ? "&" : "?") + "cookieCheck=1";
      }
      if (typeof window !== "undefined" && hls) {
        hls = hls.replace(/^https?:\/\/[^/]+:8888\//, "/relay-media/");
      }
      setActiveSourceUrl(hls);
    } catch (err: unknown) {
      setCameraState("error");
      const message = err instanceof Error ? err.message : "Could not connect to camera relay. Verify camera IP, credentials, and that MediaMTX is running.";
      setError(message);
    }
  }, [cameras, clearVideoSource, selectedCameraId]);

  const connectNetwork = useCallback(() => {
    const entered = networkUrl.trim();
    if (!entered) {
      setError("Enter an IP address (e.g. 192.168.1.250), Camera ID, or HLS stream URL.");
      setCameraState("error");
      return;
    }

    // 1. Check if the user entered an IP address or URL/ID matching a registered camera
    // Handles: "192.168.1.250", "http://192.168.1.250/", "192.168.1.250:554", "CAM-ALPHA-01",
    // or an RTSP URL like "rtsp://...192.168.1.250..."
    const ipMatch = entered.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    const extractedIp = ipMatch ? ipMatch[0] : "";
    const cleanId = entered.trim().toUpperCase();

    const isCurrentHostOrLocal =
      (typeof window !== "undefined" && window.location.hostname && (entered.includes(window.location.hostname) || extractedIp === window.location.hostname)) ||
      entered.includes("localhost") ||
      entered.includes("127.0.0.1");

    const matchedCam =
      cameras.find((c) => {
        if (c.id.toUpperCase() === cleanId) return true;
        if (c.ipAddress && extractedIp && c.ipAddress === extractedIp) return true;
        if (c.ipAddress && entered.includes(c.ipAddress)) return true;
        return false;
      }) || (isCurrentHostOrLocal ? cameras.find((c) => c.ipAddress) || cameras[0] : null);

    if (matchedCam) {
      setSelectedCameraId(matchedCam.id);
      void connectCameraRelay(matchedCam.id);
      return;
    }

    // 2. If it is an RTSP URL that didn't match a known camera
    if (/^rtsps?:\/\//i.test(entered)) {
      setError(
        "RTSP streams cannot play directly in web browsers. Please register this camera with its IP in the system so MediaMTX can relay it, or select CAM-ALPHA-01 above."
      );
      setCameraState("error");
      return;
    }

    // 3. If an IP or web URL was entered without .m3u8 extension and not in registered cameras
    if (extractedIp && !entered.includes(".m3u8")) {
      setError(
        `IP ${extractedIp} is not registered. Note that http://${extractedIp}/ is the camera's web admin console, not a video stream. Registered camera: CAM-ALPHA-01 (${cameras[0]?.ipAddress || "192.168.1.250"}).`
      );
      setCameraState("error");
      return;
    }

    // 4. Otherwise treat as direct HLS (.m3u8) URL
    const normalizedUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(entered)
      ? entered
      : `http://${entered}`;
    try {
      const parsed = new URL(normalizedUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
      clearVideoSource();
      setSourceMode("network");
      setSourceLabel(`STREAM ${parsed.hostname}`.toUpperCase());
      setActiveSourceUrl(parsed.toString());
      setCameraState("starting");
      setError("");
    } catch {
      setError("Enter a valid IP address (e.g. 192.168.1.250) or HLS stream URL (e.g. http://127.0.0.1:8888/CAM-ALPHA-01/index.m3u8)");
      setCameraState("error");
    }
  }, [cameras, clearVideoSource, connectCameraRelay, networkUrl]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser does not support laptop screen sharing.");
      setCameraState("error");
      return;
    }

    clearVideoSource();
    setSourceMode("camera");
    setSourceLabel("SCREEN TEST SOURCE");
    setCameraState("starting");
    setActiveSource("screen");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      attachStream(stream, "screen");
    } catch (screenError) {
      const errorName = screenError instanceof DOMException ? screenError.name : "";
      setError(
        errorName === "NotAllowedError"
          ? "Screen sharing was cancelled or denied. Choose a window or tab and try again."
          : "The laptop screen could not be shared."
      );
      setActiveSource(null);
      setCameraState("error");
    }
  }, [attachStream, clearVideoSource]);

  useEffect(() => {
    void listDevices();
    return () => {
      stopStream();
      releaseObjectUrl();
    };
  }, [listDevices, releaseObjectUrl, stopStream]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraState]);

  useEffect(() => {
    if (!activeSourceUrl || !videoRef.current) return;

    const isHls = activeSourceUrl.includes(".m3u8") || activeSourceUrl.includes(":8888");
    if (isHls) {
      destroyHls();
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 0,
        });
        hlsRef.current = hls;
        hls.loadSource(activeSourceUrl);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setError("");
          setCameraState("live");
          void videoRef.current?.play().catch(() => undefined);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setError("Camera relay network error: camera or MediaMTX relay may be offline.");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setError("Media decoding error on camera stream.");
                hls.recoverMediaError();
                break;
              default:
                destroyHls();
                setCameraState("error");
                setError("HLS stream playback failed. Check camera connection and relay.");
                break;
            }
          }
        });
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = activeSourceUrl;
      }
    } else {
      destroyHls();
      videoRef.current.src = activeSourceUrl;
    }

    return () => {
      destroyHls();
    };
  }, [activeSourceUrl, destroyHls]);

  useEffect(() => {
    if (cameraState !== "live") {
      resetAnalysis();
      return;
    }

    let cancelled = false;
    let requestRunning = false;
    let nextRun: number | null = null;

    const applyResult = (
      result: Awaited<ReturnType<typeof backendApi.analyzeFrame>>,
      evidenceFrame: string
    ) => {
      setDetections(result.detections);
      setModules(result.modules);
      setModelName(`${result.model} · ${result.device.toUpperCase()}`);
      setInferenceMs(result.inferenceMs);
      setPipelineMetrics(result.metrics ? {
        inferenceFps: result.metrics.inferenceFps,
        queueDelayMs: result.metrics.queueDelayMs,
        droppedFrames: result.metrics.droppedFrames,
      } : null);
      setInferenceState("ready");

      const detectionFingerprint = result.detections
        .map((detection) => `${detection.source}:${detection.label}:${detection.attributes?.plate_number || ""}`)
        .sort()
        .join("|");
      const now = Date.now();
      if (detectionFingerprint && (
        detectionFingerprint !== timelineFingerprintRef.current.value
        || now - timelineFingerprintRef.current.timestamp > 1800
      )) {
        timelineFingerprintRef.current = { value: detectionFingerprint, timestamp: now };
        const capturedAt = new Date().toISOString();
        const events = result.detections.slice(0, 6).map((detection, index) => ({
          id: `${capturedAt}-${index}`,
          label: detection.attributes?.plate_number
            ? `PLATE ${String(detection.attributes.plate_number)}`
            : detection.label,
          source: detection.source.replace(/_/g, " "),
          confidence: detection.confidence,
          capturedAt,
          videoTime: sourceMode === "file" && videoRef.current
            ? videoRef.current.currentTime
            : null,
          detail: detection.trackId ? `TRACK #${detection.trackId}` : undefined,
        }));
        setTimelineEvents((current) => [...events, ...current].slice(0, 40));
      }

      const normalized = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const hasFace = result.detections.some((detection) => (
        detection.label.toLowerCase() === "face" || detection.source === "face_detection"
      ));
      const localReviewKey = `${sourceMode}:${sourceLabel}`;
      const alertCoordinates = selectedAnalyticsCamera?.coordinates;
      if (hasFace && alertCoordinates && (!selectedAnalyticsCameraId || backendStatus === "offline") && !reportedFaceReviewRef.current.has(localReviewKey)) {
        reportedFaceReviewRef.current.add(localReviewKey);
        addAlert({
          level: "medium",
          sourceCameraId: "LOCAL-FEED",
          sourceCameraName: sourceLabel,
          eventType: "Face detected — operator review required",
          confidence: Math.round(Math.max(...result.detections.filter((detection) => detection.label.toLowerCase() === "face" || detection.source === "face_detection").map((detection) => detection.confidence), 0) * 100),
          coordinates: alertCoordinates,
          objectClass: "Person",
          evidenceUrl: evidenceFrame,
          sector: "Live Feed",
          notes: "A face was detected. No identity match was performed; an operator must review the evidence.",
          evidenceSource: "ai_frame",
          identityStatus: "unidentified",
          reviewStatus: "operator_review",
          requiresOperatorReview: true,
        });
      }
      result.detections.forEach((detection) => {
        const attributes = detection.attributes || {};
        const rawValue = detection.source === "anpr"
          ? String(attributes.plate_number || "")
          : String(attributes.identity || attributes.face_id || "");
        if (!rawValue) return;
        const entry = watchlistEntries.find((candidate) => {
          if (candidate.type === "plate" && detection.source !== "anpr") return false;
          if (candidate.type === "face" && detection.source !== "face_detection") return false;
          const left = candidate.type === "plate" ? normalized(candidate.value) : candidate.value.toLowerCase();
          const right = candidate.type === "plate" ? normalized(rawValue) : rawValue.toLowerCase();
          return left === right;
        });
        if (!entry || !alertCoordinates) return;
        const matchKey = `${entry.id}:${rawValue}:${sourceLabel}`;
        if (reportedMatchesRef.current.has(matchKey)) return;
        reportedMatchesRef.current.add(matchKey);
        const level = entry.status === "Authorized" ? "medium" : entry.status === "Blacklisted" ? "critical" : "high";
        addAlert({
          level,
          sourceCameraId: "LOCAL-FEED",
          sourceCameraName: sourceLabel,
          eventType: `${detection.source === "anpr" ? "ANPR" : "FACE"} WATCHLIST MATCH // ${entry.label}`,
          confidence: Math.round(detection.confidence * 100),
          coordinates: alertCoordinates,
          objectClass: detection.source === "anpr" ? "Vehicle" : "Person",
          evidenceUrl: evidenceFrame,
          sector: "Live Feed",
          notes: `${entry.status} watchlist match for ${rawValue}. ${entry.reason || "Review the captured evidence frame."}`,
          plateNumber: detection.source === "anpr" ? rawValue : undefined,
          watchlistEntryId: entry.id,
          evidenceSource: "ai_frame",
        });
      });
    };

    const analyzeCurrentFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled) return;
      if (
        requestRunning ||
        !video ||
        !canvas ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        (sourceMode !== "camera" && video.paused)
      ) {
        nextRun = window.setTimeout(() => void analyzeCurrentFrame(), 150);
        return;
      }

      requestRunning = true;
      setInferenceState("analyzing");
      setInferenceError("");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        requestRunning = false;
        setInferenceState("error");
        setInferenceError("The browser could not prepare a frame for AI analysis.");
        return;
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = await canvasToBlob(canvas);
        if (!frame) throw new Error("Could not encode the source frame.");
        const result = await backendApi.analyzeFrame(frame, INFERENCE_MODULES);
        let evidenceFrame = "";
        try {
          // Cross-origin CCTV streams may be drawable but still prevent the
          // browser from exporting a canvas. Inference should keep running;
          // the alert view will use its safe placeholder evidence instead.
          evidenceFrame = canvas.toDataURL("image/jpeg", 0.68);
        } catch {
          evidenceFrame = "";
        }
        if (!cancelled && selectedAnalyticsCameraId && Date.now() - lastAnalyticsAtRef.current >= 1000) {
          lastAnalyticsAtRef.current = Date.now();
          void backendApi.evaluateCameraAnalytics(selectedAnalyticsCameraId, result.detections, undefined, evidenceFrame).catch(() => undefined);
        }
        if (!cancelled) applyResult(result, evidenceFrame);
      } catch (analysisError) {
        if (!cancelled) {
          setInferenceState("error");
          setInferenceError(
            analysisError instanceof Error
              ? analysisError.message
              : "The AI endpoint is unavailable."
          );
        }
      } finally {
        requestRunning = false;
        if (!cancelled) nextRun = window.setTimeout(() => void analyzeCurrentFrame(), 80);
      }
    };

    void analyzeCurrentFrame();
    return () => {
      cancelled = true;
      if (nextRun !== null) window.clearTimeout(nextRun);
    };
  }, [addAlert, backendStatus, cameraState, resetAnalysis, selectedAnalyticsCameraId, sourceLabel, sourceMode, watchlistEntries]);

  const handleVideoReady = () => {
    if (sourceMode === "camera") return;
    setError("");
    setCameraState("live");
    void videoRef.current?.play().catch(() => undefined);
  };

  const handleVideoError = () => {
    setCameraState("error");
    setError(
      sourceMode === "network"
        ? "The CCTV URL could not be played. Check the URL, camera access, and CORS; browser playback requires a compatible HTTP(S) stream."
        : "The selected video could not be decoded by this browser. Try MP4/H.264 or WebM."
    );
  };

  const isLive = cameraState === "live";

  return (
    <section
      className={cn(
        "relative bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden flex flex-col font-mono shadow-sm",
        className
      )}
    >
      <div className="relative z-10 bg-[#0F172A]/90 border-b border-[#38BDF8]/40 p-3 flex items-center justify-between text-[11px] pointer-events-none text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-2 h-2 rounded-full shrink-0", isLive ? "bg-[#0284C7] animate-pulse" : "bg-[#94A3B8]")} />
          <span className="font-bold tracking-widest text-white truncate uppercase">
            {activeSource === "screen" ? "SCREEN TEST SOURCE" : sourceLabel}
          </span>
        </div>
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", isLive ? "text-[#38BDF8]" : "text-[#94A3B8]")}>
          {isLive ? "LIVE // ACTIVE" : cameraState === "starting" ? "INITIALIZING" : cameraState === "error" ? "UNAVAILABLE" : "STANDBY"}
        </span>
      </div>

      {/* Top Source Mode Selector */}
      <div className="border-b border-[#CBDCEB] bg-[#F0F6FC] px-4 pt-3 pb-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-[#0F172A] font-bold uppercase tracking-widest mr-1">INPUT_SOURCE</span>
          <button type="button" className={sourceButtonClass(sourceMode === "camera")} onClick={() => chooseSourceMode("camera")}>
            <Camera className="w-3.5 h-3.5" /> DEVICE CAMERA
          </button>
          <button type="button" className={sourceButtonClass(sourceMode === "file")} onClick={() => chooseSourceMode("file")}>
            <FileVideo className="w-3.5 h-3.5" /> VIDEO FILE
          </button>
          <button type="button" className={sourceButtonClass(sourceMode === "network")} onClick={() => chooseSourceMode("network")}>
            <Wifi className="w-3.5 h-3.5" /> CCTV / IP STREAM
          </button>
        </div>

        {sourceMode === "camera" && (
          <div className="flex flex-wrap items-center gap-2">
            {devices.length > 0 && (
              <select
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="min-w-0 flex-1 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-[11px] text-[#0F172A] font-mono"
                aria-label="Select local camera"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
            <TacticalButton
              size="sm"
              onClick={() => void startCamera(selectedDeviceId || undefined)}
              icon={cameraState === "error" ? <RefreshCw className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            >
              {cameraState === "live" ? "RESTART CAMERA" : "ENABLE CAMERA"}
            </TacticalButton>
            <TacticalButton
              size="sm"
              variant="secondary"
              onClick={() => void startScreenShare()}
              icon={<Monitor className="w-3.5 h-3.5" />}
            >
              TEST WITH SCREEN SHARE
            </TacticalButton>
          </div>
        )}

        {sourceMode === "file" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-none border border-[#0284C7] bg-[#0284C7] px-3 py-1.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-sm hover:bg-[#0369A1] transition-colors">
              <Upload className="w-3.5 h-3.5" /> SELECT VIDEO
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(event) => loadVideoFile(event.target.files?.[0])}
              />
            </label>
            <span className="text-[10px] text-[#64748B] truncate max-w-full">
              {fileName || "MP4, WebM format supported"}
            </span>
          </div>
        )}

        {sourceMode === "network" && (
          <div className="space-y-2.5">
            {/* Relay camera selector */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Video className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                <select
                  value={selectedCameraId || (cameras[0]?.id || "")}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="w-full min-w-0 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-[11px] text-[#0F172A] font-mono"
                  aria-label="Select camera to relay"
                >
                  {cameras.length === 0 && <option value="">No cameras registered</option>}
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.id} // {cam.name} ({cam.sector})
                    </option>
                  ))}
                </select>
              </div>
              <TacticalButton
                size="sm"
                onClick={() => void connectCameraRelay(selectedCameraId || cameras[0]?.id)}
                icon={<Wifi className="w-3.5 h-3.5" />}
              >
                RELAY CAMERA STREAM
              </TacticalButton>
            </div>

            {/* Custom / Direct IP or HLS URL Input */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Link2 className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <input
                  value={networkUrl}
                  onChange={(event) => setNetworkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") connectNetwork();
                  }}
                  placeholder="Enter camera IP (e.g. 192.168.1.250), Camera ID, or HLS URL"
                  className="w-full min-w-0 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-3 py-1.5 text-[11px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
                  aria-label="CCTV IP or stream URL"
                />
              </div>
              <TacticalButton size="sm" variant="secondary" onClick={connectNetwork} icon={<Wifi className="w-3.5 h-3.5" />}>
                CONNECT IP / STREAM
              </TacticalButton>
            </div>

            <p className="text-[10px] leading-relaxed text-[#64748B]">
              LAN CCTV: MediaMTX automatically transcodes the camera RTSP stream into low-latency HLS for browser playback and real-time AI detection. You can select a camera above or directly type its IP (e.g. <span className="font-mono font-semibold text-[#0284C7]">192.168.1.250</span>).
            </p>
          </div>
        )}
        {cameras.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#475569]">ANALYTICS CAMERA</span>
            <select
              value={selectedAnalyticsCameraId}
              onChange={(event) => setAnalysisCameraId(event.target.value)}
              className="min-w-0 flex-1 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1.5 text-[11px] text-[#0F172A] font-mono"
              aria-label="Camera used for server analytics"
            >
              {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} // {camera.name}</option>)}
            </select>
            <span className="text-[10px] text-[#64748B]">rules + Firebase alerts</span>
          </div>
        )}
        {sourceMode === "network" && (
          <p className="text-[10px] leading-relaxed text-[#64748B]">
            LAN CCTV: connect the camera and this computer to the same network, then enter its HTTP(S), HLS, or WebRTC URL. Raw RTSP needs a local HLS/WebRTC relay before browser playback.
          </p>
        )}
      </div>

      {/* Video Display Area */}
      <div className="relative aspect-video min-h-[220px] bg-[#0B1320] flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src={(!activeSourceUrl?.includes(".m3u8") && !activeSourceUrl?.includes(":8888") && activeSourceUrl) || undefined}
          autoPlay
          muted
          playsInline
          controls={sourceMode !== "camera"}
          crossOrigin="anonymous"
          onLoadedMetadata={handleVideoReady}
          onCanPlay={handleVideoReady}
          onError={handleVideoError}
          onEnded={() => {
            if (sourceMode === "file") {
              setCameraState("idle");
              setError("Video finished. Choose file again to replay.");
            }
          }}
          className={cn("w-full h-full object-contain", !isLive && "hidden")}
        />
        <canvas ref={canvasRef} className="hidden" />
        {isLive && (
          <>
            {detections.map((detection, index) => (
              <div
                key={`${detection.source}-${detection.label}-${index}`}
                className="absolute border-2 border-[#38BDF8] pointer-events-none rounded-none"
                style={{
                  left: `${detection.box.x}%`,
                  top: `${detection.box.y}%`,
                  width: `${detection.box.width}%`,
                  height: `${detection.box.height}%`,
                }}
              >
                <span
                  className="absolute -top-5 left-0 whitespace-nowrap bg-[#0284C7] text-white px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded-none shadow-sm"
                >
                  {detection.attributes?.plate_number
                    ? String(detection.attributes.plate_number)
                    : detection.label}
                  {detection.trackId ? ` #${detection.trackId}` : ""} {(detection.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            <div className="absolute top-12 left-3 bg-[#0F172A]/90 border border-[#38BDF8]/40 rounded-none px-2 py-1 text-[10px] text-white font-mono">
              AI_{inferenceState === "analyzing" ? "ANALYZING" : inferenceState === "error" ? "UNAVAILABLE" : "ACTIVE"} // {detections.length} TARGET{detections.length === 1 ? "" : "S"}
            </div>
          </>
        )}
        {!isLive && (
          <div className="p-6 text-center max-w-md font-mono">
            {cameraState === "error" ? (
              <CameraOff className="w-8 h-8 mx-auto mb-3 text-[#DC2626]" />
            ) : activeSource === "screen" ? (
              <Monitor className="w-8 h-8 mx-auto mb-3 text-[#38BDF8] opacity-70" />
            ) : (
              <Camera className="w-8 h-8 mx-auto mb-3 text-[#38BDF8] opacity-70" />
            )}
            <p className="text-xs text-[#0F172A] uppercase tracking-wider font-bold">
              {cameraState === "starting"
                ? activeSource === "screen"
                ? "Requesting screen share"
                : "Opening video source"
                : cameraState === "error"
                ? error
                : sourceMode === "file"
                ? "Select a video file to analyze"
                : sourceMode === "network"
                ? "Enter a CCTV / IP stream URL above"
                : "No local camera stream started"}
            </p>
            {cameraState === "error" && sourceMode === "camera" && (
              <TacticalButton size="sm" className="mt-4" onClick={() => void startCamera(selectedDeviceId || undefined)} icon={<RefreshCw className="w-3.5 h-3.5" />}>
                RETRY CAMERA
              </TacticalButton>
            )}
          </div>
        )}
      </div>

      {/* Detection Timeline */}
      <div className="border-t border-[#CBDCEB] bg-[#FFFFFF] px-4 py-3 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] text-[#0F172A] font-bold uppercase tracking-widest">AI_DETECTION_TIMELINE</span>
            <span className="ml-2 text-[9px] text-[#64748B] uppercase">{timelineEvents.length} events // click a file event to seek</span>
          </div>
          <button
            type="button"
            onClick={resetTimeline}
            disabled={timelineEvents.length === 0}
            className="border border-[#CBDCEB] bg-[#F0F6FC] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#475569] hover:bg-[#E0F2FE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            CLEAR TIMELINE
          </button>
        </div>
        {timelineEvents.length === 0 ? (
          <div className="mt-2 border border-[#CBDCEB] bg-[#F8FBFE] px-3 py-2 text-[10px] text-[#64748B]">
            Detection events will appear here after the first analyzed frame.
          </div>
        ) : (
          <div className="mt-2 max-h-28 overflow-y-auto border border-[#CBDCEB] bg-[#F8FBFE] divide-y divide-[#CBDCEB]">
            {timelineEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  if (sourceMode !== "file" || event.videoTime === null || !videoRef.current) return;
                  videoRef.current.currentTime = event.videoTime;
                  void videoRef.current.play().catch(() => undefined);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] transition-colors",
                  sourceMode === "file" && event.videoTime !== null ? "cursor-pointer hover:bg-[#E0F2FE]" : "cursor-default"
                )}
              >
                <span className="w-12 shrink-0 font-bold text-[#0284C7]">{videoClock(event.videoTime)}</span>
                <span className="min-w-0 flex-1 truncate font-bold uppercase text-[#0F172A]">{event.label}</span>
                <span className="hidden shrink-0 text-[#64748B] sm:inline">{event.source}</span>
                <span className="shrink-0 text-[#0369A1]">{Math.round(event.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Pipeline Modules */}
      <div className="border-t border-[#CBDCEB] bg-[#F0F6FC] px-4 py-3 font-mono">
        <div className="flex items-center justify-between gap-2 text-[10px] text-[#475569] uppercase tracking-widest">
          <span className="text-[#0F172A] font-bold">AI_MODULE_PIPELINE</span>
          <span className="truncate font-semibold text-[#0284C7]">{modelName || "AWAITING FRAME DATA"}</span>
        </div>
        {pipelineMetrics && (
          <div className="mt-2 grid grid-cols-2 gap-2 border border-[#CBDCEB] bg-[#FFFFFF] p-2 text-[9px] uppercase tracking-wider text-[#475569] sm:grid-cols-3">
            <span>INFERENCE FPS <strong className="text-[#0369A1]">{pipelineMetrics.inferenceFps || "—"}</strong></span>
            <span>QUEUE DELAY <strong className="text-[#0369A1]">{pipelineMetrics.queueDelayMs}ms</strong></span>
            <span>DROPPED FRAMES <strong className="text-[#0369A1]">{pipelineMetrics.droppedFrames}</strong></span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2.5">
          {modules.length === 0 && (
            <div className="sm:col-span-3 border border-[#CBDCEB] bg-[#FFFFFF] px-3 py-2 text-[10px] text-[#64748B]">
              Activate camera, screen share, or video file to engage person tracking, face detection, and ANPR inference.
            </div>
          )}
          {modules.map((module) => (
            <div key={module.id} className="border border-[#CBDCEB] rounded-none bg-[#FFFFFF] p-2 min-w-0 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#0F172A] font-bold truncate uppercase">{module.label}</span>
                <span className={cn(
                  "text-[9px] font-bold uppercase",
                  module.status === "active" ? "text-[#16A34A]" : "text-[#64748B]"
                )}>{module.status}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[9px] text-[#64748B]">
                <span className="truncate">{module.model}</span>
                <span className="font-bold text-[#0284C7]">{module.detectionCount} DETECTIONS</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-[#CBDCEB] bg-[#FFFFFF] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#475569]">
        <span className="flex items-center gap-1.5 min-w-0">
          {isLive ? <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" /> : <ShieldAlert className="w-3.5 h-3.5 text-[#64748B] shrink-0" />}
          <span className="truncate uppercase font-bold text-[#0F172A]">
            {!isLive
              ? sourceMode === "network"
                ? "WAITING FOR CCTV STREAM"
                : sourceMode === "file"
                ? "WAITING FOR VIDEO FILE"
                : "READY // CAMERA PERMISSION REQUIRED"
              : inferenceState === "error"
              ? inferenceError
              : `AI_${inferenceState === "analyzing" ? "ANALYZING" : "ACTIVE"}${modelName ? ` // ${modelName}` : ""}${inferenceMs !== null ? ` // ${inferenceMs}ms` : ""}`}
          </span>
        </span>
      </div>
    </section>
  );
};
