"use client";

import { useEffect } from "react";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

export function BackendHydrator() {
  const hydrateFromBackend = useIBVAPStore((state) => state.hydrateFromBackend);

  useEffect(() => {
    void hydrateFromBackend();
  }, [hydrateFromBackend]);

  return null;
}
