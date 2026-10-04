import React from "react";
import { AlertOctagon } from "lucide-react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { TacticalButton } from "../shared/TacticalButton";

export const LockdownOverlay: React.FC = () => {
  const { lockdownActive, abortLockdown, currentUser } = useIBVAPStore();

  if (!lockdownActive) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center p-6 bg-[#0F172A]/80 backdrop-blur-sm">
      {/* 1px border frame */}
      <div className="absolute inset-4 border border-[#FCA5A5] pointer-events-none" />

      {/* Center Alarm Modal */}
      <div className="relative max-w-xl w-full bg-[#FFFFFF] border-2 border-[#DC2626] rounded-none p-8 text-center z-10 font-mono shadow-2xl">
        <div className="inline-flex p-3 bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] mb-4">
          <AlertOctagon className="w-10 h-10" />
        </div>

        <h2 className="text-xl font-bold text-[#991B1B] uppercase tracking-widest leading-tight">
          SECURITY ALERT: GLOBAL LOCKDOWN
        </h2>
        <p className="text-xs text-[#DC2626] mt-2 tracking-wider font-bold">
          DEFCON 1 ACTIVE // AUTOMATED INTERCEPT & ZERO-LINE SEAL
        </p>

        <div className="my-6 p-4 bg-[#F8FAFC] border border-[#CBDCEB] text-xs text-[#0F172A] text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-[#475569]">COMMAND_AUTHOR:</span>
            <span className="font-bold text-[#0F172A]">{currentUser.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#475569]">CLEARANCE_BADGE:</span>
            <span className="font-bold text-[#0284C7]">{currentUser.badgeId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#475569]">PROTOCOL:</span>
            <span className="text-[#991B1B] font-bold">ZERO-LINE SEAL & QRF MOBILIZATION</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <TacticalButton
            variant="danger"
            size="lg"
            onClick={abortLockdown}
            className="w-full font-bold shadow-md"
          >
            DISARM & ABORT LOCKDOWN
          </TacticalButton>
        </div>
      </div>
    </div>
  );
};
