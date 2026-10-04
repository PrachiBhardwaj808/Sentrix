import React, { useState } from "react";
import {
  Camera,
  Alert,
  Guard,
  Sector,
} from "@/lib/types";
import {
  Video,
  ShieldAlert,
  User,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Radio,
  Eye,
  Satellite,
  MapPin,
  CarFront,
  Flame,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";
import Link from "next/link";
import {
  DEMO_GEO_BOUNDS,
  formatGeoBounds,
  getBorderReference,
  INDIAN_BORDER_REFERENCES,
} from "@/lib/geography/indianBorder";

type BaseLayer = "tactical" | "satellite";

interface TacticalSectorMapProps {
  sectors: Sector[];
  cameras: Camera[];
  alerts: Alert[];
  guards: Guard[];
  onAcknowledgeAlert?: (alertId: string) => void;
  className?: string;
}

export const TacticalSectorMap: React.FC<TacticalSectorMapProps> = ({
  sectors,
  cameras,
  alerts,
  guards,
  onAcknowledgeAlert,
  className,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [selectedGuard, setSelectedGuard] = useState<Guard | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("tactical");
  const [selectedBorderId, setSelectedBorderId] = useState("DEMO-PUNJAB");

  // Layer Toggles
  const [layers, setLayers] = useState({
    cameras: true,
    guards: true,
    alerts: true,
    tripwires: true,
    fovCones: true,
    geofences: true,
    borderPoints: true,
    persons: true,
    vehicles: true,
    incidentHeatmap: false,
  });

  const toggleLayer = (layerKey: keyof typeof layers) => {
    tacticalSound.playClick();
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  const borderReference = getBorderReference(selectedBorderId);
  const mapBounds = borderReference.bounds || DEMO_GEO_BOUNDS;
  const satelliteImageryUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${mapBounds.minLng},${mapBounds.minLat},${mapBounds.maxLng},${mapBounds.maxLat}&bboxSR=4326&imageSR=4326&size=1600%2C960&format=jpg&transparent=false&f=image`;

  // Convert the selected geotag reference envelope to SVG viewbox coords.
  const toMapCoords = (lat: number, lng: number): { x: number; y: number } => {
    const latSpan = Math.max(0.0001, mapBounds.maxLat - mapBounds.minLat);
    const lngSpan = Math.max(0.0001, mapBounds.maxLng - mapBounds.minLng);
    const x = ((lng - mapBounds.minLng) / lngSpan) * 900 + 50;
    const y = ((mapBounds.maxLat - lat) / latSpan) * 500 + 50;
    return { x: Math.max(30, Math.min(970, x)), y: Math.max(30, Math.min(570, y)) };
  };

  const visibleBorderPoints = borderReference.points.filter(
    (point) =>
      point.lat >= mapBounds.minLat &&
      point.lat <= mapBounds.maxLat &&
      point.lng >= mapBounds.minLng &&
      point.lng <= mapBounds.maxLng
  );

  const filteredCameras =
    selectedSector === "ALL" ? cameras : cameras.filter((c) => c.sector.includes(selectedSector));
  const filteredAlerts =
    selectedSector === "ALL" ? alerts : alerts.filter((a) => a.sector.includes(selectedSector));
  const filteredGuards =
    selectedSector === "ALL" ? guards : guards.filter((g) => g.currentSector?.includes(selectedSector));

  return (
    <div
      className={cn(
        "relative w-full h-[620px] bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden flex flex-col font-mono select-none shadow-sm",
        className
      )}
    >
      {/* Top Map Toolbar */}
      <div className="bg-[#F0F6FC] border-b border-[#CBDCEB] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-20 shrink-0 text-xs">
        {/* Sector Focus Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest">SECTOR FOCUS:</span>
          <select
            value={selectedSector}
            onChange={(e) => {
              tacticalSound.playClick();
              setSelectedSector(e.target.value);
            }}
            className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1 text-xs text-[#0F172A] font-mono font-bold focus:border-[#0284C7]"
          >
            <option value="ALL">ALL BORDER SECTORS (ALPHA 1-6)</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.code}>
                {s.code}: {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest">GEOREFERENCE:</span>
          <select
            value={selectedBorderId}
            onChange={(event) => {
              tacticalSound.playClick();
              setSelectedBorderId(event.target.value);
              setSelectedSector("ALL");
              setSelectedCamera(null);
              setSelectedAlert(null);
              setSelectedGuard(null);
            }}
            className="max-w-[250px] min-w-0 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2.5 py-1 text-[10px] text-[#0F172A] font-mono font-bold focus:border-[#0284C7]"
            aria-label="Select Indian border geotag reference"
          >
            {INDIAN_BORDER_REFERENCES.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {reference.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Layer Toggles */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto py-1 [&>button]:shrink-0 [&>button]:min-h-9 [&>button]:justify-center [&>button]:whitespace-nowrap [&>select]:shrink-0">
          <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#475569]">BASE:</span>
          <button
            onClick={() => {
              tacticalSound.playClick();
              setBaseLayer("tactical");
            }}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              baseLayer === "tactical"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Radio className="w-3 h-3" /> MAP VIEW
          </button>
          <button
            onClick={() => {
              tacticalSound.playClick();
              setBaseLayer("satellite");
            }}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              baseLayer === "satellite"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Satellite className="w-3 h-3" /> SATELLITE VIEW
          </button>

          <button
            onClick={() => toggleLayer("cameras")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.cameras
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Video className="w-3 h-3" /> CAMERAS
          </button>

          <button
            onClick={() => toggleLayer("fovCones")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.fovCones
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Eye className="w-3 h-3" /> FOV CONES
          </button>

          <button
            onClick={() => toggleLayer("guards")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.guards
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <User className="w-3 h-3" /> SENTRIES
          </button>

          <button
            onClick={() => toggleLayer("alerts")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.alerts
                ? "bg-[#DC2626] text-white border-[#DC2626] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <ShieldAlert className="w-3 h-3" /> ALERTS
          </button>

          <button
            onClick={() => toggleLayer("persons")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.persons ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <ScanLine className="h-3 w-3" /> PERSONS
          </button>

          <button
            onClick={() => toggleLayer("vehicles")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.vehicles ? "bg-[#0284C7] text-white border-[#0284C7]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <CarFront className="h-3 w-3" /> VEHICLES
          </button>

          <button
            onClick={() => toggleLayer("incidentHeatmap")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.incidentHeatmap ? "bg-[#DC2626] text-white border-[#DC2626]" : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Flame className="h-3 w-3" /> HEATMAP
          </button>

          <button
            onClick={() => toggleLayer("tripwires")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.tripwires
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <Radio className="w-3 h-3" /> TRIPWIRES
          </button>

          <button
            onClick={() => toggleLayer("borderPoints")}
            className={cn(
              "px-2 py-0.5 rounded-none text-[10px] border flex items-center gap-1 transition-colors font-bold uppercase tracking-wider",
              layers.borderPoints
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#FFFFFF] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A]"
            )}
          >
            <MapPin className="w-3 h-3" /> BORDER POINTS
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              tacticalSound.playClick();
              setZoomLevel(Math.min(2.2, zoomLevel + 0.3));
            }}
            className="p-1.5 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#0369A1] rounded-none border border-[#CBDCEB]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              tacticalSound.playClick();
              setZoomLevel(Math.max(0.8, zoomLevel - 0.3));
            }}
            className="p-1.5 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#0369A1] rounded-none border border-[#CBDCEB]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              tacticalSound.playClick();
              setZoomLevel(1);
              setSelectedSector("ALL");
            }}
            className="p-1.5 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#0369A1] rounded-none border border-[#CBDCEB]"
            title="Reset Map View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main SVG Canvas Viewport - Tactical Deep Oceanic Navy */}
      <div
        className={cn(
          "relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing transition-[filter] duration-300",
          baseLayer === "satellite" ? "bg-[#334155]" : "bg-[#0B192C]"
        )}
      >
        {baseLayer === "satellite" && (
          <div className="absolute inset-0 z-0">
            <img
              src={satelliteImageryUrl}
              alt="Periodic satellite imagery base layer"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[#0B192C]/25" />
            <div className="absolute top-3 right-3 border border-white/60 bg-[#0F172A]/75 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
              SATELLITE IMAGERY // PERIODIC BASE LAYER // NOT LIVE VIDEO
            </div>
          </div>
        )}

        {/* Radar concentric range rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
          <div className="w-[300px] h-[300px] border border-[#38BDF8] rounded-full" />
          <div className="w-[500px] h-[500px] border border-[#38BDF8] rounded-full absolute" />
          <div className="w-[750px] h-[750px] border border-[#38BDF8] rounded-full absolute" />
        </div>

        {/* SVG Map Elements */}
        <svg
          viewBox="0 0 1000 600"
          className="absolute inset-0 z-10 w-full h-full transition-transform duration-300"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Zero-Line Border / Reference Context */}
          {selectedBorderId === "DEMO-PUNJAB" ? (
            <>
              <path
                d="M 60 50 Q 250 180 500 280 T 940 550"
                className="stroke-[#F43F5E] stroke-[2] fill-none"
                strokeDasharray="8 6"
              />
              <text x="70" y="45" fill="#F43F5E" fontSize="10" fontWeight="bold" fontFamily="monospace">
                ZERO LINE // INTERNATIONAL DEMARCATION
              </text>
            </>
          ) : (
            <text x="70" y="45" fill="#F43F5E" fontSize="10" fontWeight="bold" fontFamily="monospace">
              BORDER REFERENCE // {borderReference.neighbor.toUpperCase()}
            </text>
          )}

          {/* Border reference points from the supplied coordinate register */}
          {layers.borderPoints &&
            visibleBorderPoints.map((point) => {
              const pos = toMapCoords(point.lat, point.lng);
              return (
                <g key={point.id} transform={`translate(${pos.x}, ${pos.y})`} className="pointer-events-none">
                  <circle r="5" className={point.verified ? "fill-[#0F172A] stroke-[#FBBF24] stroke-[1.5]" : "fill-[#0F172A] stroke-[#FB7185] stroke-[1.5]"} />
                  <text x="8" y="3" fill={point.verified ? "#FDE68A" : "#FDA4AF"} fontSize="8" fontWeight="bold" fontFamily="monospace">
                    {point.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

          {/* Sector Geofence Polygons */}
          {layers.geofences &&
            sectors.map((sector) => {
              const polyPoints = sector.polygon
                .map((p) => {
                  const coords = toMapCoords(p.lat, p.lng);
                  return `${coords.x},${coords.y}`;
                })
                .join(" ");

              const isSectorFocused = selectedSector === "ALL" || selectedSector === sector.code;

              return (
                <g key={sector.id} className="cursor-pointer">
                  <polygon
                    points={polyPoints}
                    className={cn(
                      "transition-all duration-200",
                      isSectorFocused
                        ? "fill-[#0284C7]/20 stroke-[#38BDF8] stroke-[1.5]"
                        : "fill-transparent stroke-[#38BDF8]/40 stroke-[1]"
                    )}
                  />
                  {sector.polygon[0] && (
                    <text
                      x={toMapCoords(sector.polygon[0].lat, sector.polygon[0].lng).x + 10}
                      y={toMapCoords(sector.polygon[0].lat, sector.polygon[0].lng).y + 20}
                      fill="#E0F2FE"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {sector.code}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Perimeter Tripwires */}
          {layers.tripwires &&
            sectors.flatMap((sector) =>
              sector.tripwires.map((wire) => {
                const start = toMapCoords(wire.start.lat, wire.start.lng);
                const end = toMapCoords(wire.end.lat, wire.end.lng);
                return (
                  <g key={wire.id}>
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      className={cn(
                        "stroke-[2]",
                        wire.armed ? "stroke-[#38BDF8]" : "stroke-[#64748B]"
                      )}
                      strokeDasharray="4 4"
                    />
                    <circle cx={start.x} cy={start.y} r="2.5" fill="#38BDF8" />
                    <circle cx={end.x} cy={end.y} r="2.5" fill="#38BDF8" />
                  </g>
                );
              })
            )}

          {/* Camera FOV Cones */}
          {layers.fovCones &&
            filteredCameras.map((cam) => {
              const pos = toMapCoords(cam.coordinates.lat, cam.coordinates.lng);
              const angleRad = ((cam.pan || 0) * Math.PI) / 180;
              const fovRad = ((cam.fovAngle || 60) * Math.PI) / 180;
              const radius = 80;

              const x1 = pos.x + radius * Math.sin(angleRad - fovRad / 2);
              const y1 = pos.y - radius * Math.cos(angleRad - fovRad / 2);
              const x2 = pos.x + radius * Math.sin(angleRad + fovRad / 2);
              const y2 = pos.y - radius * Math.cos(angleRad + fovRad / 2);

              return (
                <path
                  key={`fov-${cam.id}`}
                  d={`M ${pos.x} ${pos.y} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                  className="fill-[#38BDF8]/15 stroke-[#38BDF8]/40 stroke-[1] pointer-events-none"
                />
              );
            })}

          {/* Camera Marker Pins */}
          {layers.cameras &&
            filteredCameras.map((cam) => {
              const pos = toMapCoords(cam.coordinates.lat, cam.coordinates.lng);
              const isSelected = selectedCamera?.id === cam.id;

              return (
                <g
                  key={cam.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    tacticalSound.playClick();
                    setSelectedCamera(cam);
                    setSelectedAlert(null);
                    setSelectedGuard(null);
                  }}
                  className="cursor-pointer group"
                >
                  <circle
                    r="8"
                    className={cn(
                      "transition-all",
                      isSelected
                        ? "fill-[#0284C7] stroke-white stroke-2"
                        : "fill-[#0F172A] stroke-[#38BDF8] stroke-[1] hover:stroke-white"
                    )}
                  />
                  <text
                    x="12"
                    y="4"
                    fill={isSelected ? "#38BDF8" : "#BAE6FD"}
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {cam.id}
                  </text>
                </g>
              );
            })}

          {/* Guard Patrol Pins */}
          {layers.guards &&
            filteredGuards.map((guard, idx) => {
              const matchingSector = sectors.find(
                (s) => s.code === guard.currentSector || s.name.includes(guard.currentSector || "")
              );
              const baseCoord = matchingSector?.polygon[0] || {
                lat: 31.65 + ((idx * 0.012) % 0.04),
                lng: 74.88 + ((idx * 0.015) % 0.05),
              };
              const pos = toMapCoords(
                baseCoord.lat + (((idx % 3) - 1) * 0.004),
                baseCoord.lng + (((idx % 2) - 0.5) * 0.004)
              );
              const isSelected = selectedGuard?.id === guard.id;

              return (
                <g
                  key={guard.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    tacticalSound.playClick();
                    setSelectedGuard(guard);
                    setSelectedCamera(null);
                    setSelectedAlert(null);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x="-6"
                    y="-6"
                    width="12"
                    height="12"
                    className={cn(
                      "transition-all",
                      isSelected
                        ? "fill-[#10B981] stroke-white stroke-2"
                        : "fill-[#065F46] stroke-[#34D399] stroke-[1]"
                    )}
                  />
                  <text
                    x="10"
                    y="3"
                    fill="#A7F3D0"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {guard.callSign}
                  </text>
                </g>
              );
            })}

          {/* Active Alert Threat Blips */}
          {layers.incidentHeatmap &&
            filteredAlerts.map((alert) => {
              const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng);
              return <circle key={`heat-${alert.id}`} cx={pos.x} cy={pos.y} r="24" className="fill-[#F97316]/20 stroke-[#FB923C]/40 stroke-[2]" />;
            })}

          {layers.persons &&
            filteredAlerts.filter((alert) => alert.objectClass === "Person").map((alert) => {
              const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng);
              return <circle key={`person-${alert.id}`} cx={pos.x - 18} cy={pos.y + 16} r="4" className="fill-[#38BDF8] stroke-white stroke-[1]" />;
            })}

          {layers.vehicles &&
            filteredAlerts.filter((alert) => alert.objectClass === "Vehicle").map((alert) => {
              const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng);
              return <rect key={`vehicle-${alert.id}`} x={pos.x + 12} y={pos.y + 10} width="8" height="5" className="fill-[#FBBF24] stroke-white stroke-[1]" />;
            })}

          {/* Active Alert Threat Blips */}
          {layers.alerts &&
            filteredAlerts
              .filter((a) => a.status === "open")
              .map((alert) => {
                const pos = toMapCoords(alert.coordinates.lat, alert.coordinates.lng);
                const isSelected = selectedAlert?.id === alert.id;

                return (
                  <g
                    key={alert.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={() => {
                      tacticalSound.playAlert();
                      setSelectedAlert(alert);
                      setSelectedCamera(null);
                      setSelectedGuard(null);
                    }}
                    className="cursor-pointer"
                  >
                    <circle r="12" className="fill-[#DC2626]/40 stroke-[#FCA5A5] stroke-[1] animate-ping" />
                    <circle r="6" className="fill-[#DC2626] stroke-white stroke-2" />
                    <text
                      x="14"
                      y="4"
                      fill="#FCA5A5"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      THREAT: {alert.eventType}
                    </text>
                  </g>
                );
              })}
        </svg>

        {/* Selected Inspector Panel */}
        {(selectedCamera || selectedAlert || selectedGuard) && (
          <div className="absolute bottom-4 left-4 max-w-sm w-full bg-[#FFFFFF] border border-[#CBDCEB] p-4 text-xs z-30 font-mono space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2">
              <span className="font-bold text-[#0F172A] uppercase tracking-wider">
                {selectedCamera
                  ? `SENSOR // ${selectedCamera.id}`
                  : selectedAlert
                  ? `THREAT // ${selectedAlert.id}`
                  : `SENTRY // ${selectedGuard?.callSign}`}
              </span>
              <button
                onClick={() => {
                  setSelectedCamera(null);
                  setSelectedAlert(null);
                  setSelectedGuard(null);
                }}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                ✕
              </button>
            </div>

            {selectedCamera && (
              <div className="space-y-2">
                <div className="text-[11px] text-[#475569]">
                  <div>NAME: <strong className="text-[#0F172A]">{selectedCamera.name}</strong></div>
                  <div>SECTOR: {selectedCamera.sector}</div>
                  <div>STATUS: <strong className="text-[#0284C7]">{selectedCamera.status.toUpperCase()}</strong></div>
                </div>
                <Link
                  href="/live-feed"
                  className="block text-center py-1.5 bg-[#0284C7] text-white font-bold text-[10px] uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                >
                  OPEN STREAM VIEW →
                </Link>
              </div>
            )}

            {selectedAlert && (
              <div className="space-y-2">
                <div className="text-[11px] text-[#475569]">
                  <div className="text-[#DC2626] font-bold">{selectedAlert.eventType}</div>
                  <div>SECTOR: {selectedAlert.sector}</div>
                  <div>CONFIDENCE: {selectedAlert.confidence}%</div>
                </div>
                {onAcknowledgeAlert && selectedAlert.status === "open" && (
                  <button
                    onClick={() => {
                      onAcknowledgeAlert(selectedAlert.id);
                      setSelectedAlert(null);
                    }}
                    className="w-full py-1.5 bg-[#0284C7] text-white font-bold text-[10px] uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                  >
                    ACKNOWLEDGE INCIDENT
                  </button>
                )}
              </div>
            )}

            {selectedGuard && (
              <div className="space-y-2">
                <div className="text-[11px] text-[#475569]">
                  <div className="font-bold text-[#0F172A]">{selectedGuard.name} ({selectedGuard.rank})</div>
                  <div>POST: {selectedGuard.currentPostId || "Sector Patrol"}</div>
                  <div>PHONE: {selectedGuard.phone}</div>
                </div>
                <a
                  href={`tel:${selectedGuard.phone.replace(/\s+/g, "")}`}
                  className="block text-center py-1.5 bg-[#0284C7] text-white font-bold text-[10px] uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                >
                  CALL SENTRY
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coordinate & GIS Status Footer */}
      <div className="bg-[#F0F6FC] border-t border-[#CBDCEB] px-4 py-2 flex items-center justify-between text-[10px] text-[#475569]">
        <div className="truncate pr-3">GEOREFERENCE: {borderReference.label.toUpperCase()} // {formatGeoBounds(mapBounds)}</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#0284C7] animate-pulse" />
          <span className="text-[#0284C7] font-bold">
            GIS_RADAR_ACTIVE // BASE: {baseLayer === "satellite" ? "SATELLITE IMAGERY" : "TACTICAL MAP"}
          </span>
        </div>
      </div>
    </div>
  );
};
