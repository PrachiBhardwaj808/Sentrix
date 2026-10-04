import React from "react";
import { AttendanceRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttendanceHeatmapProps {
  records: AttendanceRecord[];
  className?: string;
}

export const AttendanceHeatmap: React.FC<AttendanceHeatmapProps> = ({ records, className }) => {
  const statusColors = {
    present: "bg-[#DCFCE7] border-[#86EFAC] text-[#166534]",
    late: "bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]",
    absent: "bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]",
    leave: "bg-[#F1F5F9] border-[#CBD5E1] text-[#64748B]",
    swap: "bg-[#E0F2FE] border-[#BAE6FD] text-[#0369A1]",
  };

  const total = records.length;
  const presentCount = records.filter((r) => r.status === "present" || r.status === "swap").length;
  const lateCount = records.filter((r) => r.status === "late").length;
  const attendanceRate = total > 0 ? (((presentCount + lateCount) / total) * 100).toFixed(1) : "100";

  return (
    <div className={cn("p-4 bg-[#FFFFFF] border border-[#CBDCEB] rounded-none font-mono shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-widest">
            30-DAY OPERATIONAL ATTENDANCE HEATMAP
          </h4>
          <p className="text-[10px] text-[#475569] mt-0.5 font-sans">
            Historical sentry post fulfillment and duty punctuality records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#475569] font-bold uppercase">COMPLIANCE:</span>
          <span className="text-xs font-bold text-white bg-[#0284C7] px-2.5 py-0.5 rounded-none shadow-sm">
            {attendanceRate}%
          </span>
        </div>
      </div>

      {/* Grid of 30 days */}
      <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 gap-1.5 py-2">
        {records.map((r, idx) => {
          const dayNum = idx + 1;
          return (
            <div
              key={idx}
              className={cn(
                "h-8 rounded-none border flex flex-col items-center justify-center p-1 transition-colors cursor-pointer group relative font-bold text-[10px]",
                statusColors[r.status]
              )}
              title={`${r.date}: ${r.status.toUpperCase()} (${r.hours} hrs on post)`}
            >
              <span>{dayNum}</span>
              <span className="text-[7px] font-mono leading-none opacity-80 uppercase">
                {r.status[0]}
              </span>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#0F172A] border border-[#CBDCEB] text-white text-[9px] rounded-none whitespace-nowrap hidden group-hover:block z-20 pointer-events-none shadow-md">
                {r.date} • {r.status.toUpperCase()} ({r.hours}h)
              </div>
            </div>
          );
        })}
      </div>

      {/* Heatmap Legend */}
      <div className="flex flex-wrap items-center gap-3 pt-3 mt-2 border-t border-[#CBDCEB] text-[10px] text-[#475569]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#DCFCE7] border border-[#86EFAC]" />
          <span>Present (P)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#FEF3C7] border border-[#FCD34D]" />
          <span>Late Shift (L)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#E0F2FE] border border-[#BAE6FD]" />
          <span>Shift Swap (S)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#F1F5F9] border border-[#CBDCEB]" />
          <span>Approved Leave (V)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#FEE2E2] border border-[#FCA5A5]" />
          <span>Absent (A)</span>
        </div>
      </div>
    </div>
  );
};
