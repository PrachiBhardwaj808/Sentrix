"use client";

import { backendApi, MapSearchResult } from "@/lib/api/client";

const RECENT_KEY = "sentrix_map_recent_searches";
const MAX_RECENT = 6;

export const parseCoordinateInput = (text: string): { lat: number; lng: number } | null => {
  const cleaned = text.trim().replace(/[()]/g, "");
  const match = cleaned.match(/^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

export const getRecentSearches = (): MapSearchResult[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MapSearchResult[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

export const saveRecentSearch = (result: MapSearchResult) => {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentSearches().filter((item) => item.id !== result.id);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([result, ...current].slice(0, MAX_RECENT)));
  } catch {
    // Recent searches are best-effort local UX state.
  }
};

export const clearRecentSearches = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export const searchMapLocations = async (query: string, limit = 8): Promise<MapSearchResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const coordinate = parseCoordinateInput(trimmed);
  if (coordinate) {
    return [{
      id: `coord:${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`,
      kind: "coordinates",
      label: `${coordinate.lat.toFixed(5)}, ${coordinate.lng.toFixed(5)}`,
      sublabel: "Direct coordinates",
      lat: coordinate.lat,
      lng: coordinate.lng,
      source: "coordinate_input",
    }];
  }
  const response = await backendApi.mapSearch(trimmed, limit);
  return response.results || [];
};
