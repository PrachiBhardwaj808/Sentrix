"use client";

import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { getBrowserWebSocketUrl } from "@/lib/api/route";
import { ActivityLogEntry, Alert, Camera, Guard } from "@/lib/types";

class AlertsWebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private baseReconnectDelay = 1000;
  private isIntentionallyClosed = false;

  public connect(): void {
    if (typeof window === "undefined") return;

    // If socket is already open or connecting, do nothing
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isIntentionallyClosed = false;
    const store = useIBVAPStore.getState();
    store.setWsStatus("connecting");

    const wsUrl = getBrowserWebSocketUrl("/ws/alerts/");

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        store.setWsStatus("connected");

        // Start heartbeat ping every 30 seconds
        this.startHeartbeat();

        // Subscribe to relevant channels
        this.send({
          type: "subscribe",
          channels: ["alerts", "cameras", "dispatches", "system"],
        });
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch {
          // Ignore unparseable frames
        }
      };

      this.socket.onclose = () => {
        store.setWsStatus("disconnected");
        this.stopHeartbeat();
        this.socket = null;

        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        store.setWsStatus("error");
      };
    } catch {
      store.setWsStatus("error");
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    useIBVAPStore.getState().setWsStatus("disconnected");
  }

  public send(payload: Record<string, unknown>): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  private handleIncomingMessage(message: Record<string, unknown>): void {
    const store = useIBVAPStore.getState();
    const event = message.event as string | undefined;
    const type = message.type as string | undefined;
    const payload = message.payload as Record<string, unknown> | undefined;

    if (type === "connection.established") {
      store.setWsStatus("connected");
      return;
    }

    if (type === "pong") {
      return;
    }

    if (!event || !payload) return;

    switch (event) {
      case "alert.created":
        store.handleIncomingAlert(payload as unknown as Alert);
        break;

      case "alert.updated":
        store.handleAlertUpdated(payload as unknown as Alert);
        break;

      case "camera.updated":
        store.handleCameraUpdated(payload as unknown as Camera);
        break;

      case "dispatch.created":
        store.handleDispatchEvent({
          alert: (payload.alert || payload) as unknown as Alert,
          guard: payload.guard as unknown as Guard | undefined,
          activity: payload.activity as unknown as ActivityLogEntry | undefined,
        });
        break;

      case "dispatch.verified":
        store.handleDispatchVerified((payload.alert || payload) as unknown as Alert);
        break;

      case "system.updated":
        store.handleSystemUpdated(
          payload as { defconLevel?: 1 | 2 | 3 | 4 | 5; lockdownActive?: boolean }
        );
        break;

      case "activity.created":
        store.handleActivityCreated(payload as unknown as ActivityLogEntry);
        break;

      default:
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const alertsWsManager = new AlertsWebSocketManager();

export const connectAlertsWebSocket = () => alertsWsManager.connect();
export const disconnectAlertsWebSocket = () => alertsWsManager.disconnect();
export const sendWebSocketMessage = (payload: Record<string, unknown>) =>
  alertsWsManager.send(payload);
