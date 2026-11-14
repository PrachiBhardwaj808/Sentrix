# Sentrix Frontend Command Console

The **Sentrix Frontend** is a tactical command-and-control intelligence interface built with Next.js 14 (App Router), Tailwind CSS, TypeScript, and modern GIS/WebRTC mapping libraries.

---

## Architecture Overview

```
frontend/
├── app/                  # Next.js 14 App Router pages & layouts
│   ├── (console)/        # Authenticated command console layout and navigation shell
│   ├── alerts/           # Incident log, real-time alert feed, priority triage
│   ├── auth/             # Tactical biometric / passkey authentication handlers
│   ├── cameras/          # Live CCTV/NVR matrix, detection rules, stream health
│   ├── dashboard/        # Operational metrics, threat levels, active sector overview
│   ├── login/            # Secure guard/operator login portal
│   ├── map/              # Full-screen GIS sector tactical intelligence map
│   ├── settings/         # System thresholds, relay configs, telemetry settings
│   ├── globals.css       # Tailwind utility classes and tactical theme variables
│   ├── layout.tsx        # Root HTML document and provider wrapper
│   └── page.tsx          # Sentrix landing page and presentation portal
├── components/           # Reusable UI component modules
│   ├── blockchain/       # Cryptographic evidence receipt and chain-of-custody modals
│   ├── camera/           # Camera telemetry cards, RTSP status indicators
│   ├── console/          # Command console sidebar, header, operator profile
│   ├── dashboard/        # Analytics charts, incident frequency widgets
│   ├── demo/             # Guided demo workflows and interactive simulations
│   ├── guard/            # Guard duty cards, shift status pills, dispatch controls
│   ├── map/ & maps/      # Leaflet GIS canvas, tactical markers, route overlays
│   ├── shared/           # Cross-cutting UI badges, status indicators
│   ├── theme/            # Tactical theme provider (high-contrast dark mode)
│   ├── ui/               # Design system primitives (dialogs, tooltips, buttons)
│   └── video/            # HLS/WebRTC streaming players & local camera test component
├── hooks/                # Custom React lifecycle and real-time subscription hooks
├── lib/                  # Shared libraries, utilities, and API adapters
│   ├── api/              # Axios / Fetch HTTP client for Django REST endpoints
│   ├── geospatial/       # GIS geometry helpers, coordinate converters
│   ├── store/            # Client-side state management
│   ├── auth.ts           # Tactical session management
│   ├── evidence.ts       # Hash verification and IPFS receipt parsers
│   ├── firebase.ts       # Firebase client initialization
│   ├── passkey.ts        # WebAuthn / FIDO2 passkey authentication
│   ├── reports.ts        # PDF incident report generation
│   ├── sound.ts          # Tactical alert audio cues
│   ├── theme.ts          # Color tokens and tactical palettes
│   └── types.ts          # TypeScript type definitions for domain entities
├── public/               # Static assets, tactical icons, GIS map pins
├── tests/                # Frontend component and integration tests
├── Dockerfile            # Multi-stage production container build
├── next.config.mjs       # Next.js configuration and API proxy rewrites
├── package.json          # Dependency specifications and run scripts
└── tailwind.config.ts    # Tactical UI design tokens and Tailwind theme configuration
```

---

## Key Features

- **Tactical Command Center**: High-density, high-contrast dark theme engineered for 24/7 command center operations.
- **Interactive GIS Sector Map**: Vector map rendering with live responder positions, camera cones of vision, spatial distance buffers, and shortest-path evacuation routing.
- **Real-Time Video Matrix**: Multi-grid camera feed monitor with low-latency WebRTC and HLS streaming via MediaMTX relay.
- **Zero Fabrication Guarantee**: The UI displays honest empty states when backend services report no active data, never generating fictitious alerts or synthetic personnel.
- **Decentralized Evidence Verification**: Interactive cryptographic verification modal allowing operators to validate incident hashes directly against IPFS and EVM smart contracts.

---

## Setup & Running Locally

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file from `.env.example`:
```bash
cp .env.example .env.local
```

Key environment configurations:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
NEXT_PUBLIC_MEDIA_RELAY_URL=http://localhost:8888
```

### 3. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Building for Production

```bash
# Create optimized production build
npm run build

# Start production server
npm start
```
