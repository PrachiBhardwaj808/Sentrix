import React from "react";
import { cn } from "@/lib/utils";

export interface BoundingBox {
  id: string;
  label: string;
  confidence: number;
  type: "person" | "vehicle" | "weapon" | "drone";
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

interface BoundingBoxOverlayProps {
  boxes: BoundingBox[];
  className?: string;
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({ boxes, className }) => {
  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}>
      {boxes.map((box) => {
        const isCritical = box.type === "weapon" || box.confidence > 92;
        const colorBorder = isCritical
          ? "border-[#DC2626]"
          : "border-[#38BDF8]";
        const colorTag = isCritical ? "bg-[#DC2626] text-white" : "bg-[#0284C7] text-white font-bold";

        return (
          <div
            key={box.id}
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
            className={cn("absolute border-2 transition-all duration-150 rounded-none", colorBorder)}
          >
            {/* Label Tag */}
            <div
              className={cn(
                "absolute -top-5 left-0 px-1.5 py-0.5 text-[9px] font-mono tracking-wider whitespace-nowrap uppercase flex items-center gap-1 rounded-none shadow-sm",
                colorTag
              )}
            >
              <span>{box.label}</span>
              <span className="font-mono">[{box.confidence.toFixed(0)}%]</span>
            </div>

            {/* Subtle Crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 pointer-events-none opacity-60">
              <div className="w-full h-px bg-[#38BDF8] absolute top-1/2 -translate-y-1/2" />
              <div className="h-full w-px bg-[#38BDF8] absolute left-1/2 -translate-x-1/2" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
