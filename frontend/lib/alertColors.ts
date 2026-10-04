import { Alert } from "@/lib/types";

export const alertColorFor = (alert: Pick<Alert, "level" | "status">) => {
  if (alert.status === "resolved") return { label: "Green", hex: "#16A34A" };
  if (alert.level === "critical") return { label: "Orange", hex: "#D97706" };
  if (alert.level === "high") return { label: "Red", hex: "#DC2626" };
  return { label: "Blue", hex: "#0284C7" };
};

export const alertSeverityLabel = (alert: Pick<Alert, "level">) =>
  alert.level === "medium" ? "Normal" : alert.level.charAt(0).toUpperCase() + alert.level.slice(1);
