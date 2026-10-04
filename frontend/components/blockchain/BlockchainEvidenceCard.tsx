"use client";

import { useState } from "react";
import { Link2, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { Alert } from "@/lib/types";
import { backendApi, VerificationResult } from "@/lib/api/client";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

export function BlockchainEvidenceCard({ alert }: { alert: Alert }) {
  const hydrateFromBackend = useIBVAPStore((state) => state.hydrateFromBackend);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await backendApi.verifyAlert(alert.id);
      setVerification(response.verification);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Verification request failed.");
    } finally {
      setBusy(false);
    }
  };

  const anchor = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await backendApi.anchorAlert(alert.id);
      void hydrateFromBackend();
      setVerification({
        status: "verified",
        verified: true,
        incidentReferenceHash: String(response.blockchain.incidentReferenceHash || ""),
        evidenceSha256: String(response.blockchain.evidenceSha256 || ""),
        transactionHash: String(response.blockchain.transactionHash || ""),
        message: "Evidence anchored and confirmed in the append-only registry.",
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Anchor request failed.");
    } finally {
      setBusy(false);
    }
  };

  const status = verification?.status || alert.blockchainStatus || "not_anchored";
  const isVerified = verification?.verified || status === "anchored";

  return (
    <div className="p-4 bg-[#F0F6FC] border border-[#CBDCEB] rounded-none space-y-3 font-mono">
      <div className="flex items-center justify-between gap-3 border-b border-[#CBDCEB] pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
          <span className="text-[11px] text-[#0F172A] font-bold uppercase tracking-widest">
            EVIDENCE_REGISTRY // CRYPTO_ANCHOR
          </span>
        </div>
        <span
          className={`text-[10px] px-2.5 py-1 rounded-none border font-bold uppercase tracking-wider ${
            isVerified
              ? "text-[#166534] bg-[#DCFCE7] border-[#86EFAC]"
              : "text-[#0369A1] bg-[#E0F2FE] border-[#BAE6FD]"
          }`}
        >
          {isVerified ? "VERIFIED_ON_CHAIN" : status.replaceAll("_", " ")}
        </span>
      </div>

      <p className="text-[11px] text-[#475569] font-sans leading-relaxed">
        Cryptographic hashing at capture. Immutable incident reference anchored on-chain while raw media remains in private evidence storage.
      </p>

      {(verification?.evidenceSha256 || alert.evidenceSha256) && (
        <div className="p-2.5 bg-[#FFFFFF] border-l-2 border-[#0284C7] border-y border-r border-[#CBDCEB] text-[11px] text-[#475569] break-all">
          <span className="text-[#0F172A] block text-[10px] uppercase font-bold mb-0.5">CRYPTO_HASH (SHA-256):</span>
          <span className="text-[#0284C7] font-bold">{verification?.evidenceSha256 || alert.evidenceSha256}</span>
        </div>
      )}

      {verification?.transactionHash && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#475569] break-all bg-[#FFFFFF] p-2 border border-[#CBDCEB]">
          <Link2 className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
          <span>TX_HASH:</span> <span className="text-[#0F172A] font-bold">{verification.transactionHash}</span>
        </div>
      )}

      {verification?.message && <p className="text-[11px] text-[#166534] font-bold">{verification.message}</p>}
      {error && <p className="text-[11px] text-[#DC2626] font-bold">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={verify}
          disabled={busy}
          className="px-4 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white border border-[#0284C7] rounded-none text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          VERIFY HASH
        </button>
        {!isVerified && (
          <button
            onClick={anchor}
            disabled={busy}
            className="px-4 py-2 bg-[#FFFFFF] hover:bg-[#E0F2FE] text-[#0369A1] border border-[#CBDCEB] rounded-none text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#0284C7]" />
            ANCHOR TO CHAIN
          </button>
        )}
      </div>
    </div>
  );
}
