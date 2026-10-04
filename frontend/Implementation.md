# BorderLens — Full Web Platform Implementation Plan
### Intelligent Border Video Analytics Platform (Command Center + Guard Duty System)
**Status:** Integrated UI → Backend-connected | **Data mode:** Django API with explicit empty states | **Owner:** Aki (Lead) + 5-person team

---

## 0. Why this doc exists

This is the single source of truth for building BorderLens as a **portfolio/demo-grade product**, not a prototype. Every screen, every empty state, every hover — built like it's shipping to a real command center. The frontend reads Django-owned records and never fabricates operational alerts, cameras, guards, identities, or evidence when the API has no data.

Your 4 reference screens (Alerts, Live Feed / Tactical Matrix, Map, Camera Management) are the visual bar. Nothing we ship should look worse than those.

---

## 1. Product Scope

### 1.1 Two surfaces
1. **SSB Command Console** (the app in your screenshots) — internal, authenticated, dense, tactical UI.
2. **Public Landing Page** — marketing/demo page explaining BorderLens, for judges/recruiters/stakeholders. Lighter, faster, sells the product in 30 seconds.

### 1.2 Command Console — modules
| # | Module | Status in your screenshots |
|---|--------|------------------------------|
| 1 | Dashboard | Referenced in sidebar, not shown — needs building |
| 2 | Live Feed (Tactical Operations Matrix) | Shown |
| 3 | Alerts (Incident Log) | Shown |
| 4 | Map (Sector Intelligence Map) | Shown |
| 5 | Camera Management (Detection Logic config) | Shown |
| 6 | **Guard Duty & Roster (NEW)** | Your ask — build from scratch |
| 7 | Intelligence (POI/watchlist, face match, ANPR history) | Sidebar exists, needs a page |
| 8 | Logistics | Sidebar exists, out of scope for v1 — stub only |
| 9 | Admin / Settings | Sidebar exists, needs a light page |

---

## 2. NEW MODULE — Guard Duty & Roster System

This is the centerpiece you asked for. Two linked halves: **Live Roster** (who's on shift right now) and **Activity Log** (append-only history of everything a guard/system does).

### 2.1 Live Roster — "On Duty Now"
A real-time-feeling board, not a spreadsheet.

**Layout:** Card grid (like the camera cards in Camera Management), one card per active guard:
- Photo/avatar (provided only when a real roster record includes one)
- Name, rank/designation (e.g., "Head Constable", "Sub-Inspector")
- Assigned Post / Sector (links to Camera Management sectors — e.g. "Sector Alpha-7, Gate 2")
- Shift window (e.g. 06:00–14:00 IST) + live countdown "Shift ends in 2h 14m"
- Contact: phone (click-to-call `tel:` link), radio call-sign (e.g. "ALPHA-7-NINER")
- Status pill: `On Post` / `Patrolling` / `Break` / `Unreachable`
- Quick actions: **Call**, **Message**, **Flag Incident** (pre-fills an Alert tied to that guard)

**Top bar of this page:**
- "X of Y posts staffed" counter, calculated from roster records returned by Django; show an explicit empty state when no roster is configured
- Sector filter, status filter, search by name/callsign
- "Shift Handover" button → opens a modal showing outgoing vs incoming guard for a post, with a handover note field

### 2.2 Shift Schedule (roster planning view)
- Weekly calendar/timeline view (rows = guards, columns = time blocks or days)
- Color-coded by sector
- Toggle between "This Week" / "Next Week"
- Editable through Django-backed actions; if the API is unavailable, disable persistence actions and show the disconnected state

### 2.3 Guard Profile page
Click any guard → detail page:
- Full contact card (phone, emergency contact, ID/badge number, blood group — realistic ops detail)
- Certifications (e.g. "Night Vision Equipment – Certified", "Firearms – Level 2")
- **Personal activity log**: every action this guard has logged — patrol check-ins, alerts acknowledged/escalated, handovers given/received
- Attendance history (last 30 days, present/absent/late — small calendar heatmap)

### 2.4 Activity Log (system-wide, append-only)
This is the audit trail — separate from the guard roster but linked to it.

**Table columns:** Timestamp | Actor (guard name or "SYSTEM") | Action Type | Target (Camera/Alert/Post ID) | Details | Sector

**Action types supported by the API:**
- `Shift Started` / `Shift Ended`
- `Alert Acknowledged` / `Alert Escalated`
- `Patrol Check-in` (guard pings a post as "checked", tied to a camera zone)
- `Lockdown Initiated` (ties to the red "INITIATE LOCKDOWN" button already in your UI)
- `Zone Map Committed` (ties to Camera Management's "Commit Zone Map")
- `Handover Completed` (outgoing guard → incoming guard, with note)
- `Unauthorized Access Attempt` (login/system-level entries, actor = "SYSTEM")

**Design:** Same visual language as the "Incident Log" table in your Alerts screenshot — reuse that pattern (level pill, timestamp, source, event type, expandable row) so it feels native, not bolted on.

**Filters:** date range, actor, action type, sector — mirrors the Alerts page's `PARAMETERS` panel for consistency.

### 2.5 Why this module matters for the pitch
Border/CCTV AI demos are common; a **human-accountability layer** (who was on post, who acknowledged what, who handed over to whom) is what makes this look like a real operations product instead of a computer-vision toy. Lead with this in any pitch/demo.

---

## 3. Information Architecture (sitemap)

```
/                          → Public landing page
/login                     → Auth

/dashboard                 → Command overview (KPI tiles + recent alerts + roster snapshot)
/live-feed                 → Tactical Operations Matrix (2x2 / 3x2 grid)
/alerts                    → Incident Log + detail panel
/map                       → Sector Intelligence Map
/camera-management         → Registry + Detection Logic config
/intelligence              → POI watchlist, face-match history, ANPR log
/guard-duty                → Live Roster ("On Duty Now")
/guard-duty/schedule       → Weekly shift schedule
/guard-duty/[guardId]      → Guard profile + personal log
/guard-duty/activity-log   → System-wide activity/audit log
/logistics                 → Stub ("Coming Soon")
/admin                     → Users, sectors, cameras, system settings
```

---

## 4. Tech Stack (locked in, per prior conversation)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **UI primitives:** shadcn/ui (matches your dark, precise, tactical aesthetic well)
- **Charts/heatmaps:** Recharts (attendance heatmap, alert-volume trend)
- **Maps:** Mapbox GL or Leaflet (dark tactical style tiles) for `/map`
- **State:** Zustand or React Context — keep the client state focused on current API data and local offline queues
- **Backend/data layer:** Firebase (Firestore + Auth + Storage + Cloud Functions) — already decided
- **Data mode:** Django's `/api/bootstrap` endpoint is the only operational data source. A disconnected browser shows empty state and local-camera controls; it does not fall back to fixtures.
- **Live video sources:** `components/video/LocalCameraFeed.tsx` supports an explicitly enabled browser camera, a local video file, and a browser-playable HTTP(S) CCTV/IP URL. Frames are sent to Django for the combined person/face/ANPR overlay; raw RTSP/NVR sources still require a WebRTC/HLS relay.
- **Backend API:** `frontend/lib/api/client.ts` centralizes requests for alerts, guards, cameras, shifts, system actions, offline sync, and blockchain verification.
- **Blockchain UI:** incident dossiers call the Django verification endpoint and can request backend-side anchoring. No RPC URL, contract address, or private key is exposed to the browser.
- **Icons:** lucide-react (already used in your screenshots' style)
- **Deployment:** Vercel

---

## 5. Dummy Data Model (contract-first)

Design these as if they were real Firestore collections. This makes the "no compromise" bar achievable — consistent, realistic data everywhere.

### `guards` collection
```ts
{
  id: string;
  name: string;
  rank: string;                // "Sub-Inspector", "Head Constable"
  badgeId: string;
  photoUrl: string;
  phone: string;
  emergencyContact: { name: string; phone: string; relation: string };
  callSign: string;
  certifications: string[];
  bloodGroup: string;
  status: "on_post" | "patrolling" | "break" | "unreachable" | "off_duty";
  currentPostId: string | null;
  currentSector: string | null;
  shiftStart: string;          // ISO
  shiftEnd: string;             // ISO
}
```

### `shifts` collection (schedule)
```ts
{ id, guardId, sector, postId, start: ISO, end: ISO, day: string }
```

### `activityLog` collection
```ts
{
  id: string;
  timestamp: string;           // ISO
  actorId: string | "SYSTEM";
  actorName: string;
  actionType: "shift_started" | "shift_ended" | "alert_acknowledged" |
              "alert_escalated" | "patrol_checkin" | "lockdown_initiated" |
              "zone_map_committed" | "handover_completed" | "unauthorized_access";
  targetType: "camera" | "alert" | "post" | "system";
  targetId: string;
  sector: string;
  details: string;
}
```

### `alerts` collection — matches your screenshot exactly
```ts
{
  id, level: "critical"|"high"|"medium", timestamp, sourceCameraId,
  eventType: string, confidence: number, coordinates: {lat, lng},
  objectClass: string, evidenceUrl: string, status: "open"|"acknowledged"|"escalated",
  acknowledgedBy: string | null
}
```

### `cameras` collection — matches Camera Management screenshot
```ts
{
  id, name, sector, rtspUrl, type: "ptz"|"fixed"|"thermal",
  aiActive: boolean, personDetection: boolean, vehicleDetection: boolean,
  confidenceThreshold: number, minObjectSizePx: number,
  zonePolygon: {x,y}[], triggerAction: string, dwellTimeSeconds: number,
  status: "online"|"offline"|"signal_lost"
}
```

Operational records are created by the camera/inference pipeline or authenticated operators. Do not seed names, watchlist subjects, camera URLs, coordinates, alerts, or media URLs in the repository. The dashboard renders counts and empty states from the records currently returned by Django.

---

## 6. Visual/UX Bar (matching your screenshots)

- **Palette:** near-black navy background (`#0B1120`-ish), electric blue accent, amber/orange for HIGH, red for CRITICAL, green for online/success — you're already using this, keep it locked in a `tailwind.config` theme, don't let new pages drift
- **Typography:** condensed/technical uppercase labels for metadata (SECTOR, TIMESTAMP, LVL), normal case for content — visible in every screenshot, keep it consistent on Guard Duty pages
- **Density:** this is a command console, not a consumer app — small text, tight spacing, information-dense tables and cards are correct, don't "clean it up" into whitespace
- **Status pills** (CRIT/HIGH/MED, ONLINE/OFFLINE, ON POST/PATROLLING) — build ONE reusable `<StatusPill>` component, use everywhere
- **Live feel:** blinking dot for "live", "SYNCING LIVE FEED…" style footer ticker, animated countdown timers on shift cards — cheap to build, huge for perceived realism
- **Empty/edge states:** design "SIGNAL LOST", "0 posts staffed", "no alerts in range" states — don't skip these, they show up in your own screenshots already

---

## 7. Build Plan — 6-Person Team, Parallelized

Assumes the AI/ML side is either already done or running in parallel per your earlier 5-day model plan; this plan is scoped to the **webapp only**.

### Phase 0 — Foundation (Day 1, whole team)
- Repo setup, Next.js + Tailwind + shadcn scaffold, design tokens (colors/type from section 6)
- Firestore schema stubbed per section 5
- Shared components: `StatusPill`, `DataTable`, `Sidebar`, `TopNav`, `Card`, `Modal`
- Auth wrapper should use the configured identity provider; local development may use the neutral local operator profile

### Phase 1 — Parallel build (Days 2–4)
| Person | Owns |
|---|---|
| Person 1 | Live Feed (Tactical Matrix) + camera video-tile component (reused everywhere a "feed" appears) |
| Person 2 | Alerts (Incident Log + detail panel) + Intelligence page (POI/ANPR/face-match) |
| Person 3 | Map (sector map + legend + recent alerts panel) |
| Person 4 | Camera Management (registry + detection logic config) |
| Person 5 | **Guard Duty: Live Roster + Guard Profile pages** |
| Person 6 | **Guard Duty: Schedule view + Activity Log page** + Dashboard KPI tiles |

Daily 15-min sync to catch component drift (someone building a second `StatusPill` variant, etc.) — appoint one person (suggest: you) as design-consistency owner.

### Phase 2 — Integration + Public Landing Page (Day 5)
- Wire cross-links: Alert → guard who acknowledged it; Guard Profile → their logged alerts; Camera → its live feed tile; Map pins → camera/alert detail
- Public landing page: hero, problem/solution, 3–4 product screenshots (use your real screens), CTA to request a demo
- Loading skeletons + empty states pass

### Phase 3 — Polish pass (Day 6, whole team, "no compromise" day)
- Responsive check (command console can stay desktop-first, but landing page must be mobile-clean)
- Micro-interactions: hover states, button press feedback, toast confirmations on actions (Acknowledge, Escalate, Commit Zone Map, Shift Handover)
- Keyboard nav + focus states (accessibility isn't optional at MNC bar)
- Performance: image optimization, lazy-load feed tiles, Lighthouse pass ≥ 90
- Cross-browser check (Chrome, Safari, Firefox)
- Final data realism pass — reread section 5's "realism details" and confirm they're all present

---

## 8. Stretch / Differentiator (from your earlier notes)

**Offline resilience:** the console may pause synchronization and queue real operator-created events locally, but it must not manufacture a fixed number of pending alerts. The queue count must always be derived from actual queued records.

---

## 9. Definition of Done (per page)

A page is NOT done until:
- [ ] Matches the visual bar in section 6 (density, palette, typography, status pills)
- [ ] Has a deliberate empty/edge state and renders real API records when available
- [ ] Every clickable element does something (or is disabled with a clear reason when the API/source is unavailable)
- [ ] Cross-links to at least one other module where it makes sense (guard ↔ alert ↔ camera ↔ sector)
- [ ] Reviewed by the design-consistency owner before merge

---

## 10. Immediate Next Steps

1. Configure the Django API URL in `frontend/.env.local` or the Vercel project settings.
2. Run the Django API and verify `GET /api/health` and `GET /api/bootstrap`.
3. Configure the blockchain placeholders in the backend secret manager and deploy the `EvidenceRegistry` contract.
4. Replace the local JSON repository with Firebase-backed persistence when the authenticated production data layer is ready.
