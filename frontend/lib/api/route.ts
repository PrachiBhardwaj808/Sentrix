"use client";

const API_ROUTE_STORAGE_KEY = "sentrix_api_base_url";

export const DEFAULT_BROWSER_API_BASE_URL = "http://127.0.0.1:8000/api";
export const DEFAULT_SERVER_API_BASE_URL = "http://127.0.0.1:8000/api";

export const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_BROWSER_API_BASE_URL;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "").replace(/\/api$/, "") + "/api";
  }
  return `http://${trimmed.replace(/\/$/, "").replace(/\/api$/, "")}:8000/api`;
};

export const getStoredApiBaseUrl = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(API_ROUTE_STORAGE_KEY);
};

export const getBrowserApiBaseUrl = () => {
  return getStoredApiBaseUrl() || DEFAULT_BROWSER_API_BASE_URL;
};

export const setStoredApiBaseUrl = (value: string | null) => {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(API_ROUTE_STORAGE_KEY, normalizeApiBaseUrl(value));
  } else {
    window.localStorage.removeItem(API_ROUTE_STORAGE_KEY);
  }
};

export const apiRouteLabel = (value: string | null) => {
  if (!value || value === DEFAULT_BROWSER_API_BASE_URL) return "LOCAL";
  return value.replace(/^https?:\/\//i, "").replace(/\/api$/, "");
};
