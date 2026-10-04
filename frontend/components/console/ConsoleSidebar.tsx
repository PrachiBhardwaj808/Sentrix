import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  ShieldAlert,
  MapPin,
  Users,
  Sliders,
  BarChart3,
  ExternalLink,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { AuthSession, getAuthSession } from "@/lib/auth";

export const ConsoleSidebar: React.FC = () => {
  const pathname = usePathname();
  const { alerts, guards, cameras, currentUser } = useIBVAPStore();
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    setAuthSession(getAuthSession());
  }, []);

  const openAlertsCount = alerts.filter((a) => a.status === "open").length;
  const criticalCount = alerts.filter((a) => a.status === "open" && a.level === "critical").length;
  const onlineCameraCount = cameras.filter((camera) => camera.status === "online").length;
  const onDutyGuardCount = guards.filter((guard) => ["on_post", "patrolling", "unreachable"].includes(guard.status)).length;

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      desc: "Overview & Telemetry",
    },
    {
      name: "Live Cameras",
      href: "/live-feed",
      icon: Video,
      desc: `${cameras.length} active feeds`,
      badge: cameras.length > 0 ? `${onlineCameraCount} ONLINE` : undefined,
    },
    {
      name: "Alerts & Intel",
      href: "/alerts",
      icon: ShieldAlert,
      desc: "Threats & Evidence Vault",
      badge: openAlertsCount > 0 ? `${openAlertsCount} ACTIVE` : undefined,
      isCritical: criticalCount > 0,
    },
    {
      name: "Border Map",
      href: "/map",
      icon: MapPin,
      desc: "GIS & Sensor Radar",
    },
    {
      name: "Operations Analytics",
      href: "/analytics",
      icon: BarChart3,
      desc: "Readiness & Response",
    },
    {
      name: "Guard Duty & Log",
      href: "/guard-duty",
      icon: Users,
      desc: "Sentries & Handover",
      badge: guards.length > 0 ? `${onDutyGuardCount}/${guards.length} ON DUTY` : undefined,
    },
    {
      name: "Camera Settings",
      href: "/admin",
      icon: Sliders,
      desc: "Power & Sensitivity",
      adminOnly: true,
    },
  ].filter((item) => !item.adminOnly || authSession?.tier === "admin");

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#CBDCEB] flex flex-col shrink-0 select-none z-20 overflow-y-auto shadow-sm">
      {/* Platform Branding */}
      <div className="p-4 border-b border-[#CBDCEB] bg-[#F0F6FC]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0284C7] text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-mono text-xs font-bold tracking-widest text-[#0F172A] uppercase leading-none">
              S_COMMAND_01
            </h1>
            <p className="font-mono text-[10px] text-[#0284C7] font-semibold tracking-wider mt-1">
              SSB BORDERLENS OS
            </p>
          </div>
        </div>
      </div>

      {/* Sector / Operator Meta */}
      <div className="px-4 py-2.5 border-b border-[#CBDCEB] bg-[#EBF3FA] font-mono text-[10px] text-[#475569] flex justify-between items-center">
        <div>
          <span className="text-[#0F172A] font-bold block">SECTOR_NAV</span>
          <span>V_4.02.1</span>
        </div>
        <div className="text-right">
          <span className="text-[#0F172A] font-bold block">OPERATOR</span>
          <span className="text-[#0284C7] font-bold">{authSession?.operatorId || currentUser?.badgeId || "OP_01"}</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-3 space-y-1 font-mono">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-none font-mono text-xs uppercase tracking-wider transition-colors group",
                isActive
                  ? "bg-[#0284C7] text-white font-bold shadow-sm"
                  : "text-[#334E68] hover:text-[#0F172A] hover:bg-[#F0F6FC] border border-transparent hover:border-[#CBDCEB]"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <item.icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-white" : "text-[#64748B] group-hover:text-[#0284C7]"
                  )}
                />
                <div className="min-w-0">
                  <div className="truncate font-bold leading-tight">
                    {item.name}
                  </div>
                  <div
                    className={cn(
                      "text-[9px] truncate font-normal tracking-normal normal-case",
                      isActive ? "text-[#E0F2FE]" : "text-[#64748B]"
                    )}
                  >
                    {item.desc}
                  </div>
                </div>
              </div>

              {item.badge && (
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-none font-mono font-bold shrink-0 ml-1 border",
                    isActive
                      ? "bg-white text-[#0284C7] border-white"
                      : item.isCritical
                      ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                      : "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Public Portal Link */}
      <div className="p-3 border-t border-[#CBDCEB] bg-[#FFFFFF]">
        <Link
          href="/"
          className="flex items-center justify-between px-3 py-2 bg-[#F0F6FC] hover:bg-[#E0F2FE] text-[#334E68] hover:text-[#0F172A] border border-[#CBDCEB] font-mono text-xs transition-colors rounded-none"
        >
          <span className="flex items-center gap-2 font-bold uppercase tracking-wider">
            <ExternalLink className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>PUBLIC PORTAL</span>
          </span>
          <span className="text-[10px] text-[#64748B]">→</span>
        </Link>
      </div>
    </aside>
  );
};
