"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { getAuthSession } from "@/lib/auth";
import { getBrowserApiBaseUrl } from "@/lib/api/route";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

export type CreatableKind =
  | "camera"
  | "alert"
  | "community"
  | "infrastructure"
  | "checkpoint"
  | "resource"
  | "road"
  | "zone";

interface CreateLocationDialogProps {
  point: { lat: number; lng: number };
  nearestPlace: string;
  onClose: () => void;
  onSaved: () => void;
}

const KINDS: Array<{ value: CreatableKind; label: string }> = [
  { value: "camera", label: "Camera location" },
  { value: "alert", label: "Alert / incident" },
  { value: "community", label: "Community / village" },
  { value: "infrastructure", label: "Critical infrastructure" },
  { value: "checkpoint", label: "Patrol checkpoint" },
  { value: "resource", label: "Resource / point of interest" },
  { value: "road", label: "Road / patrol route" },
  { value: "zone", label: "Restricted zone / geofence" },
];

export const CreateLocationDialog: React.FC<CreateLocationDialogProps> = ({
  point,
  nearestPlace,
  onClose,
  onSaved,
}) => {
  const session = getAuthSession();
  const canCreate = session?.tier === "admin" || session?.tier === "command";
  const [kind, setKind] = useState<CreatableKind>("alert");
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [extraPoints, setExtraPoints] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const operator = session?.name || "Authorized operator";
  const timestamp = new Date().toISOString();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setMessage("Command or administrator access is required.");
      return;
    }
    if (!name.trim()) {
      setMessage("A name or title is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const token = session?.token;
      const baseUrl = getBrowserApiBaseUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (kind === "alert") {
        const response = await fetch(`${baseUrl}/alerts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: `ALT-MAP-${Date.now()}`,
            level: "medium",
            sourceCameraId: "MAP-CREATE",
            sourceCameraName: `Map creation // ${operator}`,
            eventType: name.trim(),
            confidence: 0,
            coordinates: { lat: point.lat, lng: point.lng },
            objectClass: "Unknown",
            evidenceUrl: "",
            sector: nearestPlace || "Map sector",
            notes: `${details || "Map-created incident."} Nearest: ${nearestPlace}. By ${operator} at ${timestamp}.`,
            evidenceSource: "uploaded",
          }),
        });
        if (!response.ok) throw new Error("Alert creation failed.");
      } else {
        const collection = kind === "road" || kind === "zone" ? "roads" : kind === "community" ? "communities" : kind === "infrastructure" ? "infrastructure" : "resources";
        let record: Record<string, unknown>;
        if (collection === "roads") {
          const parsed = extraPoints
            .split(";")
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .map((chunk) => {
              const [latText, lngText] = chunk.split(",").map((part) => part.trim());
              return { lat: Number(latText), lng: Number(lngText) };
            });
          const points = [{ lat: point.lat, lng: point.lng }, ...parsed].filter(
            (item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)
          );
          if (points.length < 2) throw new Error("Roads and zones need at least one extra lat,lng point separated by ;");
          record = {
            id: `MAP-${Date.now()}`,
            name: name.trim(),
            status: kind === "zone" ? "affected" : "open",
            points,
            kind,
            notes: details,
            createdBy: operator,
            createdAt: timestamp,
            nearestPlace,
          };
        } else {
          record = {
            id: `MAP-${Date.now()}`,
            name: name.trim(),
            type: kind,
            coordinates: { lat: point.lat, lng: point.lng },
            notes: details,
            createdBy: operator,
            createdAt: timestamp,
            nearestPlace,
          };
        }
        const response = await fetch(`${baseUrl}/geospatial`, {
          method: "POST",
          headers,
          body: JSON.stringify({ collection, record }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Location record creation failed.");
        }
      }
      await useIBVAPStore.getState().hydrateFromBackend();
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Create location record" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={(event) => void save(event)} className="w-full max-w-md border border-[#CBDCEB] bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-[#CBDCEB] pb-2">
          <div>
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A]">Create at location</div>
            <div className="font-mono text-[10px] text-[#475569]">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)} · {nearestPlace || "Unnamed area"}
            </div>
            <div className="font-mono text-[10px] text-[#475569]">
              {timestamp} · {operator} · drag or refine on map before saving
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close create dialog" className="text-[#64748B]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {!canCreate && (
          <div className="mt-2 border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-1 font-mono text-[10px] text-[#B91C1C]">
            Command or administrator access is required to save location records.
          </div>
        )}
        <label className="mt-3 block font-mono text-[10px] font-bold uppercase text-[#475569]">
          Record type
          <select value={kind} onChange={(event) => setKind(event.target.value as CreatableKind)} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs">
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block font-mono text-[10px] font-bold uppercase text-[#475569]">
          Name / title
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="e.g. Ridge checkpoint 4" />
        </label>
        <label className="mt-2 block font-mono text-[10px] font-bold uppercase text-[#475569]">
          Details
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} className="mt-1 min-h-16 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="Access, coverage, risk, or handover notes." />
        </label>
        {(kind === "road" || kind === "zone") && (
          <label className="mt-2 block font-mono text-[10px] font-bold uppercase text-[#475569]">
            Extra geometry points (lat,lng; lat,lng)
            <input value={extraPoints} onChange={(event) => setExtraPoints(event.target.value)} className="mt-1 w-full border border-[#CBDCEB] bg-[#F8FBFE] px-2 py-2 text-xs font-normal normal-case" placeholder="28.6200, 77.2100; 28.6300, 77.2200" />
          </label>
        )}
        {message && (
          <div role="status" className="mt-2 font-mono text-[10px] text-[#B91C1C]">
            {message}
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="border border-[#CBDCEB] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[#475569]">
            Cancel
          </button>
          <button type="submit" disabled={saving || !canCreate} className="bg-[#0284C7] px-3 py-2 font-mono text-[10px] font-bold uppercase text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save location"}
          </button>
        </div>
      </form>
    </div>
  );
};
