"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

export function ThemeController() {
  useEffect(() => {
    const syncTheme = () => applyTheme(getStoredTheme());
    syncTheme();
    window.addEventListener("sentrix-theme-change", syncTheme);
    return () => window.removeEventListener("sentrix-theme-change", syncTheme);
  }, []);

  return null;
}
