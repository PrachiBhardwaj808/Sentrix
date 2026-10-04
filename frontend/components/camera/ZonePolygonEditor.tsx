import React, { useState, useRef } from "react";
import { Point2D } from "@/lib/types";
import { TacticalButton } from "../shared/TacticalButton";
import { Save, RotateCcw, Trash2, CheckCircle2 } from "lucide-react";
import { tacticalSound } from "@/lib/sound";

interface ZonePolygonEditorProps {
  initialPolygon: Point2D[];
  cameraId: string;
  cameraName: string;
  onCommit: (polygon: Point2D[]) => void;
}

export const ZonePolygonEditor: React.FC<ZonePolygonEditorProps> = ({
  initialPolygon,
  cameraId,
  onCommit,
}) => {
  const [polygon, setPolygon] = useState<Point2D[]>(initialPolygon || []);
  const [committedSuccess, setCommittedSuccess] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    tacticalSound.playClick();
    setPolygon((prev) => [...prev, { x, y }]);
    setCommittedSuccess(false);
  };

  const handleReset = () => {
    tacticalSound.playClick();
    setPolygon([
      { x: 15, y: 25 },
      { x: 85, y: 25 },
      { x: 90, y: 85 },
      { x: 10, y: 85 },
    ]);
    setCommittedSuccess(false);
  };

  const handleClear = () => {
    tacticalSound.playClick();
    setPolygon([]);
    setCommittedSuccess(false);
  };

  const handleCommit = () => {
    tacticalSound.playAlert();
    onCommit(polygon);
    setCommittedSuccess(true);
    setTimeout(() => setCommittedSuccess(false), 3000);
  };

  const pointsString = polygon.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-3 font-mono">
      {/* Canvas Area */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative w-full aspect-video bg-[#0B1320] border border-[#CBDCEB] rounded-none cursor-crosshair overflow-hidden select-none shadow-sm"
      >
        <div className="absolute top-2 left-2 z-10 text-[10px] bg-[#0F172A]/90 border border-[#38BDF8]/40 px-2 py-1 text-white">
          DETECTION_ZONE_GEOFENCE: {cameraId}
        </div>

        {/* SVG Polygon Layer */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {polygon.length > 2 && (
            <polygon
              points={pointsString}
              className="fill-[#0284C7]/30 stroke-[#38BDF8] stroke-[1]"
            />
          )}

          {polygon.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r="1.8"
                className="fill-[#0284C7] stroke-white stroke-[0.6]"
              />
              <text
                x={p.x + 2.5}
                y={p.y + 2.5}
                fill="#38BDF8"
                fontSize="4.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                P{idx + 1}
              </text>
            </g>
          ))}
        </svg>

        <div className="absolute bottom-2 right-2 text-[10px] text-[#BAE6FD] bg-[#0F172A]/90 px-2 py-1 border border-[#38BDF8]/30">
          CLICK TO ADD VERTEX // {polygon.length} VERTICES
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <TacticalButton
            variant="secondary"
            size="sm"
            onClick={handleReset}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            DEFAULT QUAD
          </TacticalButton>
          <TacticalButton
            variant="outline"
            size="sm"
            onClick={handleClear}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            CLEAR
          </TacticalButton>
        </div>

        <div className="flex items-center gap-2">
          {committedSuccess && (
            <span className="text-[10px] text-[#16A34A] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> GEOFENCE COMMITTED
            </span>
          )}
          <TacticalButton
            variant="primary"
            size="sm"
            onClick={handleCommit}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            COMMIT GEOFENCE
          </TacticalButton>
        </div>
      </div>
    </div>
  );
};
