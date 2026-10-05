"use client";

import React, { useEffect, useState } from "react";
import {
  Download,
  FileText,
  Radio,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Send,
  RefreshCw,
  Palette,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { Alert } from "@/lib/types";
import { StatusPill } from "@/components/shared/StatusPill";
import { Modal } from "@/components/shared/Modal";
import { formatTimeIST, formatDateIST } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";
import { BlockchainEvidenceCard } from "@/components/blockchain/BlockchainEvidenceCard";
import { AuthSession, getAuthSession } from "@/lib/auth";
import { evidenceSource } from "@/lib/evidence";
import { openIncidentReport } from "@/lib/reports";
import { alertColorFor, alertSeverityLabel } from "@/lib/alertColors";
import { backendApi, DispatchOtpDelivery } from "@/lib/api/client";

export default function AlertsPage() {
  const { alerts, guards, watchlistEntries, demoProfiles, acknowledgeAlert, escalateAlert, resolveAlert, dispatchAlert, hydrateFromBackend } = useIBVAPStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "PERIMETER" | "POI" | "ANPR" | "OPEN">("ALL");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [dispatchGuardId, setDispatchGuardId] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [isResendingSms, setIsResendingSms] = useState(false);
  const [dispatchOtp, setDispatchOtp] = useState<DispatchOtpDelivery | null>(null);
  const [dispatchOtpInput, setDispatchOtpInput] = useState("");
  const [isVerifyingDispatchOtp, setIsVerifyingDispatchOtp] = useState(false);
  const [dispatchOtpError, setDispatchOtpError] = useState("");
  const [reviewProfileId, setReviewProfileId] = useState("");
  const [isMarkingPotentialMatch, setIsMarkingPotentialMatch] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");

  useEffect(() => {
    setAuthSession(getAuthSession());
  }, []);

  const filteredAlerts = alerts.filter((a) => {
    const matchSearch =
      a.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.sourceCameraId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.sector.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.plateNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      watchlistEntries.some((entry) => entry.id === a.watchlistEntryId && `${entry.value} ${entry.label}`.toLowerCase().includes(searchQuery.toLowerCase()));

    const isPoi = a.eventType.includes("POI") || a.eventType.includes("Facial") || a.eventType.toLowerCase().includes("face") || a.identityStatus === "unidentified";
    const isAnpr = a.eventType.includes("ANPR") || a.objectClass === "Vehicle";
    const isPerimeter = a.objectClass === "Person" || a.objectClass === "Weapon" || a.objectClass === "Drone";

    let matchCategory = true;
    if (categoryFilter === "OPEN") matchCategory = a.status === "open";
    else if (categoryFilter === "POI") matchCategory = isPoi;
    else if (categoryFilter === "ANPR") matchCategory = isAnpr;
    else if (categoryFilter === "PERIMETER") matchCategory = isPerimeter && !isPoi;

    return matchSearch && matchCategory;
  });

  const activeNodeAlert = (selectedAlert && alerts.find((alert) => alert.id === selectedAlert.id)) || filteredAlerts[0] || null;
  const linkedGuard = activeNodeAlert
    ? guards.find((g) => g.id === activeNodeAlert.assignedGuardId) || guards.find((g) => g.currentSector === activeNodeAlert.sector)
    : null;
  const canDispatch = authSession?.tier === "admin" || authSession?.tier === "command";

  const handleDispatch = async () => {
    const selectedGuardId = dispatchGuardId || activeNodeAlert?.assignedGuardId || "";
    if (!activeNodeAlert || !selectedGuardId) return;
    setIsDispatching(true);
    setDispatchError("");
    try {
      const response = await dispatchAlert(activeNodeAlert.id, selectedGuardId, authSession?.name);
      setDispatchOtp(response?.dispatchOtp || null);
      setDispatchOtpInput("");
      setDispatchOtpError("");
      setDispatchGuardId("");
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : "Could not dispatch guard.");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleResendSms = async () => {
    if (!activeNodeAlert) return;
    setIsResendingSms(true);
    setDispatchError("");
    try {
      const response = await backendApi.resendDispatchSms(activeNodeAlert.id);
      setDispatchOtp(response.dispatchOtp);
      setDispatchOtpInput("");
      setDispatchOtpError("");
      await hydrateFromBackend();
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : "Could not resend dispatch SMS.");
    } finally {
      setIsResendingSms(false);
    }
  };

  const handleVerifyDispatchOtp = async () => {
    if (!activeNodeAlert || !dispatchOtp?.challengeId || !activeNodeAlert.assignedGuardId) return;
    setIsVerifyingDispatchOtp(true);
    setDispatchOtpError("");
    try {
      await backendApi.verifyDispatchOtp(activeNodeAlert.id, dispatchOtp.challengeId, activeNodeAlert.assignedGuardId, dispatchOtpInput);
      setDispatchOtp((current) => current ? { ...current, status: "verified", message: "Guard dispatch verified." } : current);
      setDispatchOtpInput("");
      await hydrateFromBackend();
    } catch (error) {
      setDispatchOtpError(error instanceof Error ? error.message : "Guard OTP verification failed.");
    } finally {
      setIsVerifyingDispatchOtp(false);
    }
  };

  const handleMarkPotentialMatch = async () => {
    if (!activeNodeAlert || !reviewProfileId) return;
    setIsMarkingPotentialMatch(true);
    setReviewError("");
    setReviewSuccess("");
    try {
      const profile = demoProfiles.find((item) => item.id === reviewProfileId);
      await backendApi.markPotentialMatch(activeNodeAlert.id, reviewProfileId);
      setReviewSuccess(`Manual review recorded // ${profile?.displayName || reviewProfileId}.`);
      await hydrateFromBackend();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not record manual review.");
    } finally {
      setIsMarkingPotentialMatch(false);
    }
  };

  const exportRows = () => [
    ["Incident ID", "Date (IST)", "Time (IST)", "Severity", "Status", "Event", "Camera ID", "Sector", "Plate Number", "Assigned Guard", "SMS Status"],
    ...filteredAlerts.map((alert) => {
      const severity = alertSeverityLabel(alert).toUpperCase();
      const status = alert.status === "resolved" ? "RESOLVED" : alert.status === "acknowledged" ? "ACKNOWLEDGED" : "OPEN";
      return [alert.id, formatDateIST(alert.timestamp), formatTimeIST(alert.timestamp), severity, status, alert.eventType, alert.sourceCameraId, alert.sector, alert.plateNumber || "—", alert.assignedGuardName || "Unassigned", alert.smsStatus || "Not sent"];
    }),
  ];

  const downloadFile = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = exportRows().map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    downloadFile(`\uFEFF${csv}`, `sentrix-alert-report-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  };

  const exportColoredSheet = () => {
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] || character));
    const headers = exportRows()[0];
    const body = filteredAlerts.map((alert) => {
      const color = alertColorFor(alert);
      const values = exportRows().find((row) => row[0] === alert.id) || [];
      return `<tr style="background:${color.hex};color:#fff;font-weight:700">${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sentrix Alert Report</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:28px}h1{font-size:18px;margin-bottom:6px}p{font-size:12px;color:#475569}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#172033;color:#fff;white-space:nowrap}td{color:#fff}tr{print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body><h1>Sentrix Alert Report</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}. Each incident row is filled with its severity/status colour.</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    downloadFile(html, `sentrix-incidents-coloured-${new Date().toISOString().slice(0, 10)}.html`, "text/html;charset=utf-8");
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header Banner */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#DC2626] text-white flex items-center justify-center font-bold">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              EVIDENCE VAULT // INCIDENT_DOSSIER
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Cryptographic threat registry, operator-reviewed face detections, and ANPR vehicle matching.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="text-[#991B1B] font-bold bg-[#FEE2E2] px-3 py-1 border border-[#FCA5A5]">
            {alerts.filter((a) => a.status === "open").length} UNRESOLVED_INCIDENTS
          </span>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredAlerts.length === 0}
            className="flex items-center gap-1.5 border border-[#CBDCEB] bg-[#F0F6FC] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#0369A1] hover:bg-[#E0F2FE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> EXPORT CSV
          </button>
          <button
            type="button"
            onClick={exportColoredSheet}
            disabled={filteredAlerts.length === 0}
            title="Download a report with visible alert colour fills"
            className="flex items-center gap-1.5 border border-[#CBDCEB] bg-[#FFFFFF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Palette className="h-3.5 w-3.5" /> COLOURED SHEET
          </button>
        </div>
      </div>

      {/* Query Parameters / Search Interface */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] p-4 space-y-3 shadow-sm">
        <div className="text-[10px] text-[#475569] uppercase tracking-widest font-bold">
          QUERY_PARAMETERS & FILTERS
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "ALL", label: `ALL (${alerts.length})` },
            { key: "OPEN", label: `OPEN ONLY (${alerts.filter((a) => a.status === "open").length})` },
            { key: "PERIMETER", label: "PERIMETER & INTRUSION" },
            { key: "POI", label: "POI & FACE REVIEWS" },
            { key: "ANPR", label: "VEHICLES & ANPR" },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => {
                tacticalSound.playClick();
                setCategoryFilter(chip.key as any);
              }}
              className={`px-3.5 py-1.5 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
                categoryFilter === chip.key
                  ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                  : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by incident ID, suspect, plate number, or sector..."
            className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none py-2.5 pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
          />
        </div>
      </div>

      {/* Active Evidence Node Inspector */}
      {activeNodeAlert && (
        <section className="border border-[#CBDCEB] bg-[#FFFFFF] shadow-sm">
          <div className="px-4 py-2.5 bg-[#F0F6FC] border-b border-[#CBDCEB] flex items-center justify-between">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              ACTIVE_EVIDENCE_NODE: {activeNodeAlert.id}
            </span>
            <div className="flex items-center gap-2">
              <StatusPill type={activeNodeAlert.level} size="sm" />
              <StatusPill type={activeNodeAlert.status} size="sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#CBDCEB]">
            {/* Image Panel - Full Natural Color */}
            <div className="lg:col-span-8 bg-[#0B1320] relative aspect-video flex items-center justify-center overflow-hidden">
              <img
                src={evidenceSource(activeNodeAlert.evidenceUrl)}
                alt="Surveillance Evidence Still"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
                <span className="bg-[#0284C7] text-white font-mono text-[10px] px-2 py-0.5 uppercase font-bold tracking-widest shadow-sm">
                  VERIFIED_CAPTURE
                </span>
                <span className="font-mono text-[10px] text-white bg-[#0F172A]/90 px-2 py-0.5 border border-[#38BDF8]/40">
                  {activeNodeAlert.sourceCameraId} // {activeNodeAlert.sector}
                </span>
              </div>
              <div className="absolute bottom-3 right-3 z-10 text-right font-mono text-[10px] text-white bg-[#0F172A]/85 p-2 border border-[#38BDF8]/30">
                <div>REC: {formatDateIST(activeNodeAlert.timestamp)} {formatTimeIST(activeNodeAlert.timestamp)}</div>
                <div className="text-[#38BDF8] font-bold">CONFIDENCE: {activeNodeAlert.confidence}%</div>
              </div>
            </div>

            {/* Data & Actions Panel */}
            <div className="lg:col-span-4 bg-[#FFFFFF] p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">EVENT_TYPE</div>
                  <div className="text-sm font-bold text-[#0F172A]">{activeNodeAlert.eventType}</div>
                </div>

                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">SECTOR_CLASSIFICATION</div>
                  <div className="text-xs text-[#475569] font-bold">{activeNodeAlert.sector} // {activeNodeAlert.objectClass}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-b border-[#CBDCEB] pb-2 text-[10px]">
                  <div><span className="block uppercase text-[#64748B]">PLATE / WATCHLIST</span><strong className="text-[#0F172A]">{activeNodeAlert.plateNumber || "NONE"}</strong></div>
                  <div><span className="block uppercase text-[#64748B]">DISPATCH</span><strong className="text-[#0F172A]">{activeNodeAlert.dispatchStatus || "UNASSIGNED"}</strong></div>
                </div>

                <div className="border-b border-[#CBDCEB] pb-2">
                  <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5 font-bold">OPERATOR_LOG</div>
                  <p className="text-xs text-[#475569] font-sans leading-relaxed">{activeNodeAlert.notes}</p>
                </div>

                {activeNodeAlert.identityStatus === "unidentified" && (
                  <div className="border border-[#FCD34D] bg-[#FFFBEB] p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">IDENTITY REVIEW REQUIRED</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#78350F]">Face detection found an unidentified face. No automatic identity match was performed.</p>
                    {activeNodeAlert.reviewStatus === "potential_match" ? (
                      <div className="mt-2 border border-[#86EFAC] bg-[#F0FDF4] px-2 py-1.5 text-[10px] font-bold text-[#166534]">
                        POTENTIAL MATCH MARKED MANUALLY: {activeNodeAlert.reviewProfileLabel || "PROFILE"}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <select value={reviewProfileId} onChange={(event) => setReviewProfileId(event.target.value)} className="w-full border border-[#FCD34D] bg-[#FFFFFF] px-2 py-2 text-[10px] font-bold text-[#0F172A]">
                          <option value="">SELECT CONSENTED PROFILE</option>
                          {demoProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} // {profile.qrCode}</option>)}
                        </select>
                        <button type="button" onClick={() => void handleMarkPotentialMatch()} disabled={!reviewProfileId || isMarkingPotentialMatch} className="w-full border border-[#D97706] bg-[#D97706] px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-[#B45309] disabled:cursor-not-allowed disabled:opacity-40">
                          {isMarkingPotentialMatch ? "RECORDING REVIEW" : "MARK POTENTIAL MATCH"}
                        </button>
                      </div>
                    )}
                    {reviewError && <div className="mt-2 text-[10px] font-bold text-[#B91C1C]">{reviewError}</div>}
                    {reviewSuccess && <div className="mt-2 text-[10px] font-bold text-[#166534]">{reviewSuccess}</div>}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-[#CBDCEB] space-y-2">
                {activeNodeAlert.status === "open" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => acknowledgeAlert(activeNodeAlert.id)}
                      className="py-2.5 px-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ACKNOWLEDGE</span>
                    </button>
                    <button
                      onClick={() => escalateAlert(activeNodeAlert.id)}
                      className="py-2.5 px-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>ESCALATE (QRF)</span>
                    </button>
                  </div>
                ) : activeNodeAlert.status === "resolved" ? (
                  <div className="text-xs text-[#166534] p-2 bg-[#DCFCE7] border border-[#86EFAC] font-bold">
                    RESOLVED BY: <strong>{activeNodeAlert.acknowledgedBy || "OPERATOR"}</strong>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => resolveAlert(activeNodeAlert.id)}
                      className="flex items-center justify-center gap-1.5 bg-[#16A34A] px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-[#15803D]"
                    >
                      <CheckCircle2 className="h-4 w-4" /> RESOLVE
                    </button>
                    <button
                      type="button"
                      onClick={() => openIncidentReport(activeNodeAlert, linkedGuard)}
                      className="flex items-center justify-center gap-1.5 border border-[#CBDCEB] bg-[#F0F6FC] px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0369A1] hover:bg-[#E0F2FE]"
                    >
                      <FileText className="h-4 w-4" /> REPORT
                    </button>
                  </div>
                )}

                {canDispatch && activeNodeAlert.status !== "resolved" && (
                  <div className="border border-[#CBDCEB] bg-[#F0F6FC] p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#475569]"><Radio className="h-3.5 w-3.5 text-[#0284C7]" /> GUARD DISPATCH</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select value={dispatchGuardId || activeNodeAlert.assignedGuardId || ""} onChange={(event) => setDispatchGuardId(event.target.value)} className="min-w-0 flex-1 border border-[#CBDCEB] bg-[#FFFFFF] px-2 py-2 text-[10px] font-bold text-[#0F172A]">
                        <option value="">SELECT GUARD</option>
                        {guards.map((guard) => <option key={guard.id} value={guard.id}>{guard.name} // {guard.currentSector || "UNASSIGNED"}</option>)}
                      </select>
                      <button type="button" onClick={() => void handleDispatch()} disabled={!dispatchGuardId && !activeNodeAlert.assignedGuardId || isDispatching} className="flex items-center justify-center gap-1.5 bg-[#D97706] px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-[#B45309] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-3.5 w-3.5" /> {isDispatching ? "SENDING" : "DISPATCH"}</button>
                    </div>
                    {dispatchError && <div className="mt-2 text-[10px] font-bold text-[#B91C1C]">{dispatchError}</div>}
                    {activeNodeAlert.assignedGuardId && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#CBDCEB] pt-2 text-[10px]">
                        <span className={activeNodeAlert.smsStatus === "sent" ? "font-bold text-[#166534]" : "font-bold text-[#B91C1C]"}>
                          EXOTEL SMS: {(activeNodeAlert.smsStatus || "NOT SENT").toUpperCase()}
                        </span>
                        <button type="button" onClick={() => void handleResendSms()} disabled={isResendingSms} className="inline-flex items-center gap-1 border border-[#CBDCEB] bg-[#FFFFFF] px-2 py-1 font-bold uppercase text-[#0369A1] hover:bg-[#E0F2FE] disabled:opacity-50">
                          <RefreshCw className={`h-3 w-3 ${isResendingSms ? "animate-spin" : ""}`} /> RESEND SMS
                        </button>
                      </div>
                    )}
                    {dispatchOtp && activeNodeAlert.assignedGuardId && (
                      <div className="mt-2 border-t border-[#CBDCEB] pt-2 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase">
                          <span className={dispatchOtp.status === "verified" ? "text-[#166534]" : "text-[#0369A1]"}>
                            GUARD OTP: {dispatchOtp.status.replace("_", " ").toUpperCase()}
                          </span>
                          <span className="text-[#64748B]">{dispatchOtp.maskedPhone || "DELIVERY NOT CONFIGURED"}</span>
                        </div>
                        {process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true" && dispatchOtp.demoOtp && dispatchOtp.status === "demo_ready" && (
                          <div className="border border-[#FCD34D] bg-[#FFFBEB] px-2 py-1 text-[10px] font-bold text-[#92400E]">
                            DEMO OTP: {dispatchOtp.demoOtp} // configure Exotel for live delivery
                          </div>
                        )}
                        {dispatchOtp.status !== "verified" && dispatchOtp.challengeId && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              value={dispatchOtpInput}
                              onChange={(event) => setDispatchOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              placeholder="ENTER 6-DIGIT OTP"
                              aria-label="Guard dispatch verification OTP"
                              className="min-w-0 flex-1 border border-[#CBDCEB] bg-[#FFFFFF] px-2 py-2 text-[10px] font-bold tracking-[0.25em] text-[#0F172A]"
                            />
                            <button
                              type="button"
                              onClick={() => void handleVerifyDispatchOtp()}
                              disabled={dispatchOtpInput.length !== 6 || isVerifyingDispatchOtp}
                              className="border border-[#0284C7] bg-[#0284C7] px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-[#0369A1] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isVerifyingDispatchOtp ? "VERIFYING" : "VERIFY GUARD"}
                            </button>
                          </div>
                        )}
                        {dispatchOtpError && <div className="text-[10px] font-bold text-[#B91C1C]">{dispatchOtpError}</div>}
                      </div>
                    )}
                  </div>
                )}
                {!canDispatch && <div className="text-[9px] uppercase text-[#64748B]">Command or administrator tier required for guard dispatch.</div>}

                <button
                  type="button"
                  onClick={() => openIncidentReport(activeNodeAlert, linkedGuard)}
                  className="flex w-full items-center justify-center gap-1.5 border border-[#CBDCEB] bg-[#F0F6FC] py-2 text-xs font-bold uppercase tracking-wider text-[#0369A1] hover:bg-[#E0F2FE]"
                >
                  <FileText className="h-3.5 w-3.5" /> PRINT / SAVE PDF REPORT
                </button>

                <button
                  onClick={() => setSelectedAlert(activeNodeAlert)}
                  className="w-full py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  EXPAND FULL CRYPTO DOSSIER →
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Incident List */}
      <div className="space-y-2">
        <div className="text-[10px] text-[#475569] uppercase tracking-widest font-bold">
          INCIDENT_RECORDS_INDEX ({filteredAlerts.length})
        </div>

        <div className="divide-y divide-[#CBDCEB] border border-[#CBDCEB] bg-[#FFFFFF] shadow-sm">
          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No incident alerts match filter criteria.
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isSelected = alert.id === activeNodeAlert?.id;
              const isOpen = alert.status === "open";

              return (
                <div
                  key={alert.id}
                  onClick={() => {
                    tacticalSound.playClick();
                    setSelectedAlert(alert);
                  }}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? "bg-[#E0F2FE]" : "hover:bg-[#F8FBFE]"
                  }`}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="relative w-16 h-12 bg-[#0B1320] border border-[#CBDCEB] shrink-0 overflow-hidden">
                      <img src={evidenceSource(alert.evidenceUrl)} alt="Still" className="w-full h-full object-cover" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusPill type={alert.level} size="sm" />
                        <span className="text-xs font-bold text-[#0F172A]">{alert.id}</span>
                        <span className="text-[10px] text-[#64748B]">{formatTimeIST(alert.timestamp)}</span>
                      </div>
                      <h4 className="text-xs font-bold text-[#0F172A] truncate mt-0.5">
                        {alert.eventType}
                      </h4>
                      <p className="text-[11px] text-[#475569] font-sans truncate mt-0.5">
                        {alert.notes}
                      </p>
                      {alert.assignedGuardName && <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase text-[#D97706]"><Send className="h-3 w-3" /> DISPATCHED // {alert.assignedGuardName} // SMS {alert.smsStatus || "NOT SENT"}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-[10px] text-[#64748B] hidden sm:block">
                      <div>Cam: <strong className="text-[#0F172A]">{alert.sourceCameraId}</strong></div>
                      <div>Sec: <strong className="text-[#0F172A]">{alert.sector}</strong></div>
                    </div>

                    {isOpen ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeAlert(alert.id);
                        }}
                        className="px-3 py-1.5 bg-[#0284C7] text-white font-bold text-[10px] uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                      >
                        ACK
                      </button>
                    ) : (
                      <StatusPill type={alert.status} size="sm" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Incident Dossier Full Modal */}
      {selectedAlert && (
        <Modal
          isOpen={Boolean(selectedAlert)}
          onClose={() => setSelectedAlert(null)}
          title={`INCIDENT_DOSSIER // ${selectedAlert.id}`}
          subtitle={`${selectedAlert.sector} • ${formatDateIST(selectedAlert.timestamp)} ${formatTimeIST(selectedAlert.timestamp)}`}
          maxWidth="3xl"
        >
          <div className="space-y-4 font-mono text-xs text-[#0F172A]">
            <div className="flex items-center justify-between border-b border-[#CBDCEB] pb-2">
              <div className="flex items-center gap-2">
                <StatusPill type={selectedAlert.level} size="md" />
                <StatusPill type={selectedAlert.status} size="md" />
              </div>
              <span className="text-[#0284C7] font-bold">
                AI_CONFIDENCE: {selectedAlert.confidence}%
              </span>
            </div>

            <div className="relative aspect-video bg-[#0B1320] border border-[#CBDCEB] overflow-hidden">
              <img
                src={evidenceSource(selectedAlert.evidenceUrl)}
                alt="High-Res Evidence"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 text-[10px] bg-[#0F172A]/90 border border-[#38BDF8]/40 px-2 py-0.5 text-white">
                SOURCE: {selectedAlert.sourceCameraId}
              </div>
            </div>

            <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB] space-y-1">
              <h4 className="font-bold text-[#0F172A] text-sm uppercase">{selectedAlert.eventType}</h4>
              <p className="text-[#475569] font-sans text-xs leading-relaxed">{selectedAlert.notes}</p>
            </div>

            <BlockchainEvidenceCard alert={selectedAlert} />

            <div className="flex flex-wrap items-center justify-between gap-2 border border-[#CBDCEB] bg-[#F0F6FC] p-3 text-[10px]">
              <div><span className="block uppercase text-[#64748B]">EVIDENCE SOURCE</span><strong className="uppercase text-[#0F172A]">{selectedAlert.evidenceSource || "Recorded alert"}</strong></div>
              <button type="button" onClick={() => openIncidentReport(selectedAlert, linkedGuard)} className="flex items-center gap-1.5 border border-[#0284C7] bg-[#0284C7] px-3 py-1.5 font-bold uppercase text-white hover:bg-[#0369A1]"><FileText className="h-3.5 w-3.5" /> PRINT / SAVE PDF</button>
            </div>

            {linkedGuard && (
              <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                    ASSIGNED SENTRY (SECTOR {selectedAlert.sector}):
                  </span>
                  <span className="font-bold text-[#0F172A]">{linkedGuard.name} ({linkedGuard.callSign})</span>
                </div>
                <a
                  href={`tel:${linkedGuard.phone.replace(/\s+/g, "")}`}
                  className="px-3 py-1.5 bg-[#0284C7] text-white font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider hover:bg-[#0369A1] shadow-sm"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>CALL SENTRY</span>
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
