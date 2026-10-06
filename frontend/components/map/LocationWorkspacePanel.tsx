"use client";

import React from "react";
import { AlertTriangle, Camera, ShieldAlert, Users, X } from "lucide-react";
import { LocationWorkspace } from "@/lib/api/client";

interface LocationWorkspacePanelProps {
  label: string;
  workspace: LocationWorkspace | null;
  loading: boolean;
  onClose: () => void;
  onSelectAlert: (alertId: string) => void;
}

const rowClass = "flex items-center justify-between gap-2 border-b border-[#E2E8F0] py-1 text-[11px]";

export const LocationWorkspacePanel: React.FC<LocationWorkspacePanelProps> = ({
  label,
  workspace,
  loading,
  onClose,
  onSelectAlert,
}) => (
  <aside aria-label="Location workspace" className="space-y-3 border border-[#CBDCEB] bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2 border-b border-[#CBDCEB] pb-2">
      <div>
        <div className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F172A]">Location workspace</div>
        <div className="font-mono text-[10px] text-[#475569]">{label}</div>
        {workspace && (
          <div className="font-mono text-[10px] text-[#0284C7]">
            {workspace.center.lat.toFixed(5)}, {workspace.center.lng.toFixed(5)} · {workspace.radiusKm} km
          </div>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Close location workspace" className="text-[#64748B]">
        <X className="h-4 w-4" />
      </button>
    </div>

    {loading && <div className="font-mono text-[11px] text-[#0284C7]">Loading everything at this location…</div>}
    {!loading && !workspace && (
      <div className="font-mono text-[11px] text-[#64748B]">Search a place or click the map to inspect all work there.</div>
    )}

    {workspace && (
      <>
        <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
          <div className="border border-[#FCA5A5] bg-[#FEF2F2] p-2">
            <span className="block uppercase text-[#64748B]">Open alerts</span>
            <strong className="text-sm text-[#B91C1C]">{workspace.summary.openAlerts}</strong>
          </div>
          <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-2">
            <span className="block uppercase text-[#64748B]">Cameras nearby</span>
            <strong className="text-sm text-[#0F172A]">{workspace.summary.camerasNearby}</strong>
          </div>
          <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-2">
            <span className="block uppercase text-[#64748B]">Communities</span>
            <strong className="text-sm text-[#0F172A]">{workspace.summary.communities}</strong>
          </div>
          <div className="border border-[#CBDCEB] bg-[#F8FBFE] p-2">
            <span className="block uppercase text-[#64748B]">Resources</span>
            <strong className="text-sm text-[#0F172A]">{workspace.summary.resources}</strong>
          </div>
        </div>

        {(workspace.summary.criticalUnresolved > 0 || workspace.summary.camerasOffline > 0) && (
          <div className="border border-[#FCD34D] bg-[#FFFBEB] p-2 font-mono text-[10px] text-[#92400E]">
            {workspace.summary.criticalUnresolved > 0 && <div>Critical unresolved: {workspace.summary.criticalUnresolved}</div>}
            {workspace.summary.camerasOffline > 0 && <div>Offline cameras: {workspace.summary.camerasOffline}</div>}
          </div>
        )}

        <section>
          <h3 className="mb-1 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#475569]">
            <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626]" /> Alerts here ({workspace.alerts.length})
          </h3>
          {workspace.alerts.length === 0 && <div className="font-mono text-[10px] text-[#64748B]">No alerts in radius.</div>}
          {workspace.alerts.slice(0, 6).map((alert) => (
            <button key={alert.id} type="button" onClick={() => onSelectAlert(alert.id)} className="w-full text-left hover:bg-[#F8FBFE]">
              <span className={rowClass}>
                <span className="flex items-center gap-1 truncate">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-[#D97706]" />
                  {alert.eventType} · {alert.level}
                </span>
                <strong className="shrink-0 uppercase">{alert.status}</strong>
              </span>
            </button>
          ))}
        </section>

        <section>
          <h3 className="mb-1 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#475569]">
            <Camera className="h-3.5 w-3.5 text-[#0284C7]" /> Cameras ({workspace.cameras.length})
          </h3>
          {workspace.cameras.slice(0, 5).map((camera) => (
            <div key={camera.id} className={rowClass}>
              <span className="truncate">{camera.name || camera.id}</span>
              <span className="uppercase text-[#64748B]">{camera.status}</span>
            </div>
          ))}
          {workspace.cameras.length === 0 && <div className="font-mono text-[10px] text-[#64748B]">No cameras in radius.</div>}
        </section>

        <section>
          <h3 className="mb-1 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#475569]">
            <Users className="h-3.5 w-3.5 text-[#16A34A]" /> Guards on record ({workspace.guards.length})
          </h3>
          {workspace.guards.slice(0, 5).map((guard) => (
            <div key={String(guard.id)} className={rowClass}>
              <span className="truncate">{String(guard.name || guard.id)}</span>
              <span className="uppercase text-[#64748B]">{String(guard.currentSector || "")}</span>
            </div>
          ))}
        </section>

        <section className="font-mono text-[10px] text-[#475569]">
          <div>Roads: {workspace.roads.length} · Infrastructure: {workspace.infrastructure.length}</div>
          <div>Recent activity records: {workspace.recentActivity.length}</div>
        </section>
      </>
    )}
  </aside>
);
