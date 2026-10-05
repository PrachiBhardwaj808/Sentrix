"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Fingerprint, Key, Lock, Moon, Radio, Shield, Sun } from "lucide-react";
import { TacticalButton } from "@/components/shared/TacticalButton";
import { tacticalSound } from "@/lib/sound";
import { authenticate, saveAuthSession } from "@/lib/auth";
import { ApiError, backendApi } from "@/lib/api/client";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { getPasskey, passkeysSupported } from "@/lib/passkey";
import { getStoredApiBaseUrl, setStoredApiBaseUrl } from "@/lib/api/route";

export default function LoginPage() {
  const router = useRouter();
  const [operatorId, setOperatorId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [authStage, setAuthStage] = useState<"password" | "otp">("password");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [offlineSession, setOfflineSession] = useState<ReturnType<typeof authenticate> | null>(null);
  const [isPasskeyBusy, setIsPasskeyBusy] = useState(false);
  const [error, setError] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [customApiRoute, setCustomApiRoute] = useState<string | null>(null);

  useEffect(() => {
    setDarkMode(getStoredTheme() === "dark");
    setCustomApiRoute(getStoredApiBaseUrl());
  }, []);

  const useLocalBackend = () => {
    setStoredApiBaseUrl(null);
    window.location.reload();
  };

  const handleThemeToggle = () => {
    const nextTheme = darkMode ? "light" : "dark";
    applyTheme(nextTheme);
    setDarkMode(nextTheme === "dark");
  };

  const enterConsole = (session: any) => {
    saveAuthSession(session);
    router.push(session.tier === "admin" ? "/admin" : session.tier === "field" ? "/live-feed" : "/dashboard");
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    tacticalSound.playClick();
    setError("");
    setIsVerifying(true);
    try {
      const response = await backendApi.login(operatorId, passcode);
      if (response.session && response.token) {
        enterConsole({ ...response.session, token: response.token });
        return;
      }
      if (!response.requiresTwoFactor || !response.challengeId) throw new Error("Two-step verification could not be started.");
      setChallengeId(response.challengeId);
      setDeliveryMessage(response.message || `Verification code sent ${response.maskedPhone || "to the registered device"}.`);
      setDemoOtp(response.demoOtp || "");
      setAuthStage("otp");
      setIsVerifying(false);
    } catch (loginError) {
      // Keep the UI preview usable when Django is intentionally offline. The
      // backend path above is authoritative whenever the API is reachable.
      if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true" && process.env.NODE_ENV !== "production" && !(loginError instanceof ApiError)) {
        const localSession = authenticate(operatorId, passcode);
        if (localSession) {
          setOfflineSession(localSession);
          setChallengeId("LOCAL-DEMO-OTP");
          setDemoOtp("246810");
          setDeliveryMessage("Demo OTP: use 246810. Configure Exotel for live SMS verification.");
          setAuthStage("otp");
          setIsVerifying(false);
          return;
        }
      }
      setError(
        loginError instanceof ApiError && loginError.status === 503
          ? "AUTHORITY UNAVAILABLE // START THE DJANGO BACKEND"
          : "ACCESS DENIED // CHECK OPERATOR ID AND SECURITY PASSCODE"
      );
      setIsVerifying(false);
    }
  };

  const handleOtpVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifying(true);
    setError("");
    try {
      if (offlineSession) {
        if (otp !== "246810") throw new Error("Invalid demo OTP.");
        enterConsole({ ...offlineSession, authMethod: "demo_otp", loginIp: "local-demo" });
        return;
      }
      const response = await backendApi.verifyOtp(challengeId, otp);
      enterConsole({ ...response.session, token: response.token });
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "OTP verification failed.");
      setIsVerifying(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError("");
    setIsPasskeyBusy(true);
    try {
      if (!operatorId.trim()) throw new Error("Enter your operator ID before using Face ID.");
      const optionsResponse = await backendApi.passkeyOptions(operatorId);
      const credential = await getPasskey(optionsResponse.options);
      const response = await backendApi.passkeyVerify(optionsResponse.challengeId, credential);
      enterConsole({ ...response.session, token: response.token });
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Face ID/passkey verification failed.");
      setIsPasskeyBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EBF3FA] flex flex-col items-center justify-center p-6 relative font-mono text-[#0F172A]">
      <button
        type="button"
        onClick={handleThemeToggle}
        className="absolute right-6 top-6 border border-[#CBDCEB] bg-[#FFFFFF] p-2 text-[#0369A1] hover:bg-[#E0F2FE]"
        title={darkMode ? "Switch to light theme" : "Switch to dark theme"}
        aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
      >
        {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <div className="relative max-w-md w-full bg-[#FFFFFF] border border-[#CBDCEB] rounded-none p-8 z-10 shadow-xl">
        <div className="text-center pb-6 border-b border-[#CBDCEB]">
          <div className="w-10 h-10 bg-[#0284C7] text-white flex items-center justify-center mx-auto mb-4 font-bold shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#0F172A]">
            SENTRIX // CONSOLE_AUTH
          </h2>
          <p className="text-[10px] text-[#0284C7] font-semibold mt-1 tracking-wider">
            RESTRICTED ACCESS // NODE_ALPHA_07
          </p>
        </div>

        {authStage === "password" ? (
        <form onSubmit={handlePasswordLogin} className="space-y-5 pt-6">
          <div className="relative pt-4">
            <label className="text-[10px] text-[#475569] uppercase tracking-widest font-bold block mb-1">
              OPERATOR_ID
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-[#0284C7] absolute left-0 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={operatorId}
                onChange={(event) => setOperatorId(event.target.value)}
                placeholder="OP_ALPHA_01"
                className="w-full bg-transparent border-0 border-b border-[#CBDCEB] focus:border-[#0284C7] rounded-none py-2 pl-7 pr-2 text-xs text-[#0F172A] placeholder:text-[#94A3B8] font-mono transition-colors font-bold"
                required
              />
            </div>
          </div>

          <div className="relative pt-2">
            <label className="text-[10px] text-[#475569] uppercase tracking-widest font-bold block mb-1">
              SECURITY_PASSCODE / TOKEN
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#0284C7] absolute left-0 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-transparent border-0 border-b border-[#CBDCEB] focus:border-[#0284C7] rounded-none py-2 pl-7 pr-2 text-xs text-[#0F172A] placeholder:text-[#94A3B8] font-mono transition-colors font-bold"
                required
              />
            </div>
          </div>

          <div className="pt-4">
            <TacticalButton
              variant="primary"
              size="lg"
              type="submit"
              loading={isVerifying}
              className="w-full font-bold shadow-sm"
            >
              {isVerifying ? "AUTHENTICATING..." : "VERIFY & ENTER CONSOLE"}
            </TacticalButton>
          </div>
          <button
            type="button"
            onClick={() => void handlePasskeyLogin()}
            disabled={isPasskeyBusy || !passkeysSupported()}
            className="flex w-full items-center justify-center gap-2 border border-[#0284C7] bg-[#F0F9FF] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#0369A1] hover:bg-[#E0F2FE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Fingerprint className="h-4 w-4" />
            {isPasskeyBusy ? "VERIFYING DEVICE..." : "SIGN IN WITH FACE ID / PASSKEY"}
          </button>
          {error && (
            <div className="flex items-center gap-2 border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[10px] font-bold text-[#B91C1C]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
        ) : (
          <form onSubmit={handleOtpVerification} className="space-y-5 pt-6">
            <div className="border border-[#BAE6FD] bg-[#F0F9FF] p-3 text-[10px] text-[#0369A1]">
              <div className="font-bold uppercase tracking-widest">SECOND FACTOR REQUIRED</div>
              <p className="mt-1 font-sans">{deliveryMessage}</p>
              {demoOtp && <p className="mt-2 font-mono font-bold">LOCAL DEMO CODE: {demoOtp}</p>}
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#475569]">
              VERIFICATION_CODE
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="6 digits"
                className="mt-1 w-full border-0 border-b border-[#CBDCEB] bg-transparent py-2 text-sm font-bold tracking-[0.4em] text-[#0F172A] outline-none focus:border-[#0284C7]"
                required
              />
            </label>
            <TacticalButton variant="primary" size="lg" type="submit" loading={isVerifying} className="w-full font-bold shadow-sm">
              {isVerifying ? "VERIFYING..." : "VERIFY CODE & ENTER"}
            </TacticalButton>
            <button type="button" onClick={() => { setAuthStage("password"); setOtp(""); setError(""); setOfflineSession(null); }} className="w-full text-[10px] font-bold uppercase tracking-wider text-[#0369A1] hover:underline">
              ← USE A DIFFERENT OPERATOR
            </button>
            {error && (
              <div className="flex items-center gap-2 border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[10px] font-bold text-[#B91C1C]"><AlertCircle className="h-3.5 w-3.5 shrink-0" /><span>{error}</span></div>
            )}
          </form>
        )}

        {process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true" && process.env.NODE_ENV !== "production" && <div className="mt-6 border border-[#CBDCEB] bg-[#F0F6FC] p-3 text-[10px] text-[#475569]">
          <div className="font-bold uppercase tracking-widest text-[#0369A1]">DEMO ACCESS TIERS</div>
          <div className="mt-2 space-y-1 font-mono">
            <div><strong>ADMIN-001</strong> // administrator</div>
            <div><strong>SSB-2041</strong> // inspector command</div>
            <div><strong>SSB-2098</strong> // rifleman field</div>
          </div>
          <p className="mt-2 text-[9px] text-[#64748B]">Use the configured demo passcodes for this preview. Production should use server-side or Firebase authentication.</p>
        </div>}

        {customApiRoute && (
          <div className="mt-3 border border-[#FCD34D] bg-[#FFFBEB] p-3 text-[10px] text-[#92400E]">
            <div className="font-bold uppercase tracking-widest">REMOTE API ROUTE ACTIVE</div>
            <p className="mt-1 break-all font-sans">{customApiRoute}</p>
            <button type="button" onClick={useLocalBackend} className="mt-2 border border-[#D97706] bg-white px-2 py-1 font-bold uppercase tracking-wider text-[#92400E] hover:bg-[#FEF3C7]">
              Use local backend (127.0.0.1)
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#CBDCEB] flex items-center justify-between text-[10px] text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-[#16A34A]" />
            <span>SESSION_ENCRYPTED</span>
          </div>
          <Link href="/" className="text-[#0284C7] hover:underline font-bold transition-colors">
            ← PUBLIC PORTAL
          </Link>
        </div>
      </div>
    </div>
  );
}
