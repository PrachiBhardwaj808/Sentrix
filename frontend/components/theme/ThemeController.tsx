"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

export function ThemeController() {
  useEffect(() => {
    const syncTheme = () => applyTheme(getStoredTheme());
    syncTheme();
    window.addEventListener("borderlens-theme-change", syncTheme);
    return () => window.removeEventListener("borderlens-theme-change", syncTheme);
  }, []);

  return null;
}
