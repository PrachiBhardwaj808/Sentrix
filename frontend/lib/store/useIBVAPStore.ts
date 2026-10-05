import { create } from "zustand";
import {
  Guard,
  Shift,
  ActivityLogEntry,
  Alert,
  Camera,
  Sector,
  GuardStatus,
  Point2D,
  DemoProfile,
  WatchlistEntry,
  ResourceRecord,
} from "../types";
import { CommunityRecord, InfrastructureRecord, RoadRecord } from "../geospatial/sentrixIntel";
import { tacticalSound } from "../sound";
import { generateId } from "../utils";
import { backendApi, BlockchainStatus, BootstrapData, CreateDemoProfilePayload, CreateGuardPayload, CreateWatchlistPayload, DispatchAlertResponse, FirebaseStatus } from "../api/client";

interface UserProfile {
  name: string;
  rank: string;
  badgeId: string;
  role: string;
}

type BackendStatus = "loading" | "online" | "offline";

const DEFAULT_BLOCKCHAIN_STATUS: BlockchainStatus = {
  configured: false,
  connected: false,
  mode: "not_configured",
  network: "Sepolia testnet",
  chainId: null,
  contractAddress: null,
  explorerBaseUrl: null,
  message: "Backend blockchain configuration is not present.",
};

const DEFAULT_FIREBASE_STATUS: FirebaseStatus = {
  configured: false,
  initialized: false,
  projectId: null,
  message: "Firebase Admin credentials are not configured.",
};

interface IBVAPState {
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
  watchlistEntries: WatchlistEntry[];
  demoProfiles: DemoProfile[];

  offlineQueue: Alert[];
  offlineLogQueue: ActivityLogEntry[];
  lockdownActive: boolean;
  defconLevel: 1 | 2 | 3 | 4 | 5;
  soundMuted: boolean;
  currentUser: UserProfile;
  backendStatus: BackendStatus;
  isHydrated: boolean;
  isHydrating: boolean;
  lastSyncAt: string | null;
  blockchainStatus: BlockchainStatus;
  firebaseStatus: FirebaseStatus;

  hydrateFromBackend: () => Promise<void>;
  checkBackendHealth: () => Promise<void>;
  toggleSound: () => void;
  setDefconLevel: (level: 1 | 2 | 3 | 4 | 5) => void;
  triggerLockdown: () => void;
  abortLockdown: () => void;
  flushOfflineQueue: () => void;

  acknowledgeAlert: (alertId: string, actorName?: string) => void;
  escalateAlert: (alertId: string, actorName?: string) => void;
  resolveAlert: (alertId: string, actorName?: string) => void;
  dispatchAlert: (alertId: string, guardId: string, actorName?: string) => Promise<DispatchAlertResponse | null>;
  addAlert: (alert: Omit<Alert, "id" | "timestamp" | "status" | "acknowledgedBy">) => void;
  addGuard: (payload: CreateGuardPayload) => Promise<Guard>;
  addWatchlistEntry: (payload: CreateWatchlistPayload) => Promise<WatchlistEntry>;
  removeWatchlistEntry: (entryId: string) => Promise<void>;
  addDemoProfile: (payload: CreateDemoProfilePayload) => Promise<DemoProfile>;

  updateGuardStatus: (guardId: string, status: GuardStatus) => void;
  quickHandover: (outgoingGuardId: string, incomingGuardId: string, notes?: string) => void;
  performShiftHandover: (
    postId: string,
    outgoingGuardId: string,
    incomingGuardId: string,
    notes: string,
    actorName?: string
  ) => void;
  reassignShift: (shiftId: string, newGuardId: string, newGuardName: string) => void;

  toggleCameraActive: (cameraId: string) => void;
  setCameraSensitivity: (cameraId: string, threshold: number) => void;
  updateCameraDetection: (cameraId: string, updates: Partial<Camera>) => void;
  commitZoneMap: (cameraId: string, polygon: Point2D[], actorName?: string) => void;

  addActivityLog: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void;
  resetData: () => void;
}

const makeActivity = (
  entry: Omit<ActivityLogEntry, "id" | "timestamp">
): ActivityLogEntry => ({
  ...entry,
  id: generateId("LOG"),
  timestamp: new Date().toISOString(),
});

const applyBackendData = (
  data: BootstrapData,
  blockchainStatus: BlockchainStatus,
  firebaseStatus: FirebaseStatus
) => ({
  guards: data.guards,
  shifts: data.shifts,
  activityLog: data.activityLog,
  alerts: data.alerts,
  cameras: data.cameras,
  sectors: data.sectors,
  communities: data.communities || [],
  resources: data.resources || [],
  infrastructure: data.infrastructure || [],
  roads: data.roads || [],
  watchlistEntries: data.watchlistEntries || [],
  demoProfiles: data.demoProfiles || [],
  currentUser: data.currentUser,
  lockdownActive: data.system.lockdownActive,
  defconLevel: data.system.defconLevel,
  blockchainStatus,
  firebaseStatus,
});

export const useIBVAPStore = create<IBVAPState>((set, get) => {
  const setBackendOffline = () => set({ backendStatus: "offline" });

  const refreshAfter = (request: Promise<unknown>) => {
    void request
      .then(() => get().hydrateFromBackend())
      .catch(() => setBackendOffline());
  };

  const addLocalActivity = (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => {
    const activity = makeActivity(entry);
    if (get().backendStatus === "offline") {
      set((state) => ({ offlineLogQueue: [activity, ...state.offlineLogQueue] }));
    } else {
      set((state) => ({ activityLog: [activity, ...state.activityLog] }));
    }
    return activity;
  };

  return {
    guards: [],
    shifts: [],
    activityLog: [],
    alerts: [],
    cameras: [],
    sectors: [],
    communities: [],
    resources: [],
    infrastructure: [],
    roads: [],
    watchlistEntries: [],
    demoProfiles: [],

    offlineQueue: [],
    offlineLogQueue: [],
    lockdownActive: false,
    defconLevel: 2,
    soundMuted: false,
    currentUser: {
      name: "Local operator",
      rank: "Operator",
      badgeId: "LOCAL-OPERATOR",
      role: "Local command console",
    },
    backendStatus: "loading",
    isHydrated: false,
    isHydrating: false,
    lastSyncAt: null,
    blockchainStatus: DEFAULT_BLOCKCHAIN_STATUS,
    firebaseStatus: DEFAULT_FIREBASE_STATUS,

    hydrateFromBackend: async () => {
      if (get().isHydrating) return;
      set({ isHydrating: true });
      try {
        const response = await backendApi.getBootstrap();
        set({
          ...applyBackendData(response.data, response.blockchain, response.firebase),
          backendStatus: "online",
          isHydrated: true,
          lastSyncAt: response.meta.generatedAt,
        });
      } catch {
        set({
          backendStatus: "offline",
          isHydrated: true,
          guards: [],
          shifts: [],
          activityLog: [],
          alerts: [],
          cameras: [],
          sectors: [],
          demoProfiles: [],
        });
      } finally {
        set({ isHydrating: false });
      }
    },

    checkBackendHealth: async () => {
      try {
        await backendApi.health();
        set({ backendStatus: "online" });
      } catch {
        set({ backendStatus: "offline" });
      }
    },

    toggleSound: () => {
      const next = !get().soundMuted;
      tacticalSound.setMuted(next);
      set({ soundMuted: next });
    },

    setDefconLevel: (level) => {
      tacticalSound.playWarning();
      set({ defconLevel: level, lockdownActive: level === 1 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: `DEFCON-${level}`,
        sector: "All Sectors",
        details: `Alert state changed to DEFCON ${level}. Automated perimeter protocols activated.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("defcon", level, get().currentUser.name));
      }
    },

    triggerLockdown: () => {
      tacticalSound.playLockdown();
      set({ lockdownActive: true, defconLevel: 1 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: "LOCKDOWN-GLOBAL",
        sector: "All Sectors",
        details: "Global perimeter lockdown initiated. QRF units mobilized.",
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("lockdown", undefined, get().currentUser.name));
      }
    },

    abortLockdown: () => {
      tacticalSound.playClick();
      set({ lockdownActive: false, defconLevel: 2 });
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "lockdown_initiated",
        targetType: "system",
        targetId: "LOCKDOWN-ABORT",
        sector: "All Sectors",
        details: "Perimeter lockdown stand-down confirmed. Standard protocols restored.",
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.systemAction("abort_lockdown", undefined, get().currentUser.name));
      }
    },

    flushOfflineQueue: () => {
      const alerts = get().offlineQueue;
      const activityLog = get().offlineLogQueue;
      const count = alerts.length + activityLog.length;
      if (count === 0) return;
      tacticalSound.playAlert();
      void backendApi
        .sync(alerts, activityLog)
        .then((response) => {
          set({
            ...applyBackendData(response.data, response.blockchain, response.firebase),
            offlineQueue: [],
            offlineLogQueue: [],
            backendStatus: "online",
            lastSyncAt: new Date().toISOString(),
          });
        })
        .catch(() => setBackendOffline());
    },

    acknowledgeAlert: (alertId, actorName) => {
      tacticalSound.playClick();
      const actor = actorName || get().currentUser.name;
      const target = get().alerts.find((alert) => alert.id === alertId);
      if (!target) return;
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? { ...alert, status: "acknowledged", acknowledgedBy: actor }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "alert_resolved",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Acknowledged alert ${alertId}: ${target.eventType}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.actionAlert(alertId, "acknowledge", actor));
      }
    },

    escalateAlert: (alertId, actorName) => {
      tacticalSound.playAlert();
      const actor = actorName || get().currentUser.name;
      const target = get().alerts.find((alert) => alert.id === alertId);
      if (!target) return;
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? { ...alert, status: "escalated", acknowledgedBy: actor }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "alert_escalated",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Escalated alert ${alertId} (${target.eventType}) to QRF.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.actionAlert(alertId, "escalate", actor));
      }
    },

    resolveAlert: (alertId, actorName) => {
      tacticalSound.playClick();
      const actor = actorName || get().currentUser.name;
      const target = get().alerts.find((alert) => alert.id === alertId);
      if (!target) return;
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? { ...alert, status: "resolved", dispatchStatus: "resolved", acknowledgedBy: actor }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "alert_acknowledged",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Resolved alert ${alertId}: ${target.eventType}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.actionAlert(alertId, "resolve", actor));
      }
    },

    dispatchAlert: async (alertId, guardId, actorName) => {
      const target = get().alerts.find((alert) => alert.id === alertId);
      const guard = get().guards.find((item) => item.id === guardId);
      if (!target || !guard) throw new Error("Choose a valid incident and guard.");
      const actor = actorName || get().currentUser.name;
      const dispatchedAt = new Date().toISOString();
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                assignedGuardId: guard.id,
                assignedGuardName: guard.name,
                dispatchStatus: "dispatched",
                dispatchedAt,
              }
            : alert
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "guard_dispatched",
        targetType: "alert",
        targetId: alertId,
        sector: target.sector,
        details: `Dispatched ${guard.name} to ${target.eventType}.`,
      });
      if (get().backendStatus !== "offline") {
        const response = await backendApi.dispatchAlert(alertId, guardId, actor);
        await get().hydrateFromBackend();
        return response;
      }
      return null;
    },

    addAlert: (alertData) => {
      const newAlert: Alert = {
        ...alertData,
        id: generateId("ALT-2026"),
        timestamp: new Date().toISOString(),
        status: "open",
        acknowledgedBy: null,
      };
      tacticalSound.playAlert();
      if (get().backendStatus === "offline") {
        set((state) => ({ offlineQueue: [newAlert, ...state.offlineQueue] }));
        return;
      }
      set((state) => ({ alerts: [newAlert, ...state.alerts] }));
      addLocalActivity({
        actorId: "AI-VISION-CORE",
        actorName: "AI Detection Engine",
        actionType: "patrol_checkin",
        targetType: "alert",
        targetId: newAlert.id,
        sector: newAlert.sector,
        details: `Detected ${newAlert.level.toUpperCase()}: ${newAlert.eventType}. Confidence: ${newAlert.confidence}%.`,
      });
      refreshAfter(backendApi.createAlert(newAlert));
    },

    addGuard: async (payload) => {
      const response = await backendApi.createGuard(payload);
      set((state) => ({ guards: [response.guard, ...state.guards] }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "guard_created",
        targetType: "system",
        targetId: response.guard.id,
        sector: response.guard.currentSector || "All Sectors",
        details: `Created ${response.guard.rank} guard ${response.guard.name} with ${response.accessTier} access.`,
      });
      return response.guard;
    },

    addWatchlistEntry: async (payload) => {
      const response = await backendApi.createWatchlistEntry(payload);
      set((state) => ({ watchlistEntries: [response.entry, ...state.watchlistEntries] }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "watchlist_updated",
        targetType: "system",
        targetId: response.entry.id,
        sector: "All Sectors",
        details: `Added ${response.entry.type} watchlist entry ${response.entry.value}.`,
      });
      return response.entry;
    },

    removeWatchlistEntry: async (entryId) => {
      await backendApi.deleteWatchlistEntry(entryId);
      set((state) => ({ watchlistEntries: state.watchlistEntries.filter((entry) => entry.id !== entryId) }));
    },

    addDemoProfile: async (payload) => {
      const response = await backendApi.createDemoProfile(payload);
      set((state) => ({ demoProfiles: [response.profile, ...state.demoProfiles] }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "manual_review",
        targetType: "system",
        targetId: response.profile.id,
        sector: "All Sectors",
        details: `Added non-biometric demo review profile ${response.profile.displayName}.`,
      });
      return response.profile;
    },

    updateGuardStatus: (guardId, status) => {
      tacticalSound.playClick();
      const guard = get().guards.find((item) => item.id === guardId);
      if (!guard) return;
      set((state) => ({
        guards: state.guards.map((item) => (item.id === guardId ? { ...item, status } : item)),
      }));
      addLocalActivity({
        actorId: guardId,
        actorName: guard.name,
        actionType: status === "patrolling" ? "patrol_checkin" : "shift_started",
        targetType: "post",
        targetId: guardId,
        sector: guard.currentSector || "Base",
        details: `Guard ${guard.name} status changed to ${status.toUpperCase().replace("_", " ")}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.updateGuard(guardId, { status }));
      }
    },

    quickHandover: (outgoingGuardId, incomingGuardId, notes) => {
      tacticalSound.playClick();
      const outgoing = get().guards.find((guard) => guard.id === outgoingGuardId);
      const incoming = get().guards.find((guard) => guard.id === incomingGuardId);
      if (!outgoing || !incoming) return;
      const postId = outgoing.currentPostId || "POST-A1-MAIN";
      const sector = outgoing.currentSector || "All Sectors";
      const now = new Date().toISOString();
      set((state) => ({
        guards: state.guards.map((guard) => {
          if (guard.id === outgoingGuardId) return { ...guard, status: "off_duty", currentPostId: null, currentSector: null };
          if (guard.id === incomingGuardId) return { ...guard, status: "on_post", currentPostId: postId, currentSector: sector, shiftStart: now };
          return guard;
        }),
      }));
      addLocalActivity({
        actorId: incomingGuardId,
        actorName: incoming.name,
        actionType: "handover_completed",
        targetType: "post",
        targetId: postId,
        sector,
        details: `Shift turnover at ${postId}: ${outgoing.name} handed over to ${incoming.name}. ${notes || "Turnover complete."}`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.handover({ outgoingGuardId, incomingGuardId, notes }));
      }
    },

    performShiftHandover: (postId, outgoingGuardId, incomingGuardId, notes) => {
      void postId;
      get().quickHandover(outgoingGuardId, incomingGuardId, notes);
    },

    reassignShift: (shiftId, newGuardId, newGuardName) => {
      tacticalSound.playClick();
      const shift = get().shifts.find((item) => item.id === shiftId);
      if (!shift) return;
      set((state) => ({
        shifts: state.shifts.map((item) =>
          item.id === shiftId ? { ...item, guardId: newGuardId, guardName: newGuardName } : item
        ),
      }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "shift_started",
        targetType: "post",
        targetId: shiftId,
        sector: shift.sector,
        details: `Roster updated: shift ${shiftId} assigned to ${newGuardName}.`,
      });
      if (get().backendStatus !== "offline") {
        refreshAfter(backendApi.updateShift(shiftId, { guardId: newGuardId, guardName: newGuardName }));
      }
    },

    toggleCameraActive: (cameraId) => {
      tacticalSound.playClick();
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const status = camera.status === "online" ? "offline" : "online";
      const changes: Partial<Camera> = { status, aiActive: status === "online" };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Camera ${camera.name} toggled ${status.toUpperCase()}.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    setCameraSensitivity: (cameraId, threshold) => {
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const changes: Partial<Camera> = { confidenceThreshold: threshold };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: get().currentUser.name,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Camera ${camera.name} sensitivity adjusted to ${threshold}%.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    updateCameraDetection: (cameraId, updates) => {
      tacticalSound.playClick();
      set((state) => ({ cameras: state.cameras.map((camera) => camera.id === cameraId ? { ...camera, ...updates } : camera) }));
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, updates));
    },

    commitZoneMap: (cameraId, polygon, actorName) => {
      tacticalSound.playClick();
      const camera = get().cameras.find((item) => item.id === cameraId);
      if (!camera) return;
      const actor = actorName || get().currentUser.name;
      const changes: Partial<Camera> = { zonePolygon: polygon };
      set((state) => ({ cameras: state.cameras.map((item) => item.id === cameraId ? { ...item, ...changes } : item) }));
      addLocalActivity({
        actorId: get().currentUser.badgeId,
        actorName: actor,
        actionType: "zone_map_committed",
        targetType: "camera",
        targetId: cameraId,
        sector: camera.sector,
        details: `Committed new detection zone polygon (${polygon.length} coordinates) for ${camera.name}.`,
      });
      if (get().backendStatus !== "offline") refreshAfter(backendApi.updateCamera(cameraId, changes));
    },

    addActivityLog: (entry) => {
      const activity = addLocalActivity(entry);
      if (get().backendStatus !== "offline") refreshAfter(backendApi.addActivity(activity));
    },

    resetData: () => {
      tacticalSound.playClick();
      set({
        guards: [],
        shifts: [],
        activityLog: [],
        alerts: [],
        cameras: [],
        sectors: [],
        watchlistEntries: [],
        demoProfiles: [],
        offlineQueue: [],
        offlineLogQueue: [],
        lockdownActive: false,
        defconLevel: 2,
      });
      refreshAfter(backendApi.reset());
    },
  };
});
