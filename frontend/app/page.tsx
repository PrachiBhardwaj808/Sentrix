"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  ArrowRight,
  MemoryStick,
  Anchor,
  Link as LinkIcon,
} from "lucide-react";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { getAuthSession } from "@/lib/auth";

export default function LandingPage() {
  const {
    alerts,
    cameras,
    sectors,
    guards,
    backendStatus,
    blockchainStatus,
    isHydrated,
    hydrateFromBackend,
    checkBackendHealth,
  } = useIBVAPStore();

  useEffect(() => {
    void (getAuthSession() ? hydrateFromBackend() : checkBackendHealth());
  }, [checkBackendHealth, hydrateFromBackend]);

  const onlineCameras = cameras.filter((camera) => camera.status === "online").length;
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;

  return (
    <div className="min-h-screen bg-[#EBF3FA] text-[#0F172A] flex flex-col font-mono selection:bg-[#0284C7] selection:text-white">
      {/* Top Docked Navigation */}
      <header className="bg-[#FFFFFF] border-b border-[#CBDCEB] sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#0284C7] text-white flex items-center justify-center font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <div className="font-bold text-xs tracking-widest text-[#0F172A] uppercase">
              S_COMMAND_01 // SENTRIX
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs tracking-widest uppercase text-[#475569]">
            <Link href="/live-feed" className="hover:text-[#0284C7] transition-colors">LIVE_FEED</Link>
            <Link href="/alerts" className="hover:text-[#0284C7] transition-colors">ARCHIVES</Link>
            <Link href="/dashboard" className="text-[#0284C7] border-b-2 border-[#0284C7] pb-0.5 font-bold">ANALYTICS</Link>
            <Link href="/map" className="hover:text-[#0284C7] transition-colors">NODES</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="text-xs text-[#475569] hover:text-[#0F172A] uppercase tracking-wider px-3 py-1.5 border border-transparent hover:border-[#CBDCEB]">
              SIGN_IN
            </Link>
            <Link href="/dashboard">
              <TacticalButton variant="primary" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                LAUNCH CONSOLE
              </TacticalButton>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-20 w-full border-b border-[#CBDCEB]">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#CBDCEB] bg-[#FFFFFF] text-[#0369A1] text-[10px] uppercase tracking-widest mb-6 shadow-sm">
            <span className={"w-2 h-2 rounded-full " + (backendStatus === "online" ? "bg-[#16A34A]" : "bg-[#64748B]")} />
            <span className="font-bold">DJANGO_API: {backendStatus.toUpperCase()} // BLOCKCHAIN: {blockchainStatus.connected ? "CONNECTED" : "STANDBY"}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[#0F172A] max-w-5xl leading-tight font-sans">
            AI GIS Intelligence for Safer Communities
          </h1>

          <p className="mt-6 text-base sm:text-lg text-[#334E68] max-w-3xl leading-relaxed font-sans font-normal">
            See risks, map impact, and respond faster with one decision-support platform that connects AI detection, geographic context, community reports, vulnerable populations, and nearby emergency resources.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/dashboard">
              <button className="bg-[#0284C7] hover:bg-[#0369A1] text-white font-mono text-xs uppercase font-bold tracking-widest px-8 py-3.5 transition-colors rounded-none shadow-sm">
                DEPLOY SYSTEM
              </button>
            </Link>
            <Link href="/live-feed">
              <button className="text-[#0369A1] border border-[#CBDCEB] hover:border-[#0284C7] font-mono text-xs uppercase font-bold tracking-widest px-8 py-3.5 transition-colors rounded-none bg-[#FFFFFF] shadow-sm">
                PREVIEW REAL CAMERA
              </button>
            </Link>
          </div>

          {/* Telemetry Metrics Grid */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px bg-[#CBDCEB] border border-[#CBDCEB] shadow-sm">
            <div className="p-4 bg-[#FFFFFF]">
              <span className="text-[10px] text-[#64748B] uppercase tracking-widest block font-bold">BACKEND SECTORS</span>
              <span className="text-2xl font-bold text-[#0F172A] block mt-1">{isHydrated ? String(sectors.length) : "—"}</span>
              <span className="text-[10px] text-[#64748B]">from Django</span>
            </div>
            <div className="p-4 bg-[#FFFFFF]">
              <span className="text-[10px] text-[#64748B] uppercase tracking-widest block font-bold">CAMERAS ONLINE</span>
              <span className="text-2xl font-bold text-[#0F172A] block mt-1">{isHydrated ? `${onlineCameras}/${cameras.length}` : "—"}</span>
              <span className="text-[10px] text-[#64748B]">configured feeds</span>
            </div>
            <div className="p-4 bg-[#FFFFFF]">
              <span className="text-[10px] text-[#64748B] uppercase tracking-widest block font-bold">ACTIVE THREATS</span>
              <span className="text-2xl font-bold text-[#DC2626] block mt-1">{isHydrated ? String(openAlerts) : "—"}</span>
              <span className="text-[10px] text-[#64748B]">unresolved alerts</span>
            </div>
            <div className="p-4 bg-[#FFFFFF]">
              <span className="text-[10px] text-[#64748B] uppercase tracking-widest block font-bold">GUARD ROSTER</span>
              <span className="text-2xl font-bold text-[#0F172A] block mt-1">{isHydrated ? String(guards.length) : "—"}</span>
              <span className="text-[10px] text-[#64748B]">sentry records</span>
            </div>
          </div>
        </section>

        {/* Core Modules 3-Column Grid */}
        <section className="border-b border-[#CBDCEB]">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#CBDCEB] border-x border-[#CBDCEB]">
              {/* Feature 1 */}
              <div className="p-8 bg-[#FFFFFF] space-y-4">
                <div className="text-[11px] text-[#0284C7] font-bold uppercase tracking-widest flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-[#0284C7]" />
                  <span>SYS.MODULE.01</span>
                </div>
                <h3 className="text-xl font-bold text-[#0F172A] uppercase tracking-wider font-sans">
                  AI + GIS Intelligence
                </h3>
                <p className="text-xs text-[#475569] font-sans leading-relaxed">
                  Sentrix locates AI detections and community reports on a layered intelligence map so authorized operators can understand what is happening, where it is happening, and who may be affected.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-8 bg-[#FFFFFF] space-y-4">
                <div className="text-[11px] text-[#0284C7] font-bold uppercase tracking-widest flex items-center gap-2">
                  <Anchor className="w-4 h-4 text-[#0284C7]" />
                  <span>SYS.MODULE.02</span>
                </div>
                <h3 className="text-xl font-bold text-[#0F172A] uppercase tracking-wider font-sans">
                  Evidence Anchoring
                </h3>
                <p className="text-xs text-[#475569] font-sans leading-relaxed">
                  Cryptographic SHA-256 hashing of raw video feeds at the point of capture. Immutable incident records committed to an append-only blockchain contract tied to GPS coordinates.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-8 bg-[#FFFFFF] space-y-4">
                <div className="text-[11px] text-[#0284C7] font-bold uppercase tracking-widest flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-[#0284C7]" />
                  <span>SYS.MODULE.03</span>
                </div>
                <h3 className="text-xl font-bold text-[#0F172A] uppercase tracking-wider font-sans">
                  Chain of Custody
                </h3>
                <p className="text-xs text-[#475569] font-sans leading-relaxed">
                  Automated shift rotation logs, 1-tap sentry handovers, and immutable operator audit trails ensure complete human accountability across sensitive sectors.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Operating Model & Architecture */}
        <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 w-full">
          <div className="border border-[#CBDCEB] bg-[#FFFFFF] p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] text-[#0284C7] font-bold uppercase tracking-widest">DEPLOYMENT ARCHITECTURE</span>
              <h4 className="text-lg font-bold text-[#0F172A] uppercase tracking-wider">
                Ready for Isolated Outpost Operations
              </h4>
              <p className="text-xs text-[#475569] font-sans max-w-2xl mt-1">
                Zero telemetry leakage. Operates fully offline during communications dropouts and synchronizes cryptographic incident records upon link restoration.
              </p>
            </div>
            <Link href="/dashboard">
              <TacticalButton variant="primary" size="md">
                ENTER COMMAND TERMINAL →
              </TacticalButton>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#CBDCEB] py-8 bg-[#FFFFFF] text-center text-xs text-[#64748B]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-bold text-[#0F172A] uppercase tracking-widest">
            SENTRIX // AI GIS OVERSIGHT TERMINAL V4.0
          </div>
          <div>
            SYSTEM_UPTIME: <span className="text-[#0284C7] font-bold">99.98%</span> // ENCRYPTION: <span className="text-[#0284C7] font-bold">AES-256</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
