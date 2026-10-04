import { Alert, Guard } from "@/lib/types";
import { evidenceSource } from "@/lib/evidence";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export function openIncidentReport(alert: Alert, guard?: Guard | null): boolean {
  if (typeof window === "undefined") return false;
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) return false;

  const assignedGuard = guard?.name || alert.assignedGuardName || "Not assigned";
  reportWindow.document.write(`<!doctype html>
<html><head><title>BorderLens Incident ${escapeHtml(alert.id)}</title>
<style>
body{font-family:Arial,sans-serif;color:#0f172a;margin:40px;line-height:1.45}
h1{font-size:20px;letter-spacing:2px;border-bottom:2px solid #0284c7;padding-bottom:12px}
h2{font-size:13px;letter-spacing:1px;color:#0369a1;margin-top:28px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1px solid #cbdceb;padding:14px}
.label{font-size:10px;text-transform:uppercase;color:#64748b;font-weight:bold}.value{font-size:13px;font-weight:bold}
img{width:100%;max-height:480px;object-fit:contain;background:#0b1320;margin-top:12px}
.note{background:#f0f6fc;border:1px solid #cbdceb;padding:14px}
@media print{body{margin:20px}.no-print{display:none}}
</style></head><body>
<h1>BORDERLENS // INCIDENT REPORT</h1>
<div class="grid">
<div><div class="label">Incident ID</div><div class="value">${escapeHtml(alert.id)}</div></div>
<div><div class="label">Status</div><div class="value">${escapeHtml(alert.status)}</div></div>
<div><div class="label">Event</div><div class="value">${escapeHtml(alert.eventType)}</div></div>
<div><div class="label">Severity</div><div class="value">${escapeHtml(alert.level)}</div></div>
<div><div class="label">Source camera</div><div class="value">${escapeHtml(alert.sourceCameraId)} // ${escapeHtml(alert.sourceCameraName)}</div></div>
<div><div class="label">Sector</div><div class="value">${escapeHtml(alert.sector)}</div></div>
<div><div class="label">Timestamp</div><div class="value">${escapeHtml(alert.timestamp)}</div></div>
<div><div class="label">AI confidence</div><div class="value">${escapeHtml(alert.confidence)}%</div></div>
<div><div class="label">Plate / watchlist</div><div class="value">${escapeHtml(alert.plateNumber || "None")} // ${escapeHtml(alert.watchlistEntryId || "No match")}</div></div>
<div><div class="label">Assigned guard</div><div class="value">${escapeHtml(assignedGuard)}</div></div>
</div>
<h2>EVIDENCE CAPTURE</h2><img src="${escapeHtml(evidenceSource(alert.evidenceUrl))}" alt="Evidence frame"/>
<h2>OPERATOR NOTES</h2><div class="note">${escapeHtml(alert.notes || "No operator notes recorded.")}</div>
<h2>CHAIN OF CUSTODY</h2><div class="note">Evidence SHA-256: ${escapeHtml(alert.evidenceSha256 || "Not calculated")}<br/>Blockchain status: ${escapeHtml(alert.blockchainStatus || "Not anchored")}</div>
<p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`);
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 250);
  return true;
}
