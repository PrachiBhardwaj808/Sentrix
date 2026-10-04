"use client";

import React, { useState } from "react";
import {
  Users,
  Phone,
  Search,
  Clock,
  MapPin,
  UserCheck,
} from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { Guard } from "@/lib/types";
import { StatusPill } from "@/components/shared/StatusPill";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { Modal } from "@/components/shared/Modal";
import { formatTimeIST, formatDateIST, calculateTimeRemaining } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";

export default function GuardDutyAndLogPage() {
  const {
    guards,
    activityLog,
    shifts,
    quickHandover,
  } = useIBVAPStore();

  const [activeTab, setActiveTab] = useState<"on_duty" | "log">("on_duty");

  // Tab 1 (On Duty) State: Fast Handover Modal
  const [handoverOutgoing, setHandoverOutgoing] = useState<Guard | null>(null);
  const [handoverIncomingId, setHandoverIncomingId] = useState<string>("");
  const [handoverNote, setHandoverNote] = useState<string>("");

  // Tab 2 (Log) State: Search & Date Filter
  const [searchLogQuery, setSearchLogQuery] = useState<string>("");
  const [logDateFilter, setLogDateFilter] = useState<string>("ALL");

  // Eligible replacement guards
  const offDutyGuards = guards.filter(
    (g) => g.status === "off_duty" || g.status === "break"
  );

  const activeOnDutyGuards = guards.filter(
    (g) => g.status === "on_post" || g.status === "patrolling" || g.status === "unreachable"
  );

  const handleOpenHandover = (guard: Guard) => {
    tacticalSound.playClick();
    setHandoverOutgoing(guard);
    setHandoverIncomingId(offDutyGuards[0]?.id || "");
    setHandoverNote("");
  };

  const handleCommitHandover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverOutgoing || !handoverIncomingId) return;

    quickHandover(handoverOutgoing.id, handoverIncomingId, handoverNote);
    setHandoverOutgoing(null);
  };

  // Filter activity logs
  const filteredLogs = activityLog.filter((log) => {
    const matchSearch =
      log.details.toLowerCase().includes(searchLogQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchLogQuery.toLowerCase()) ||
      log.actionType.toLowerCase().includes(searchLogQuery.toLowerCase());

    const isToday = log.timestamp.startsWith("2026-08-27");
    const isYesterday = log.timestamp.startsWith("2026-08-26");

    const matchDate =
      logDateFilter === "ALL" ||
      (logDateFilter === "TODAY" && isToday) ||
      (logDateFilter === "YESTERDAY" && isYesterday);

    return matchSearch && matchDate;
  });

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner with 2 Main Large Tabs */}
      <div className="bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
              GUARD DUTY ROSTER & AUDIT LOG
            </h1>
            <p className="text-[11px] text-[#475569] mt-0.5 font-sans">
              Live sentry post deployment, shift rotations, and immutable audit history.
            </p>
          </div>
        </div>

        {/* 2 Big Clear Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              tacticalSound.playClick();
              setActiveTab("on_duty");
            }}
            className={`px-4 py-2 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "on_duty"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            1. ON DUTY NOW ({activeOnDutyGuards.length})
          </button>

          <button
            onClick={() => {
              tacticalSound.playClick();
              setActiveTab("log");
            }}
            className={`px-4 py-2 rounded-none border text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === "log"
                ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm"
                : "bg-[#F0F6FC] text-[#475569] border-[#CBDCEB] hover:text-[#0F172A] hover:bg-[#E0F2FE]"
            }`}
          >
            2. ACTIVITY LOG ({activityLog.length})
          </button>
        </div>
      </div>

      {/* TAB 1: ON DUTY NOW */}
      {activeTab === "on_duty" && (
        <div className="space-y-6">
          {/* Sentry Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOnDutyGuards.map((guard) => {
              const countdown = calculateTimeRemaining(guard.shiftEnd);
              const isUnreachable = guard.status === "unreachable";

              return (
                <div
                  key={guard.id}
                  className={`p-5 rounded-none border font-mono flex flex-col justify-between space-y-4 shadow-sm ${
                    isUnreachable
                      ? "bg-[#FEE2E2] border-[#FCA5A5]"
                      : "bg-[#FFFFFF] border-[#CBDCEB]"
                  }`}
                >
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-[#0F172A] truncate block">
                        {guard.name}
                      </span>
                      <p className="text-xs text-[#475569] mt-0.5">
                        {guard.rank} // CALLSIGN: <strong className="text-[#0284C7]">{guard.callSign}</strong>
                      </p>
                    </div>
                    <StatusPill type={guard.status} size="md" />
                  </div>

                  {/* Middle Info */}
                  <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB] space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[#475569]">
                      <span className="font-bold flex items-center gap-1.5 uppercase">
                        <MapPin className="w-3.5 h-3.5 text-[#0284C7]" /> POST:
                      </span>
                      <span className="font-bold text-[#0F172A]">
                        {guard.currentPostId || "Sector Patrol"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[#475569]">
                      <span className="font-bold flex items-center gap-1.5 uppercase">
                        <Clock className="w-3.5 h-3.5 text-[#0284C7]" /> SHIFT REMAINING:
                      </span>
                      <span className={countdown.isExpired ? "text-[#DC2626] font-bold" : "text-[#0F172A] font-bold"}>
                        {countdown.text}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Call & Handover */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a
                      href={`tel:${guard.phone.replace(/\s+/g, "")}`}
                      onClick={() => tacticalSound.playClick()}
                      className="py-2.5 px-3 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] hover:border-[#0284C7] text-xs font-bold flex items-center justify-center gap-2 transition-colors rounded-none uppercase tracking-wider"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>CALL SENTRY</span>
                    </a>

                    <button
                      onClick={() => handleOpenHandover(guard)}
                      className="py-2.5 px-3 bg-[#0284C7] hover:bg-[#0369A1] text-white border border-[#0284C7] text-xs font-bold flex items-center justify-center gap-2 transition-colors rounded-none uppercase tracking-wider shadow-sm"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>HANDOVER</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming Rotations */}
          <div className="bg-[#FFFFFF] border border-[#CBDCEB] p-5 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase text-[#0F172A] tracking-widest">
              UPCOMING SHIFT ROTATIONS (NEXT 24 HOURS)
            </h3>
            <div className="divide-y divide-[#CBDCEB] border border-[#CBDCEB] bg-[#FFFFFF]">
              {shifts.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-[#F8FBFE]"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-3.5 h-3.5 text-[#0284C7]" />
                    <div>
                      <span className="font-bold text-[#0F172A]">{s.guardName}</span>
                      <span className="text-[#64748B] text-[10px] block">{s.sector}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[#0284C7] font-bold">{s.shiftName}</span>
                    <span className="text-[#64748B] text-[10px] block">{s.postId}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVITY LOG */}
      {activeTab === "log" && (
        <div className="space-y-4">
          {/* Search & Date Filter */}
          <div className="bg-[#FFFFFF] border border-[#CBDCEB] p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs shadow-sm">
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchLogQuery}
                onChange={(e) => setSearchLogQuery(e.target.value)}
                placeholder="Search log by guard name, action, or post..."
                className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none py-2 pl-9 pr-3 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest shrink-0">
                DATE:
              </span>
              <select
                value={logDateFilter}
                onChange={(e) => {
                  tacticalSound.playClick();
                  setLogDateFilter(e.target.value);
                }}
                className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none px-2.5 py-2 text-xs text-[#0F172A] focus:border-[#0284C7] font-mono font-bold"
              >
                <option value="ALL">ALL DATES</option>
                <option value="TODAY">TODAY</option>
                <option value="YESTERDAY">YESTERDAY</option>
              </select>
            </div>
          </div>

          {/* Reverse-Chronological List */}
          <div className="bg-[#FFFFFF] border border-[#CBDCEB] divide-y divide-[#CBDCEB] shadow-sm">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-[#64748B] text-xs">
                No activity logs match search query.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 hover:bg-[#F8FBFE] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="text-[11px] text-[#64748B] shrink-0 font-mono">
                      <span className="text-[#0F172A] font-bold block">{formatTimeIST(log.timestamp)}</span>
                      <span className="text-[10px] text-[#64748B]">{formatDateIST(log.timestamp)}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0F172A]">{log.actorName}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD] uppercase font-bold">
                          {log.sector}
                        </span>
                      </div>
                      <p className="text-[#475569] font-sans text-xs mt-1">
                        {log.details}
                      </p>
                    </div>
                  </div>

                  <div className="text-[10px] text-[#64748B] font-mono shrink-0 sm:text-right">
                    REF: <strong className="text-[#0284C7]">{log.targetId}</strong>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 1-Step Handover Modal */}
      {handoverOutgoing && (
        <Modal
          isOpen={Boolean(handoverOutgoing)}
          onClose={() => setHandoverOutgoing(null)}
          title="ONE-STEP SHIFT HANDOVER"
          subtitle={`Handover Post: ${handoverOutgoing.currentPostId || "Active Post"}`}
          maxWidth="md"
        >
          <form onSubmit={handleCommitHandover} className="space-y-4 font-mono text-xs text-[#0F172A]">
            <div className="p-3 bg-[#F0F6FC] border border-[#CBDCEB]">
              <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block mb-0.5">
                OUTGOING SENTRY:
              </span>
              <span className="font-bold text-[#0F172A] text-sm">
                {handoverOutgoing.name} ({handoverOutgoing.rank})
              </span>
            </div>

            <div>
              <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block mb-1">
                SELECT REPLACEMENT SENTRY:
              </label>
              <select
                required
                value={handoverIncomingId}
                onChange={(e) => setHandoverIncomingId(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none p-2.5 text-xs text-[#0F172A] font-bold focus:border-[#0284C7] font-mono"
              >
                {offDutyGuards.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.rank} • Callsign: {g.callSign})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block mb-1">
                TURNOVER NOTE (OPTIONAL):
              </label>
              <input
                type="text"
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="e.g. All clear, perimeter quiet, fog low."
                className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none p-2.5 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0284C7] font-mono"
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-[#CBDCEB]">
              <button
                type="button"
                onClick={() => setHandoverOutgoing(null)}
                className="px-4 py-2 bg-[#F0F6FC] text-[#475569] hover:text-[#0F172A] border border-[#CBDCEB] text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <TacticalButton
                variant="primary"
                size="md"
                type="submit"
                disabled={!handoverIncomingId}
                className="font-bold shadow-sm"
              >
                CONFIRM HANDOVER
              </TacticalButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
