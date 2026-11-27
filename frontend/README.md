# Sentrix Frontend Command Console

The **Sentrix Frontend** is a command-and-control web console built with **Next.js 16 (App Router)**, React 18, TypeScript, Tailwind CSS, Zustand, and Leaflet (`react-leaflet`).

---

## Directory Layout

```text
frontend/
├── app/
│   ├── (console)/        # Authenticated console shell (dashboard, live-feed, alerts, map, camera-management, guard-duty, admin)
│   ├── login/            # Operator login (password + 2FA OTP / WebAuthn passkey)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx          # Landing page
├── components/
│   ├── blockchain/       # Secondary evidence verification card
│   ├── camera/           # ZonePolygonEditor
│   ├── console/          # ConsoleHeader, ConsoleSidebar, BackendHydrator, OfflineSyncBanner
│   ├── demo/             # DemoIncidentButton
│   ├── guard/            # GuardCard, AttendanceHeatmap, ShiftHandoverModal
│   ├── map/              # SentrixLeafletMap, SentrixIntelligenceMap, MapControls, MapSearchBox
│   ├── shared/           # TacticalButton, TacticalCard, StatusPill, Modal
│   └── video/            # CameraVideoFeed, LocalCameraFeed, BoundingBoxOverlay, PTZControls
├── lib/
│   ├── api/              # REST client (client.ts) and WebSocket manager (websocket.ts)
│   ├── geospatial/       # Map search and geospatial helpers
│   ├── store/            # Zustand store (useIBVAPStore.ts)
│   └── types.ts
├── next.config.mjs
├── package.json
└── vitest.config.ts
```

---

## Key Features

- **Live Feed & Local Inference Preview:** `LocalCameraFeed` and `CameraVideoFeed` stream HLS/WebRTC (via MediaMTX) or browser-sampled frames to `POST /api/inference/frame`.
- **Interactive GIS Map:** Leaflet map rendering camera locations, alerts, road segments, and straight-line nearest-responder results from `/api/map/*`.
- **Operator-Reviewed Alerts & Dispatch:** Incident log with acknowledge/escalate/resolve actions and 6-digit OTP dispatch verification.
- **WebSocket State Sync:** Auto-reconnecting client for `/ws/alerts/` when connected to an ASGI backend.

---

## Setup & Checks

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Default `.env.local` values:
```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

Run checks and unit tests (7 tests across 2 files):
```bash
npm run typecheck
npm test
npm run build
```
