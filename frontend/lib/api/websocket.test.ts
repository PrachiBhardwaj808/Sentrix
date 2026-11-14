import { describe, expect, it, beforeEach } from "vitest";
import { useIBVAPStore } from "../store/useIBVAPStore";
import { getBrowserWebSocketUrl } from "./route";
import { Alert, Camera, Guard } from "../types";

describe("WebSocket State Store Handlers", () => {
  beforeEach(() => {
    // Reset relevant store state before each test
    useIBVAPStore.setState({
      alerts: [],
      cameras: [],
      guards: [],
      activityLog: [],
      defconLevel: 2,
      lockdownActive: false,
      wsStatus: "disconnected",
    });
  });

  it("handles incoming new alert and updates existing alert without duplicates", () => {
    const store = useIBVAPStore.getState();

    const sampleAlert: Alert = {
      id: "ALT-WS-001",
      sourceCameraName: "North Gate",
      sourceCameraId: "CAM-01",
      sector: "Sector Alpha-1",
      level: "critical",
      eventType: "fence_breach",
      timestamp: "2026-11-14T10:00:00Z",
      status: "open",
      confidence: 97.8,
      coordinates: { lat: 26.8467, lng: 80.9462 },
      objectClass: "Person",
      evidenceUrl: "",
      acknowledgedBy: null,
    };

    // 1. Incoming new alert
    store.handleIncomingAlert(sampleAlert);
    expect(useIBVAPStore.getState().alerts).toHaveLength(1);
    expect(useIBVAPStore.getState().alerts[0].id).toBe("ALT-WS-001");
    expect(useIBVAPStore.getState().alerts[0].status).toBe("open");

    // 2. Incoming update for existing alert (same ID)
    const updatedSample: Alert = {
      ...sampleAlert,
      status: "acknowledged",
      acknowledgedBy: "Inspector Verma",
    };
    store.handleIncomingAlert(updatedSample);
    expect(useIBVAPStore.getState().alerts).toHaveLength(1);
    expect(useIBVAPStore.getState().alerts[0].status).toBe("acknowledged");
    expect(useIBVAPStore.getState().alerts[0].acknowledgedBy).toBe("Inspector Verma");
  });

  it("handles camera status and telemetry updates live", () => {
    const store = useIBVAPStore.getState();

    const sampleCamera: Camera = {
      id: "CAM-02",
      name: "Perimeter Camera 2",
      sector: "Sector Beta",
      type: "fixed",
      rtspUrl: "rtsp://192.168.1.50:554/live",
      ipAddress: "192.168.1.50",
      status: "online",
      aiActive: true,
      personDetection: true,
      vehicleDetection: false,
      confidenceThreshold: 80,
      minObjectSizePx: 30,
      zonePolygon: [],
      triggerAction: "Guard Ping",
      dwellTimeSeconds: 5,
      fps: 25,
      resolution: "1080p",
      fovAngle: 90,
      coordinates: { lat: 26.85, lng: 80.95 },
    };

    useIBVAPStore.setState({ cameras: [sampleCamera] });

    store.handleCameraUpdated({
      ...sampleCamera,
      status: "offline",
      aiActive: false,
      confidenceThreshold: 90,
    });

    const cameras = useIBVAPStore.getState().cameras;
    expect(cameras).toHaveLength(1);
    expect(cameras[0].status).toBe("offline");
    expect(cameras[0].aiActive).toBe(false);
    expect(cameras[0].confidenceThreshold).toBe(90);
  });

  it("handles dispatch events with assigned guard and activity log entry", () => {
    const store = useIBVAPStore.getState();

    const sampleAlert: Alert = {
      id: "ALT-WS-002",
      sourceCameraName: "South Post",
      sourceCameraId: "CAM-03",
      sector: "Sector Gamma",
      level: "high",
      eventType: "unidentified_vehicle",
      timestamp: "2026-11-14T10:05:00Z",
      status: "open",
      confidence: 88.5,
      coordinates: { lat: 26.84, lng: 80.94 },
      objectClass: "Vehicle",
      evidenceUrl: "",
      acknowledgedBy: null,
    };

    const sampleGuard: Guard = {
      id: "G-202",
      name: "Constable Kumar",
      rank: "Constable",
      badgeId: "CK-202",
      photoUrl: "",
      phone: "+919876543210",
      emergencyContact: { name: "Sunita Kumar", phone: "+919876543211", relation: "Spouse" },
      callSign: "EAGLE-2",
      certifications: ["QRF-1"],
      bloodGroup: "O+",
      status: "on_post",
      currentPostId: "P-1",
      currentSector: "Sector Gamma",
      shiftStart: "06:00",
      shiftEnd: "14:00",
      attendanceHistory: [],
    };

    useIBVAPStore.setState({ alerts: [sampleAlert], guards: [sampleGuard] });

    store.handleDispatchEvent({
      alert: {
        ...sampleAlert,
        assignedGuardId: "G-202",
        assignedGuardName: "Constable Kumar",
        dispatchStatus: "dispatched",
      },
      guard: {
        ...sampleGuard,
        status: "patrolling",
      },
      activity: {
        id: "ACT-DISP-1",
        actorId: "SYSTEM",
        actorName: "Command Dispatcher",
        actionType: "guard_dispatched",
        targetType: "alert",
        targetId: "ALT-WS-002",
        sector: "Sector Gamma",
        details: "Dispatched Constable Kumar to unidentified vehicle",
        timestamp: "2026-11-14T10:06:00Z",
      },
    });

    const updatedAlerts = useIBVAPStore.getState().alerts;
    const updatedGuards = useIBVAPStore.getState().guards;
    const activityLog = useIBVAPStore.getState().activityLog;

    expect(updatedAlerts[0].assignedGuardId).toBe("G-202");
    expect(updatedAlerts[0].dispatchStatus).toBe("dispatched");
    expect(updatedGuards[0].status).toBe("patrolling");
    expect(activityLog).toHaveLength(1);
    expect(activityLog[0].id).toBe("ACT-DISP-1");
  });

  it("handles system-level DEFCON and lockdown events", () => {
    const store = useIBVAPStore.getState();

    store.handleSystemUpdated({
      defconLevel: 1,
      lockdownActive: true,
    });

    expect(useIBVAPStore.getState().defconLevel).toBe(1);
    expect(useIBVAPStore.getState().lockdownActive).toBe(true);

    store.handleSystemUpdated({
      defconLevel: 3,
      lockdownActive: false,
    });

    expect(useIBVAPStore.getState().defconLevel).toBe(3);
    expect(useIBVAPStore.getState().lockdownActive).toBe(false);
  });

  it("computes valid WebSocket URLs", () => {
    const url = getBrowserWebSocketUrl("/ws/alerts/");
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain("/ws/alerts/");
  });
});
