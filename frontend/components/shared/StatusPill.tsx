import React from "react";
import { cn } from "@/lib/utils";

export type StatusPillType =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "on_post"
  | "patrolling"
  | "break"
  | "unreachable"
  | "off_duty"
  | "online"
  | "offline"
  | "signal_lost"
  | "blacklisted"
  | "authorized"
  | "suspicious"
  | "resolved"
  | "dispatched"
  | "flagged";

interface StatusPillProps {
  type: StatusPillType | string;
  label?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  type,
  label,
  size = "md",
  pulse,
  className,
}) => {
  const normalizedType = type.toLowerCase().replace(/\s+/g, "_");

  let colorClasses = "bg-[#F1F6FB] text-[#475569] border-[#CBDCEB]";
  let dotClass = "bg-[#64748B]";
  let displayLabel = label || type.toUpperCase().replace(/_/g, " ");
  let shouldPulse = pulse;

  switch (normalizedType) {
    case "critical":
    case "signal_lost":
    case "blacklisted":
    case "unreachable":
      colorClasses = "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]";
      dotClass = "bg-[#DC2626]";
      shouldPulse = shouldPulse ?? true;
      if (normalizedType === "signal_lost") displayLabel = label || "SIGNAL LOST";
      break;

    case "high":
    case "break":
    case "suspicious":
    case "flagged":
      colorClasses = "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]";
      dotClass = "bg-[#D97706]";
      if (normalizedType === "high") displayLabel = label || "HIGH";
      break;

    case "medium":
    case "patrolling":
    case "elevated":
    case "dispatched":
      colorClasses = "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]";
      dotClass = "bg-[#0284C7]";
      if (normalizedType === "patrolling") displayLabel = label || "PATROLLING";
      if (normalizedType === "dispatched") displayLabel = label || "DISPATCHED";
      break;

    case "online":
    case "on_post":
    case "authorized":
    case "low":
      colorClasses = "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]";
      dotClass = "bg-[#16A34A]";
      if (normalizedType === "on_post") displayLabel = label || "ON POST";
      if (normalizedType === "online") displayLabel = label || "ONLINE";
      break;

    case "resolved":
      colorClasses = "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]";
      dotClass = "bg-[#16A34A]";
      displayLabel = label || "RESOLVED";
      break;

    case "offline":
    case "off_duty":
      colorClasses = "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]";
      dotClass = "bg-[#94A3B8]";
      if (normalizedType === "off_duty") displayLabel = label || "OFF DUTY";
      break;
  }

  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 tracking-wider font-mono",
    md: "text-xs px-2.5 py-1 tracking-wider font-mono",
    lg: "text-xs px-3.5 py-1.5 tracking-widest font-mono",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-bold rounded-none border uppercase transition-colors select-none",
        sizeClasses,
        colorClasses,
        className
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full shrink-0",
          size === "sm" ? "w-1.5 h-1.5" : size === "md" ? "w-2 h-2" : "w-2.5 h-2.5",
          dotClass,
          shouldPulse && "animate-pulse"
        )}
      />
      <span>{displayLabel}</span>
    </span>
  );
};
