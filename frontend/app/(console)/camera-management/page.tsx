"use client";

import React, { useState } from "react";
import {
  Camera as CameraIcon,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { Camera, TriggerAction } from "@/lib/types";
import { StatusPill } from "@/components/shared/StatusPill";
import { TacticalCard } from "@/components/shared/TacticalCard";
import { ZonePolygonEditor } from "@/components/camera/ZonePolygonEditor";
import { tacticalSound } from "@/lib/sound";
import { backendApi, CameraConnectionResult } from "@/lib/api/client";

export default function CameraManagementPage() {
  const { cameras, sectors, updateCameraDetection, commitZoneMap, currentUser } =
    useIBVAPStore();

  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameras[0]?.id || "");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"detection_studio" | "registry">("detection_studio");
  const [connectionTest, setConnectionTest] = useState<CameraConnectionResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  if (!selectedCamera) {
    return (
      <div className="min-h-[360px] flex items-center justify-center bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-8 text-center font-mono shadow-sm">
        <div>
          <CameraIcon className="w-8 h-8 mx-auto mb-3 text-[#0284C7]" />
          <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">NO CAMERAS CONFIGURED</h1>
          <p className="text-xs text-[#475569] mt-2 max-w-md">Register a CCTV source through Django before configuring detection zones.</p>
        </div>
      </div>
    );
  }

  const filteredCameras = cameras.filter((c) => {
    const matchSector = sectorFilter === "ALL" || c.sector.includes(sectorFilter);
    const matchSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.sector.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSector && matchSearch;
  });

  const handleToggle = (key: keyof Camera, value: boolean) => {
    tacticalSound.playClick();
    updateCameraDetection(selectedCamera.id, { [key]: value });
  };

  const handleSliderChange = (key: keyof Camera, value: number) => {
    updateCameraDetection(selectedCamera.id, { [key]: value });
  };

  const handleActionChange = (action: TriggerAction) => {
    tacticalSound.playClick();
    updateCameraDetection(selectedCamera.id, { triggerAction: action });
  };

  const handlePolygonCommit = (polygon: { x: number; y: number }[]) => {
    commitZoneMap(selectedCamera.id, polygon, currentUser.name);
  };

  const handleTestConnection = async () => {
    if (!selectedCamera.rtspUrl) {
      setConnectionTest({ reachable: false, protocol: "unknown", host: null, port: null, code: "missing_url", message: "No RTSP or HTTP source is configured for this camera." });
      return;
    }
    setIsTestingConnection(true);
    try {
      const response = await backendApi.testCameraConnection(selectedCamera.rtspUrl);
      setConnectionTest(response.connection);
    } catch (error) {
      setConnectionTest({ reachable: false, protocol: "unknown", host: null, port: null, code: "api_error", message: error instanceof Error ? error.message : "Camera connection test failed." });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold">
            <CameraIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              CAMERA REGISTRY & DETECTION STUDIO
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Configure detection zones, sensitivity parameters, and automated action triggers per camera.
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              tacticalSound.playClick();
              setActiveTab("detection_studio");
            }}
            className={`px-3.5 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "detection_studio"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            DETECTION STUDIO
          </button>
          <button
            onClick={() => {
              tacticalSound.playClick();
              setActiveTab("registry");
            }}
            className={`px-3.5 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "registry"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            REGISTRY TABLE ({cameras.length})
          </button>
        </div>
      </div>

      {activeTab === "detection_studio" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Selector List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                ACTIVE SENSORS ({cameras.length})
              </span>
              <select
                value={sectorFilter}
                onChange={(e) => {
                  tacticalSound.playClick();
                  setSectorFilter(e.target.value);
                }}
                className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none px-2 py-1 text-[11px] text-[#0F172A] font-mono focus:border-[#0284C7] font-bold"
              >
                <option value="ALL">ALL SECTORS</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredCameras.map((cam) => {
                const isSelected = cam.id === selectedCamera.id;
                return (
                  <div
                    key={cam.id}
                    onClick={() => {
                      tacticalSound.playClick();
                      setSelectedCameraId(cam.id);
                    }}
                    className={`p-3 border rounded-none cursor-pointer transition-colors ${
                      isSelected
                        ? "border-[#0284C7] bg-[#E0F2FE]"
                        : "border-[#CBDCEB] bg-[#FFFFFF] hover:bg-[#F8FBFE]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A]">{cam.id}</span>
                      <StatusPill type={cam.status} size="sm" />
                    </div>
                    <h4 className="text-xs text-[#475569] font-bold mt-1 truncate">
                      {cam.name}
                    </h4>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B] mt-2">
                      <span>{cam.sector}</span>
                      <span className="text-[#0284C7] uppercase font-bold">{cam.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Columns: Polygon Editor & Logic Config */}
          <div className="lg:col-span-2 space-y-4">
            <div className="border border-[#CBDCEB] bg-[#FFFFFF] px-3 py-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
                <span className="text-[#475569]">UPSTREAM CAMERA LINK // {selectedCamera.rtspUrl ? "CONFIGURED" : "NOT CONFIGURED"}</span>
                <button type="button" onClick={() => void handleTestConnection()} disabled={isTestingConnection} className="border border-[#CBDCEB] bg-[#F0F6FC] px-2.5 py-1.5 text-[#0369A1] hover:bg-[#E0F2FE] disabled:opacity-50">
                  {isTestingConnection ? "TESTING..." : "TEST CAMERA LINK"}
                </button>
              </div>
              {connectionTest && <div className={`mt-2 text-[10px] font-bold ${connectionTest.reachable ? "text-[#166534]" : "text-[#B91C1C]"}`}>{connectionTest.reachable ? "REACHABLE" : connectionTest.code.toUpperCase()} // {connectionTest.message}</div>}
              <p className="mt-1 text-[10px] text-[#64748B]">RTSP is tested by Django; browser playback still requires an HLS/WebRTC relay.</p>
            </div>
            <TacticalCard
              title={`DETECTION GEOFENCE // ${selectedCamera.id}`}
              subtitle={selectedCamera.name}
              badge={<StatusPill type={selectedCamera.status} size="sm" />}
            >
              <ZonePolygonEditor
                key={selectedCamera.id}
                initialPolygon={selectedCamera.zonePolygon}
                cameraId={selectedCamera.id}
                cameraName={selectedCamera.name}
                onCommit={handlePolygonCommit}
              />
            </TacticalCard>

            <TacticalCard title="DETECTION LOGIC & AUTOMATION CONFIGURATION">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* AI Models Toggles */}
                <div className="space-y-2.5 p-3.5 bg-[#F0F6FC] border border-[#CBDCEB]">
                  <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block">
                    ACTIVE AI DETECTION MODELS
                  </span>

                  <div className="flex items-center justify-between p-2 bg-[#FFFFFF] border border-[#CBDCEB]">
                    <span className="text-[#0F172A] font-bold">Master AI Active</span>
                    <button
                      onClick={() => handleToggle("aiActive", !selectedCamera.aiActive)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-none border ${
                        selectedCamera.aiActive
                          ? "bg-[#0284C7] text-white border-[#0284C7]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB]"
                      }`}
                    >
                      {selectedCamera.aiActive ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#FFFFFF] border border-[#CBDCEB]">
                    <span className="text-[#475569] font-bold">Human / Intrusion Detection</span>
                    <button
                      onClick={() =>
                        handleToggle("personDetection", !selectedCamera.personDetection)
                      }
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-none border ${
                        selectedCamera.personDetection
                          ? "bg-[#0284C7] text-white border-[#0284C7]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB]"
                      }`}
                    >
                      {selectedCamera.personDetection ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#FFFFFF] border border-[#CBDCEB]">
                    <span className="text-[#475569] font-bold">Vehicle / Transport ANPR</span>
                    <button
                      onClick={() =>
                        handleToggle("vehicleDetection", !selectedCamera.vehicleDetection)
                      }
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-none border ${
                        selectedCamera.vehicleDetection
                          ? "bg-[#0284C7] text-white border-[#0284C7]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB]"
                      }`}
                    >
                      {selectedCamera.vehicleDetection ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#FFFFFF] border border-[#CBDCEB]">
                    <span className="text-[#475569] font-bold">Firearms & Weapon Contour</span>
                    <button
                      onClick={() =>
                        handleToggle("weaponDetection", !selectedCamera.weaponDetection)
                      }
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-none border ${
                        selectedCamera.weaponDetection
                          ? "bg-[#DC2626] text-white border-[#DC2626]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBDCEB]"
                      }`}
                    >
                      {selectedCamera.weaponDetection ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* Thresholds & Trigger Action */}
                <div className="space-y-2.5 p-3.5 bg-[#F0F6FC] border border-[#CBDCEB]">
                  <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block">
                    SENSITIVITY & TRIGGER AUTOMATION
                  </span>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#475569] font-semibold">Confidence Threshold:</span>
                      <span className="text-[#0284C7] font-bold">
                        {selectedCamera.confidenceThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="98"
                      value={selectedCamera.confidenceThreshold}
                      onChange={(e) =>
                        handleSliderChange("confidenceThreshold", Number(e.target.value))
                      }
                      className="w-full accent-[#0284C7] cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#475569] font-semibold">Min Object Size (px):</span>
                      <span className="text-[#0284C7] font-bold">
                        {selectedCamera.minObjectSizePx} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={selectedCamera.minObjectSizePx}
                      onChange={(e) =>
                        handleSliderChange("minObjectSizePx", Number(e.target.value))
                      }
                      className="w-full accent-[#0284C7] cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block">
                      AUTOMATED ESCALATION ACTION:
                    </label>
                    <select
                      value={selectedCamera.triggerAction}
                      onChange={(e) => handleActionChange(e.target.value as TriggerAction)}
                      className="w-full bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-2 text-xs text-[#0F172A] font-bold focus:border-[#0284C7] font-mono"
                    >
                      <option value="QRF Dispatch">QRF Quick Reaction Dispatch</option>
                      <option value="Siren Alarm">High-Decibel Siren Alarm</option>
                      <option value="Guard Ping">Direct Sentry Radio Ping</option>
                      <option value="Floodlight Trigger">Perimeter Floodlight Illumination</option>
                    </select>
                  </div>
                </div>
              </div>
            </TacticalCard>
          </div>
        </div>
      ) : (
        /* Registry Table */
        <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#F0F6FC] border-b border-[#CBDCEB] text-[10px] text-[#475569] uppercase tracking-widest font-bold">
                <tr>
                  <th className="py-3 px-3.5">STATUS</th>
                  <th className="py-3 px-3">CAMERA ID</th>
                  <th className="py-3 px-3">SENSOR NAME</th>
                  <th className="py-3 px-3">SECTOR</th>
                  <th className="py-3 px-3">TYPE</th>
                  <th className="py-3 px-3">FPS</th>
                  <th className="py-3 px-3">RESOLUTION</th>
                  <th className="py-3 px-3">TRIGGER ACTION</th>
                  <th className="py-3 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBDCEB]">
                {filteredCameras.map((cam) => (
                  <tr
                    key={cam.id}
                    onClick={() => {
                      setSelectedCameraId(cam.id);
                      setActiveTab("detection_studio");
                    }}
                    className="hover:bg-[#F8FBFE] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3.5">
                      <StatusPill type={cam.status} size="sm" />
                    </td>
                    <td className="py-3 px-3 font-bold text-[#0284C7]">{cam.id}</td>
                    <td className="py-3 px-3 text-[#0F172A] font-bold">{cam.name}</td>
                    <td className="py-3 px-3 text-[#475569]">{cam.sector}</td>
                    <td className="py-3 px-3 uppercase text-[#0F172A] font-bold">{cam.type}</td>
                    <td className="py-3 px-3 text-[#0F172A] font-bold">{cam.fps} FPS</td>
                    <td className="py-3 px-3 text-[#475569]">{cam.resolution}</td>
                    <td className="py-3 px-3 text-[#0F172A] font-semibold">{cam.triggerAction}</td>
                    <td className="py-3 px-3 text-right">
                      <button className="px-3 py-1 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] text-[10px] font-bold uppercase tracking-wider">
                        CONFIGURE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
