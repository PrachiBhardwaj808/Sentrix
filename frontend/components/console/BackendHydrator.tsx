"use client";

import { useEffect } from "react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";
import { connectAlertsWebSocket, disconnectAlertsWebSocket } from "@/lib/api/websocket";

export function BackendHydrator() {
  const hydrateFromBackend = useIBVAPStore((state) => state.hydrateFromBackend);

  useEffect(() => {
    // 1. Initial snapshot bootstrap
    void hydrateFromBackend();

    // 2. Establish live WebSocket channel listener
    connectAlertsWebSocket();

    return () => {
      disconnectAlertsWebSocket();
    };
  }, [hydrateFromBackend]);

  return null;
}
