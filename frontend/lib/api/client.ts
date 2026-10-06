import {
  ActivityLogEntry,
  Alert,
  Camera,
  DemoProfile,
  Guard,
  GuardStatus,
  Sector,
  Shift,
  WatchlistEntry,
  WatchlistStatus,
  WatchlistType,
  ResourceRecord,
} from "@/lib/types";
import { CommunityRecord, InfrastructureRecord, RoadRecord } from "@/lib/geospatial/sentrixIntel";
import { AuthSession, getAuthSession } from "@/lib/auth";
import { DEFAULT_SERVER_API_BASE_URL, getBrowserApiBaseUrl } from "@/lib/api/route";

export interface BlockchainStatus {
  configured: boolean;
  connected: boolean;
  mode: "live" | "not_configured" | "unavailable" | string;
  network: string;
  chainId: number | null;
  contractAddress: string | null;
  explorerBaseUrl: string | null;
  message: string;
}

export interface FirebaseStatus {
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  message: string;
  alertsSynced?: boolean;
  alertsCount?: number | null;
  pending?: number;
  deadLetter?: number;
}

export interface MonitoringMetrics {
  sampleWindow: number;
  modules: Array<{
    cameraId: string;
    module: string;
    lastInferenceMs: number;
    p50Ms: number;
    p95Ms: number;
    samples: number;
    bufferDepth: number;
    frameDropped: number;
  }>;
  generatedAt: number;
}

export interface VerificationResult {
  status: "verified" | "mismatch" | "not_configured" | "unavailable" | "not_anchored" | string;
  verified: boolean;
  incidentReferenceHash: string;
  evidenceSha256: string;
  transactionHash: string | null;
  explorerUrl?: string | null;
  message: string;
}

export interface BootstrapData {
  currentUser: {
    name: string;
    rank: string;
    badgeId: string;
    role: string;
  };
  guards: Guard[];
  shifts: Shift[];
  activityLog: ActivityLogEntry[];
  alerts: Alert[];
  cameras: Camera[];
  sectors: Sector[];
  communities: CommunityRecord[];
  resources: ResourceRecord[];
  infrastructure: InfrastructureRecord[];
  roads: RoadRecord[];
  pois?: unknown[];
  anprRecords?: unknown[];
  watchlistEntries: WatchlistEntry[];
  demoProfiles: DemoProfile[];
  system: {
    lockdownActive: boolean;
    defconLevel: 1 | 2 | 3 | 4 | 5;
  };
}

export interface BootstrapResponse {
  data: BootstrapData;
  meta: { source: string; generatedAt: string };
  blockchain: BlockchainStatus;
  firebase: FirebaseStatus;
}

export interface LoginResponse {
  requiresTwoFactor?: boolean;
  challengeId?: string;
  delivery?: string;
  maskedPhone?: string | null;
  demoOtp?: string;
  expiresInSeconds?: number;
  message?: string;
  session?: Omit<AuthSession, "token">;
  token?: string;
}

export interface DispatchOtpDelivery {
  challengeId: string;
  status: string;
  delivery: string;
  maskedPhone: string | null;
  expiresInSeconds: number;
  message: string;
  demoOtp?: string;
}

export interface DispatchAlertResponse {
  alert: Alert;
  firebase?: FirebaseStatus;
  dispatchOtp: DispatchOtpDelivery;
}

export interface CameraConnectionResult {
  reachable: boolean;
  protocol: string;
  host: string | null;
  port: number | null;
  code: string;
  message: string;
}

export interface AnalyticsEvent {
  cameraId: string;
  sector: string;
  rule: string;
  reason: string;
  eventType: string;
  severity: string;
  direction: string;
  trackId?: string | null;
  objectClass: string;
  confidence: number;
  timestamp: string;
  [key: string]: unknown;
}

export interface CreateGuardPayload {
  id?: string;
  name: string;
  rank: string;
  badgeId: string;
  operatorId?: string;
  passcode: string;
  phone?: string;
  callSign?: string;
  sector?: string;
  postId?: string;
  status?: GuardStatus;
  bloodGroup?: string;
  certifications?: string;
  photoUrl?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface CreateWatchlistPayload {
  type: WatchlistType;
  value: string;
  label: string;
  reason?: string;
  status?: WatchlistStatus;
}

export interface CreateDemoProfilePayload {
  displayName: string;
  role?: string;
  badgeId: string;
  qrCode: string;
}

export interface FrameDetection {
  label: string;
  source: "person_tracking" | "face_detection" | "anpr" | string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  trackId?: string | null;
  attributes?: Record<string, unknown>;
}

export interface FrameInferenceModule {
  id: "person_tracking" | "face_detection" | "anpr" | string;
  label: string;
  model: string;
  status: "active" | "disabled" | "unavailable" | string;
  detectionCount: number;
  message?: string;
}

export interface FrameInferenceResponse {
  status: string;
  model: string;
  device: string;
  confidenceThreshold: number;
  inferenceMs: number;
  frameWidth: number;
  frameHeight: number;
  detections: FrameDetection[];
  modules: FrameInferenceModule[];
  metrics?: {
    captureFps: number | null;
    displayFps: number | null;
    inferenceFps: number;
    queueDelayMs: number;
    droppedFrames: number;
    modelHealth: Record<string, string>;
  };
}

export interface TriageIncident {
  incident_id: string;
  camera_id: string;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  status: "new" | "review" | "acknowledged" | "resolved" | "false_positive" | string;
  explanation: string;
  humanReviewRequired: boolean;
  operatorMessage: string;
  location?: { lat: number; lng: number };
  events: Array<Record<string, unknown>>;
}

export interface AuthAuditEvent {
  id: string;
  operatorId: string;
  eventType: string;
  method: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  details: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const apiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return getBrowserApiBaseUrl();
  }
  return DEFAULT_SERVER_API_BASE_URL;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const session = getAuthSession();
  if (session?.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(String(payload.error || `API request failed (${response.status})`), response.status);
  }
  return payload as T;
}

export const backendApi = {
  health: () => request<{ status: string }>("/health"),
  login: (operatorId: string, passcode: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ operatorId, passcode }),
    }),
  verifyOtp: (challengeId: string, otp: string) =>
    request<{ session: Omit<AuthSession, "token">; token: string }>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ challengeId, otp }),
    }),
  passkeyOptions: (operatorId: string) =>
    request<{ challengeId: string; options: Record<string, any> }>("/auth/passkey/options", {
      method: "POST",
      body: JSON.stringify({ operatorId }),
    }),
  passkeyVerify: (challengeId: string, credential: Record<string, unknown>) =>
    request<{ session: Omit<AuthSession, "token">; token: string }>("/auth/passkey/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, credential }),
    }),
  registerPasskeyOptions: () =>
    request<{ challengeId: string; options: Record<string, any> }>("/auth/passkey/register/options", {
      method: "POST",
    }),
  registerPasskey: (challengeId: string, credential: Record<string, unknown>) =>
    request<{ registered: boolean; passkeyCount: number }>("/auth/passkey/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, credential }),
    }),
  getAuthAudit: () => request<{ events: AuthAuditEvent[] }>("/auth/audit"),
  getBootstrap: () => request<BootstrapResponse>("/bootstrap"),
  getDemoProfiles: () => request<{ profiles: DemoProfile[] }>("/demo-profiles"),
  getBlockchainStatus: () => request<BlockchainStatus>("/blockchain/status"),
  getFirebaseStatus: () => request<FirebaseStatus>("/firebase/status"),
  getMonitoringMetrics: (cameraId?: string) =>
    request<{ metrics: MonitoringMetrics }>(`/monitoring/metrics${cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : ""}`),
  analyzeFrame: (frame: Blob, modules?: string[]) =>
    request<FrameInferenceResponse>(
      `/inference/frame${modules?.length ? `?modules=${encodeURIComponent(modules.join(","))}` : ""}`,
      {
      method: "POST",
      body: frame,
      // Django reads the JPEG directly from the request body. Using a CORS-
      // safelisted content type avoids an OPTIONS preflight before every live
      // frame when Next.js and Django run on different localhost ports.
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      }
    ),
  evaluateCameraAnalytics: (cameraId: string, detections: FrameDetection[], brightness?: number, evidenceUrl?: string) =>
    request<{ events: AnalyticsEvent[]; alerts: Alert[]; firebase: FirebaseStatus }>("/analytics/evaluate", {
      method: "POST",
      body: JSON.stringify({ cameraId, detections, brightness, evidenceUrl }),
    }),
  triageIncident: (cameraId: string, events: FrameDetection[]) =>
    request<{ incident: TriageIncident | null; humanReviewRequired: boolean }>("/analytics/triage", {
      method: "POST",
      body: JSON.stringify({ cameraId, events }),
    }),
  verifyAlert: (alertId: string) =>
    request<{ verification: VerificationResult }>(`/alerts/${encodeURIComponent(alertId)}/verification`),
  actionAlert: (alertId: string, action: "acknowledge" | "escalate" | "resolve", actorName: string) =>
    request(`/alerts/${encodeURIComponent(alertId)}/action`, {
      method: "POST",
      body: JSON.stringify({ action, actorName }),
    }),
  dispatchAlert: (alertId: string, guardId: string, actorName: string) =>
    request<DispatchAlertResponse>(`/alerts/${encodeURIComponent(alertId)}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ guardId, actorName }),
    }),
  resendDispatchSms: (alertId: string) =>
    request<DispatchAlertResponse>(`/alerts/${encodeURIComponent(alertId)}/dispatch-sms`, { method: "POST" }),
  verifyDispatchOtp: (alertId: string, challengeId: string, guardId: string, otp: string) =>
    request<{ verified: boolean; alert: Alert }>(`/alerts/${encodeURIComponent(alertId)}/dispatch-otp/verify`, {
      method: "POST",
      body: JSON.stringify({ challengeId, guardId, otp }),
    }),
  createAlert: (alert: Alert) =>
    request(`/alerts`, { method: "POST", body: JSON.stringify(alert) }),
  addActivity: (entry: ActivityLogEntry) =>
    request(`/activity`, { method: "POST", body: JSON.stringify(entry) }),
  createGuard: (payload: CreateGuardPayload) =>
    request<{ guard: Guard; accessTier: string }>("/guards", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createWatchlistEntry: (payload: CreateWatchlistPayload) =>
    request<{ entry: WatchlistEntry }>("/watchlist", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createDemoProfile: (payload: CreateDemoProfilePayload) =>
    request<{ profile: DemoProfile }>("/demo-profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteWatchlistEntry: (entryId: string) =>
    request<{ deleted: string }>(`/watchlist/${encodeURIComponent(entryId)}`, {
      method: "DELETE",
    }),
  markPotentialMatch: (alertId: string, profileId: string, note?: string) =>
    request<{ alert: Alert; firebase?: FirebaseStatus }>(`/alerts/${encodeURIComponent(alertId)}/potential-match`, {
      method: "POST",
      body: JSON.stringify({ profileId, note }),
    }),
  updateGuard: (guardId: string, changes: Partial<Guard>) =>
    request(`/guards/${encodeURIComponent(guardId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  updateShift: (shiftId: string, changes: Partial<Shift>) =>
    request(`/shifts/${encodeURIComponent(shiftId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  handover: (payload: { outgoingGuardId: string; incomingGuardId: string; notes?: string }) =>
    request(`/handover`, { method: "POST", body: JSON.stringify(payload) }),
  updateCamera: (cameraId: string, changes: Partial<Camera>) =>
    request<{ camera: Camera }>(`/cameras/${encodeURIComponent(cameraId)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  testCameraConnection: (hostOrUrl: string, portOrTimeout = 554) => {
    if (typeof hostOrUrl === "string" && hostOrUrl.includes("://")) {
      return request<{ connection: CameraConnectionResult }>("/cameras/test", {
        method: "POST",
        body: JSON.stringify({ url: hostOrUrl, timeoutSeconds: portOrTimeout }),
      });
    }
    return request<{
      reachable: boolean;
      code: string;
      message: string;
      host?: string;
      port?: number;
      connection: CameraConnectionResult;
    }>("/cameras/test", {
      method: "POST",
      body: JSON.stringify({ host: hostOrUrl, port: portOrTimeout }),
    });
  },
  getCameraStream: (cameraId: string) =>
    request<{
      cameraId: string;
      pathName?: string;
      hlsUrl: string;
      webrtcUrl?: string;
      relayAvailable: boolean;
      error?: string;
    }>(`/cameras/${encodeURIComponent(cameraId)}/stream`),
  importGeoJson: (collection: "communities" | "resources" | "infrastructure" | "roads", geojson: unknown) =>
    request<{ imported: number; records: unknown[] }>("/geospatial", {
      method: "POST",
      body: JSON.stringify({ collection, geojson }),
    }),
  geospatialInBounds: (west: number, south: number, east: number, north: number) => {
    const bbox = [west, south, east, north].join(",");
    return request<Pick<BootstrapData, "communities" | "resources" | "infrastructure" | "roads">>(
      `/geospatial?bbox=${encodeURIComponent(bbox)}`
    );
  },
  systemAction: (action: "lockdown" | "abort_lockdown" | "defcon", level?: number, actorName?: string) =>
    request(`/system/action`, {
      method: "POST",
      body: JSON.stringify({ action, level, actorName }),
    }),
  sync: (alerts: Alert[], activityLog: ActivityLogEntry[]) =>
    request<{ data: BootstrapData; blockchain: BlockchainStatus; firebase: FirebaseStatus }>("/sync", {
      method: "POST",
      body: JSON.stringify({ alerts, activityLog }),
    }),
  reset: () => request<BootstrapResponse>("/reset", { method: "POST" }),
  anchorAlert: (alertId: string) =>
    request<{ alert: Alert; blockchain: Record<string, unknown> }>(
      `/alerts/${encodeURIComponent(alertId)}/anchor`,
      { method: "POST" }
    ),
};
