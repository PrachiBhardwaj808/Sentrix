import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeIST(dateString?: string): string {
  const d = dateString ? new Date(dateString) : new Date();
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateIST(dateString?: string): string {
  const d = dateString ? new Date(dateString) : new Date();
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function calculateTimeRemaining(shiftEndIso: string): {
  hours: number;
  minutes: number;
  isExpired: boolean;
  text: string;
} {
  const end = new Date(shiftEndIso).getTime();
  // Using fixed or live now
  const now = new Date("2026-08-27T11:46:00+05:30").getTime();
  const diff = end - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, isExpired: true, text: "Shift ended" };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    hours,
    minutes,
    isExpired: false,
    text: `Ends in ${hours}h ${minutes}m`,
  };
}

export function generateId(prefix: string): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}
