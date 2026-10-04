import React, { useState } from "react";
import { Modal } from "../shared/Modal";
import { TacticalButton } from "../shared/TacticalButton";
import { Guard } from "@/lib/types";
import { CheckSquare, Square, ShieldCheck } from "lucide-react";
import { tacticalSound } from "@/lib/sound";

interface ShiftHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  guards: Guard[];
  onExecuteHandover: (
    postId: string,
    outgoingGuardId: string,
    incomingGuardId: string,
    notes: string
  ) => void;
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({
  isOpen,
  onClose,
  guards,
  onExecuteHandover,
}) => {
  const activeGuards = guards.filter((g) => g.status === "on_post" || g.status === "patrolling");
  const offDutyGuards = guards.filter((g) => g.status === "off_duty" || g.status === "break");

  const [outgoingId, setOutgoingId] = useState<string>(activeGuards[0]?.id || "");
  const [incomingId, setIncomingId] = useState<string>(offDutyGuards[0]?.id || "");
  const [notes, setNotes] = useState<string>("");
  const [checklist, setChecklist] = useState({
    weaponVerified: true,
    sensorsChecked: true,
    openIncidentsBriefed: true,
    radioChannelTested: true,
  });

  const selectedOutgoing = guards.find((g) => g.id === outgoingId);

  const toggleCheck = (key: keyof typeof checklist) => {
    tacticalSound.playClick();
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outgoingId || !incomingId) return;

    const postId = selectedOutgoing?.currentPostId || "POST-A1-MAIN";
    onExecuteHandover(postId, outgoingId, incomingId, notes || "Routine shift turnover executed smoothly.");
    onClose();
  };

  const allChecked = Object.values(checklist).every(Boolean);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="POST SHIFT TURNOVER & HANDOVER"
      subtitle="Formal Human Accountability Transfer Protocol"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs text-[#0F172A]">
        {/* Outgoing vs Incoming Guard Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#F0F6FC] border border-[#CBDCEB]">
          {/* Outgoing */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block">
              OUTGOING SENTRY
            </label>
            <select
              value={outgoingId}
              onChange={(e) => setOutgoingId(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-2 text-xs text-[#0F172A] focus:border-[#0284C7] font-mono font-bold"
            >
              {activeGuards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.currentPostId || g.currentSector})
                </option>
              ))}
            </select>
            {selectedOutgoing && (
              <div className="text-[10px] text-[#64748B] mt-1">
                Post: <span className="text-[#0F172A] font-semibold">{selectedOutgoing.currentPostId}</span> • Callsign: {selectedOutgoing.callSign}
              </div>
            )}
          </div>

          {/* Incoming */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block">
              INCOMING SENTRY
            </label>
            <select
              value={incomingId}
              onChange={(e) => setIncomingId(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-2 text-xs text-[#0F172A] focus:border-[#0284C7] font-mono font-bold"
            >
              {offDutyGuards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (Callsign: {g.callSign})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="space-y-2 p-3 bg-[#F0F6FC] border border-[#CBDCEB]">
          <span className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block mb-1">
            MANDATORY TURNOVER CHECKLIST
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: "weaponVerified", label: "Weapons & Ammo Accounted" },
              { key: "sensorsChecked", label: "Breakbeams & CCTV Clear" },
              { key: "openIncidentsBriefed", label: "Open Threat Log Briefed" },
              { key: "radioChannelTested", label: "Radio Channel Frequency OK" },
            ].map(({ key, label }) => {
              const isChecked = checklist[key as keyof typeof checklist];
              return (
                <div
                  key={key}
                  onClick={() => toggleCheck(key as keyof typeof checklist)}
                  className="flex items-center gap-2 cursor-pointer p-2 bg-[#FFFFFF] border border-[#CBDCEB] text-xs hover:border-[#0284C7]"
                >
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-[#0284C7]" />
                  ) : (
                    <Square className="w-4 h-4 text-[#94A3B8]" />
                  )}
                  <span className={isChecked ? "text-[#0F172A] font-bold" : "text-[#64748B]"}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Turnover Log Note */}
        <div>
          <label className="text-[10px] text-[#475569] font-bold uppercase tracking-widest block mb-1">
            HANDOVER LOG NOTE:
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. All clear, zero line calm, weather foggy."
            className="w-full bg-[#F8FAFC] border border-[#CBDCEB] rounded-none p-2.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0284C7] font-mono"
          />
        </div>

        <div className="pt-3 flex items-center justify-between border-t border-[#CBDCEB]">
          <div className="text-[10px] text-[#64748B] flex items-center gap-1.5 font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>IMMUTABLE AUDIT ENTRY WILL BE LOGGED</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#F0F6FC] text-[#475569] hover:text-[#0F172A] border border-[#CBDCEB] text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <TacticalButton
              variant="primary"
              size="md"
              type="submit"
              disabled={!outgoingId || !incomingId || !allChecked}
              className="font-bold shadow-sm"
            >
              EXECUTE HANDOVER
            </TacticalButton>
          </div>
        </div>
      </form>
    </Modal>
  );
};
