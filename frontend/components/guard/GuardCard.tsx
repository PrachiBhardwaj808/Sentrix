import React from "react";
import { Phone, Radio, AlertTriangle, Clock, MapPin, MessageSquare } from "lucide-react";
import { Guard } from "@/lib/types";
import { StatusPill } from "../shared/StatusPill";
import { calculateTimeRemaining } from "@/lib/utils";
import { tacticalSound } from "@/lib/sound";

interface GuardCardProps {
  guard: Guard;
  onFlagIncident?: (guard: Guard) => void;
  onMessage?: (guard: Guard) => void;
  className?: string;
}

export const GuardCard: React.FC<GuardCardProps> = ({
  guard,
  onFlagIncident,
  onMessage,
}) => {
  const countdown = calculateTimeRemaining(guard.shiftEnd);

  const handleCall = () => {
    tacticalSound.playClick();
  };

  return (
    <div className="relative bg-[#FFFFFF] border border-[#CBDCEB] rounded-none overflow-hidden flex flex-col font-mono transition-colors group shadow-sm">
      {/* Top Bar: Status & Sector */}
      <div className="px-3 py-2 bg-[#F0F6FC] border-b border-[#CBDCEB] flex items-center justify-between">
        <StatusPill type={guard.status} size="sm" />
        <span className="text-[10px] text-[#475569] font-bold truncate max-w-[140px]">
          {guard.currentSector || "RESERVE POOL"}
        </span>
      </div>

      {/* Main Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="flex items-start gap-3">
          {/* Avatar Photo - Natural Color (No Grayscale) */}
          <div className="relative w-12 h-12 bg-[#F1F5F9] border border-[#CBDCEB] shrink-0 overflow-hidden">
            <img
              src={guard.photoUrl}
              alt={guard.name}
              className="w-full h-full object-cover"
            />
            {guard.status === "unreachable" && (
              <div className="absolute inset-0 bg-[#DC2626]/80 flex items-center justify-center text-white">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
            )}
          </div>

          {/* Name & Designation */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-[#0F172A] truncate">
              {guard.name}
            </h4>
            <p className="text-[11px] text-[#475569] mt-0.5">{guard.rank}</p>
            <p className="text-[10px] text-[#0284C7] font-bold mt-0.5">
              ID: {guard.badgeId}
            </p>
          </div>
        </div>

        {/* Telemetry */}
        <div className="py-2 px-2.5 bg-[#F0F6FC] border border-[#CBDCEB] space-y-1 text-[11px]">
          <div className="flex items-center justify-between text-[#475569]">
            <span className="flex items-center gap-1 font-bold">
              <MapPin className="w-3 h-3 text-[#0284C7]" /> POST:
            </span>
            <span className="font-bold text-[#0F172A] truncate max-w-[140px]">
              {guard.currentPostId || "Unassigned"}
            </span>
          </div>

          <div className="flex items-center justify-between text-[#475569]">
            <span className="flex items-center gap-1 font-bold">
              <Radio className="w-3 h-3 text-[#0284C7]" /> CALLSIGN:
            </span>
            <span className="font-bold text-[#0284C7]">{guard.callSign}</span>
          </div>

          <div className="flex items-center justify-between text-[#475569]">
            <span className="flex items-center gap-1 font-bold">
              <Clock className="w-3 h-3 text-[#0284C7]" /> SHIFT:
            </span>
            <span className={countdown.isExpired ? "text-[#DC2626] font-bold" : "text-[#0F172A] font-bold"}>
              {countdown.text}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Footer */}
      <div className="px-3 py-2 bg-[#F0F6FC] border-t border-[#CBDCEB] grid grid-cols-3 gap-1.5">
        <a
          href={`tel:${guard.phone.replace(/\s+/g, "")}`}
          onClick={handleCall}
          className="py-1.5 px-2 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] text-[10px] font-bold flex items-center justify-center gap-1 uppercase tracking-wider transition-colors"
          title={`Call ${guard.phone}`}
        >
          <Phone className="w-3 h-3 text-[#0284C7]" />
          <span>CALL</span>
        </a>

        <button
          onClick={() => onMessage && onMessage(guard)}
          className="py-1.5 px-2 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#475569] hover:text-[#0F172A] border border-[#CBDCEB] text-[10px] font-bold flex items-center justify-center gap-1 uppercase tracking-wider transition-colors"
          title="Send Radio Ping"
        >
          <MessageSquare className="w-3 h-3 text-[#0284C7]" />
          <span>PING</span>
        </button>

        <button
          onClick={() => onFlagIncident && onFlagIncident(guard)}
          className="py-1.5 px-2 bg-[#FEE2E2] hover:bg-[#DC2626] text-[#991B1B] hover:text-white border border-[#FCA5A5] text-[10px] flex items-center justify-center gap-1 font-bold uppercase tracking-wider transition-colors"
          title="Flag Alert"
        >
          <AlertTriangle className="w-3 h-3" />
          <span>FLAG</span>
        </button>
      </div>
    </div>
  );
};
