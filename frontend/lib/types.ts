export type GuardStatus = "on_post" | "patrolling" | "break" | "unreachable" | "off_duty";

export interface AttendanceRecord {
  date: string;
  status: "present" | "absent" | "late" | "leave" | "swap";
  hours: number;
}

export interface Guard {
  id: string;
  name: string;
  rank: string;
  badgeId: string;
  photoUrl: string;
  phone: string;
  emergencyContact: { name: string; phone: string; relation: string };
  callSign: string;
  certifications: string[];
  bloodGroup: string;
  status: GuardStatus;
  currentPostId: string | null;
  currentSector: string | null;
  shiftStart: string;
  shiftEnd: string;
  assignedWeapon?: string;
  radioFrequency?: string;
  attendanceHistory: AttendanceRecord[];
}

export interface Shift {
  id: string;
  guardId: string;
  guardName: string;
  sector: string;
  postId: string;
  start: string;
  end: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  shiftName: "Morning (06:00–14:00)" | "Evening (14:00–22:00)" | "Night (22:00–06:00)";
}

export type ActionType =
  | "shift_started"
  | "shift_ended"
  | "alert_acknowledged"
  | "alert_escalated"
  | "alert_resolved"
  | "guard_dispatched"
  | "guard_created"
  | "watchlist_updated"
  | "manual_review"
  | "patrol_checkin"
  | "lockdown_initiated"
  | "zone_map_committed"
  | "handover_completed"
  | "unauthorized_access"
  | "blockchain_anchored";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorId: string | "SYSTEM";
  actorName: string;
  actionType: ActionType;
  targetType: "camera" | "alert" | "post" | "system";
  targetId: string;
  sector: string;
  details: string;
}

export type AlertLevel = "critical" | "high" | "medium";
export type AlertStatus = "open" | "acknowledged" | "escalated" | "resolved";
export type ObjectClass = "Person" | "Vehicle" | "Weapon" | "Drone" | "Animal / False Alarm" | "Unknown";

export interface Alert {
  id: string;
  level: AlertLevel;
  timestamp: string;
  sourceCameraId: string;
  sourceCameraName: string;
  eventType: string;
  confidence: number;
  coordinates: { lat: number; lng: number };
  objectClass: ObjectClass;
  evidenceUrl: string;
  status: AlertStatus;
  acknowledgedBy: string | null;
  sector: string;
  notes?: string;
  blockchainStatus?: "anchored" | "queued" | "not_anchored" | string;
  blockchainTxId?: string | null;
  blockchainBlockNumber?: number | null;
  blockchainIncidentHash?: string;
  evidenceSha256?: string;
  modelVersion?: string;
  modelArtifactHash?: string;
  plateNumber?: string;
  watchlistEntryId?: string;
  evidenceSource?: "ai_frame" | "demo" | "uploaded" | "camera" | string;
  assignedGuardId?: string | null;
  assignedGuardName?: string | null;
  dispatchStatus?: "unassigned" | "dispatched" | "arrived" | "resolved" | string;
  dispatchedAt?: string | null;
  smsStatus?: "not_configured" | "sent" | "failed" | string;
  smsProvider?: string;
  smsSentAt?: string | null;
  smsProviderMessageId?: string | null;
  smsError?: string | null;
  dispatchOtpStatus?: "sent" | "demo_ready" | "failed" | "not_configured" | "verified" | "expired" | string;
  dispatchOtpExpiresAt?: string | null;
  dispatchOtpChallengeId?: string | null;
  dispatchOtpMaskedPhone?: string | null;
  dispatchVerifiedAt?: string | null;
  identityStatus?: "unidentified" | string;
  reviewStatus?: "operator_review" | "potential_match" | "cleared" | string;
  requiresOperatorReview?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewProfileId?: string | null;
  reviewProfileLabel?: string | null;
  incidentId?: string;
  incidentStatus?: "new" | "review" | "acknowledged" | "dispatched" | "resolved" | "false_positive" | string;
  triageSeverity?: string;
  triageExplanation?: string;
  operatorNotice?: string;
}

export interface DemoProfile {
  id: string;
  displayName: string;
  role: string;
  badgeId: string;
  qrCode: string;
  profileImageUrl?: string;
  matchingEnabled: false;
  createdAt: string;
}

export type WatchlistType = "plate" | "face";
export type WatchlistStatus =
  | "Blacklisted"
  | "Authorized"
  | "Suspicious"
  | "Missing Person"
  | "Under Surveillance";

export interface WatchlistEntry {
  id: string;
  type: WatchlistType;
  value: string;
  label: string;
  reason: string;
  status: WatchlistStatus;
  createdAt: string;
}

export type CameraType = "ptz" | "fixed" | "thermal";
export type CameraStatus = "online" | "offline" | "signal_lost";
export type TriggerAction = "Siren Alarm" | "QRF Dispatch" | "Guard Ping" | "Floodlight Trigger";

export interface Point2D { x: number; y: number }

export interface Camera {
  id: string;
  name: string;
  sector: string;
  rtspUrl: string;
  ipAddress?: string;
  hostname?: string;
  rtspUsername?: string;
  rtspPort?: number;
  rtspChannel?: number | string;
  streamProfile?: "main" | "sub" | string;
  rtspPasswordConfigured?: boolean;
  enabled?: boolean;
  hlsUrl?: string;
  webrtcUrl?: string;
  type: CameraType;
  aiActive: boolean;
  personDetection: boolean;
  vehicleDetection: boolean;
  weaponDetection?: boolean;
  confidenceThreshold: number;
  minObjectSizePx: number;
  zonePolygon: Point2D[];
  triggerAction: TriggerAction;
  dwellTimeSeconds: number;
  status: CameraStatus;
  fps: number;
  resolution: string;
  fovAngle: number;
  coordinates: { lat: number; lng: number };
  pan?: number;
  tilt?: number;
  zoom?: number;
}

export interface POI {
  id: string;
  name: string;
  alias: string;
  threatLevel: "critical" | "high" | "medium";
  lastSightedSector: string;
  lastSightedTimestamp: string;
  facialMatchConfidence: number;
  flaggedReason: string;
  photoUrl: string;
  status: "Active Watchlist" | "Detained" | "Under Surveillance";
}

export interface ANPRRecord {
  id: string;
  plateNumber: string;
  vehicleType: string;
  timestamp: string;
  sourceCameraId: string;
  sector: string;
  status: "Blacklisted" | "Authorized" | "Suspicious" | "Flagged Cargo";
  matchNotes: string;
}

export interface Post {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  staffed: boolean;
  guardId?: string;
}

export interface Tripwire {
  id: string;
  name: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  armed: boolean;
}

export interface Sector {
  id: string;
  name: string;
  code: string;
  postsCount: number;
  staffedCount: number;
  threatLevel: "low" | "elevated" | "high" | "critical";
  centerCoordinates: { lat: number; lng: number };
  polygon: { lat: number; lng: number }[];
  posts: Post[];
  tripwires: Tripwire[];
}
