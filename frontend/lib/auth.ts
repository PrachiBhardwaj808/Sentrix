export type AccessTier = "admin" | "command" | "field";

export interface AuthSession {
  operatorId: string;
  name: string;
  rank: string;
  role: string;
  tier: AccessTier;
  token?: string;
  loginIp?: string;
  loginAt?: string;
  authMethod?: string;
}

interface DemoAccount extends AuthSession {
  passcode: string;
}

// These are intentionally demo-only credentials for the front-end preview.
// Production authentication should be moved to Firebase Auth or a Django
// session/token endpoint; anything shipped to a browser cannot be a secret.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    operatorId: "ADMIN-001",
    passcode: "BL-ADMIN-2026",
    name: "Sentrix System Administrator",
    rank: "Administrator",
    role: "Full system access",
    tier: "admin",
  },
  {
    operatorId: "SSB-2041",
    passcode: "BL-COMMAND-2041",
    name: "Inspector Arjun Mehta",
    rank: "Inspector",
    role: "Border Operations Lead",
    tier: "command",
  },
  {
    operatorId: "SSB-2098",
    passcode: "BL-FIELD-2098",
    name: "Rifleman Neha Rawat",
    rank: "Rifleman",
    role: "Field Sentry",
    tier: "field",
  },
];

const SESSION_KEY = "sentrix.auth.session";

export function authenticate(operatorId: string, passcode: string): AuthSession | null {
  // Browser-stored demo credentials are useful for local UI work only. A
  // production build must always use the backend/Firebase authority.
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE !== "true") return null;
  const normalizedId = operatorId.trim().toUpperCase();
  const account = DEMO_ACCOUNTS.find(
    (candidate) => candidate.operatorId === normalizedId && candidate.passcode === passcode
  );
  if (!account) return null;

  const { passcode: _passcode, ...session } = account;
  return session;
}

export function saveAuthSession(session: AuthSession): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as AuthSession;
    if (!session.operatorId || !session.name || !session.tier) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SESSION_KEY);
  }
}

const ACCESSIBLE_ROUTES: Record<AccessTier, string[]> = {
  admin: ["/dashboard", "/live-feed", "/alerts", "/map", "/analytics", "/guard-duty", "/admin"],
  command: ["/dashboard", "/live-feed", "/alerts", "/map", "/analytics", "/guard-duty"],
  field: ["/live-feed", "/alerts", "/map", "/analytics", "/guard-duty"],
};

export function canAccessRoute(session: AuthSession, pathname: string): boolean {
  return ACCESSIBLE_ROUTES[session.tier].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function defaultRouteFor(session: AuthSession): string {
  return session.tier === "admin" ? "/admin" : session.tier === "field" ? "/live-feed" : "/dashboard";
}
