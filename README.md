# Sentrix

Sentrix is an AI-assisted geospatial operations console for reviewing incidents, camera observations, community reports, and response resources in one place. This README explains what the repository actually contains, how a normal operator workflow is intended to work, how to run the development app, and which parts still need service credentials or production validation.

> **Implementation boundary:** a feature in this repository is not automatically a live production service. Camera access, AI weights, SMS, Firebase, PostgreSQL/PostGIS, Redis, evidence storage, blockchain, and deployment infrastructure require configuration. The current backend/frontend CI workflow also has a known failing backend test: CI omits OpenCV while one test requires it. See [Current status](#current-status-and-known-limitations).

## Product overview

Sentrix consists of a Next.js operator console and a Django API. It supports operator authentication, operational records, incident review and status changes, a Leaflet-based GIS map, camera and inference integration points, guard dispatch/OTP flows, monitoring and audit endpoints, and optional external-service adapters. The system is designed to keep an authorized human in the decision loop.

The codebase does **not** currently provide a validated autonomous surveillance or emergency-dispatch service. Model detections are not proof of identity or wrongdoing. They must be reviewed by an authorized operator before action.

## Feature status

“Implemented” below means there is a corresponding code path in the repository. It does not mean that an external service is configured, an end-to-end production deployment is running, or a feature has passed operational acceptance testing.

| Capability | Status | What is in the repository | What remains or limits it |
|---|---|---|---|
| Web operations console | Implemented | Dashboard, alerts, map, live feed, camera management, guard duty, analytics, and admin screens | Some paths are redirects; see [Console pages](#console-pages) |
| Authentication and roles | Implemented, setup-dependent | Signed expiring sessions, backend role checks, account revocation, password and passkey flows, optional second-factor flow, audit records | Configure real operators, recovery policy, passkey domain, and approved identity/SMS services; do security testing |
| Login throttling | Implemented | Per-normalized-operator attempt limiting; Redis cache can be used in the production stack | Local-memory fallback is per-process; Redis-backed behavior needs deployment verification and does not stop distributed attacks |
| Alert lifecycle | Implemented | API actions support reviewing and changing alert state, including acknowledgement, investigation, resolution, and false-positive handling | Policies, escalation ownership, retention, and high-volume pagination need operational definition |
| Interactive GIS map | Implemented | Leaflet pan/zoom, togglable layers, markers and incident inspector; map features can be loaded by viewport | Useful results depend on importing accurate, licensed geographic records and configuring a tile provider |
| GeoJSON import | Implemented with limits | Admin import for Point community/resource/infrastructure features and LineString road features; validates WGS84 coordinates, stable IDs, and size/count limits | CSV/KML and richer geometries are not supported; validate source data before operational use |
| PostGIS spatial index | Implemented in deployment code; not run here | Migration creates spatial feature storage/index; API supports bounding-box feature reads | Docker was unavailable during the earlier implementation pass; live database path, performance, backup, restore, and multi-instance behavior remain unverified |
| Risk and impact indicators | Partial | Rule-based risk score, nearby community/resource/infrastructure calculations, correlations, and route suggestions | Heuristics are not a validated forecast, GIS network router, or emergency-planning model; no accuracy claim is made |
| AI person/face/ANPR pipeline | Partial and model-dependent | Normalized inference contracts and person, face-detection, and ANPR service adapters; optional InsightFace integration | Requires AI dependencies, model weights, compatible hardware, representative validation data, and review. The frame endpoint returns detections; it does not itself automatically persist an alert |
| Camera ingestion and browser playback | Partial and infrastructure-dependent | Camera registration/testing paths, MediaMTX configuration, relay authorization, and browser stream components | No camera fleet or relay was end-to-end tested; reconnect/health alerting, network/firewall rules, codec/browser coverage, and real camera credentials are needed |
| Guard dispatch and handover OTP | Implemented, provider-dependent | Assignment/dispatch APIs, OTP challenge, verification and handover records | Real SMS requires approved Exotel configuration and delivery testing; demo OTP is restricted and must stay disabled in production |
| Evidence integrity | Implemented locally; external anchoring optional | SHA-256 utilities, local audit hash chain, chain verification endpoint, evidence/outbox and optional Pinata/blockchain adapters | Hashing is not encryption or tamper-proof storage; durable retention, key custody, real provider configuration, and transaction/recovery tests remain |
| Firebase alert sync and FCM | Partial, provider-dependent | Optional Firestore projection, retry/outbox behavior, status endpoints, optional FCM sending | Configure service account, rules, indexes, topic, backups, and outage/recovery drills |
| Redis and PostgreSQL production stack | Configured in Compose; not run here | Private Compose networks, database/cache services, and backend environment wiring | No production host, secrets, DNS, firewall, WAF, or live container verification is included |
| Monitoring | Implemented locally | Backend metrics endpoint and dashboard model-health view with bounded latency metrics | No Prometheus/OpenTelemetry export or on-call alerting is configured |
| CI | Present, currently red | GitHub Actions backend tests/Django check and frontend typecheck/build | Backend test job fails because the CI install step omits `requirements-ai.txt`, so `cv2` is missing for a test. Frontend job passed in the latest run. |

## How the full workflow is intended to work

The sequence below explains how the available components fit together. Steps with external prerequisites only run when those prerequisites are configured; the current repository is not a turnkey, live operations center.

### 1. Operator signs in

The operator opens the Next.js app and signs in using the configured password or passkey route. The Django API verifies credentials and applies login throttling. If second-factor authentication is enabled, Django creates an OTP challenge and uses the configured delivery integration. Demo users and demo OTP are off by default and are restricted to explicitly enabled local testing. Successful authentication returns a signed, expiring session with the operator's tier. Frontend route guards improve navigation, but the backend must enforce authorization on protected actions.

Relevant code includes `frontend/app/login`, `frontend/lib/auth.ts`, and `backend/app/api/views.py` authentication endpoints.

### 2. Console loads operational state

After sign-in, the console's backend hydrator requests the API bootstrap data and stores the returned alerts, cameras, guards, sectors, and GIS records in the frontend state store. This is an initial hydration step; the current app does not establish a WebSocket or server-sent-events stream for continuous updates. A screen refresh or its explicit API actions are needed to retrieve changed data.

During local development the backend can persist state in its local JSON state file. Production Compose config selects PostgreSQL, but canonical operational state is presently represented by a single JSONB document. That is not yet a normalized, multi-instance-safe operational data model. GIS reference features are separately projected into PostGIS for spatial filtering.

### 3. Cameras and inference produce observations

A camera must be registered and reachable on a permitted private network. RTSP is not directly playable in a browser, so a configured MediaMTX relay converts/proxies the stream to a browser-compatible HLS/WebRTC path. The UI can also use a browser-local camera for development where browser permission is granted.

For frame inference, the Django `POST /api/inference/frame` endpoint accepts an image and calls enabled modules. Depending on installed libraries, available model weights, configuration, and hardware, these can include person detection/tracking, face localization, and vehicle/plate OCR. Face recognition/embedding comparison is a separate optional path and is disabled by default. Results include normalized detections and module/latency information. A frame inference response is not automatically an approved incident: the event/rule and operator-review flow must decide whether an alert should be recorded.

### 4. Incidents are assessed and reviewed

An incident can originate from an operator action, a community report, or a separately integrated detection/event caller. Backend analytics and triage endpoints apply configured rules and return reviewable candidate information. The interface can show severity, coordinates, evidence source, nearby alerts, and calculated risk context. These calculations use current application data and simple rules; they are not a trained predictive model or a certified emergency risk score.

An authorized operator inspects the candidate and updates the alert through the available state transitions. Only the operator's confirmed action should drive a real-world response. Face/plate observations require particular care, consent/legal basis, restricted access, retention rules, and human verification.

### 5. Map context supports decisions

The map displays configured alerts and reference layers and requests viewport-bounded GIS records as the map is moved. Administrators can upload a GeoJSON FeatureCollection for supported layer types. The importer limits request size and feature count and validates geometry type and coordinates. It does not confirm that a source dataset is accurate, current, legally usable, or appropriate for the district.

The impact inspector calculates nearby-resource/community distances, rule-based vulnerability/risk indicators, and simple route recommendations from the supplied records. “Nearest” is geometric distance, not drive-time routing. Import real, maintained reference data before relying on the map for response planning.

### 6. Dispatch and handover are recorded

An authorized command/admin operator assigns a guard to an alert and requests dispatch. The backend creates a short-lived, attempt-limited OTP challenge. If Exotel is configured, it can send the code; otherwise dispatch cannot be treated as a live SMS workflow. Demo OTP values are available only under explicit local demo settings. On arrival, the authorized workflow verifies the code and records handover/activity data, after which the operator can resolve the alert.

The repository has assignment and verification endpoints, but it does not prove that a real guard received an SMS, reached a location, or completed a safe handover. Those steps need a staffed operational procedure and field testing.

### 7. Evidence and audit records preserve integrity signals

Evidence utilities calculate SHA-256 hashes and the local audit chain links alert/activity mutation records so a later verifier can detect changes to the chain. Optional adapters can upload evidence to private Pinata/IPFS storage, project alert events to Firestore, and anchor hashes/custody events through a blockchain contract. These optional systems require credentials, deployed resources, retention rules, and a configured worker/sink. A hash proves byte-level consistency against a known digest; it does not encrypt evidence or make a writable database immutable.

### 8. Operators monitor service health

The backend exposes health, model/runtime metrics, Firebase status, blockchain status, and audit-chain verification endpoints. The UI can present local model metrics. Production monitoring still needs an external metrics/alerting stack, operational ownership, logs, backups, and tested outage/recovery runbooks.

## Architecture and data flow

```text
Operator browser (Next.js)
  ├── sign-in, role-aware screens, state store
  ├── incident, guard, camera, and GIS actions ── HTTPS/JSON ──> Django API
  ├── Leaflet map <── viewport features ──────────────────────> PostGIS projection
  └── HLS/WebRTC playback <── authorized relay path ─────────> MediaMTX

Camera / approved local frame
  └── configured relay or inference caller
        └── inference adapters (optional models and hardware)
              └── detections / rule evaluation / triage
                    └── human review and alert lifecycle
                          ├── guard assignment, OTP, handover
                          └── evidence hash and audit records
                                └── optional Firebase / private storage / chain

Production Compose baseline:
  Caddy public edge -> frontend + Django API
  Django -> private PostgreSQL/PostGIS and Redis networks
  Caddy -> private MediaMTX network
```

There is no implemented WebSocket/SSE event transport in the current route setup. Do not describe the console as continuously real-time until a push channel and reconnect behavior are implemented and tested.

## Console pages

| Path | Current behavior |
|---|---|
| `/login` | Authentication screen |
| `/dashboard` | Operational dashboard |
| `/alerts` | Alert list, review and actions |
| `/map` | Interactive GIS map, impact inspector, community reports and admin GeoJSON import |
| `/live-feed` | Camera/local feed and inference UI |
| `/camera-management` | Camera configuration and connection tools |
| `/guard-duty` | Guard and handover workflows |
| `/analytics` | Analytics/risk and model metrics views |
| `/admin` | Administrative controls and records |
| `/intelligence` | Redirects to `/alerts`; not a separate intelligence module |
| `/logistics` | Redirects to `/dashboard`; not a separate logistics module |
| Guard schedule, activity-log and detail subroutes | Currently redirect to `/guard-duty` |

## Running locally

### Requirements

- Python 3.12 recommended for the backend.
- Node.js 20 recommended for the frontend.
- AI packages and model weights are optional for basic API/UI development, but required for corresponding inference features.
- PostgreSQL/PostGIS and Redis are required only when testing the production storage/cache configuration. The local default can use the JSON state file.
- A running MediaMTX service and reachable camera are required for actual CCTV relay testing.

### Install and run the API

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements-web.txt -r requirements-services.txt
python manage.py check
python manage.py runserver 127.0.0.1:8000
```

Use `backend/.env.example` as a reference for environment variables. Create a local, untracked `backend/.env` only if your environment loader/deployment needs it. Set a development-only `DJANGO_SECRET_KEY`, local hosts/CORS origins, and keep demo flags off unless deliberately testing demo behavior. Do not copy old README sample passwords or camera credentials into a real environment.

To install the optional AI stack, review licensing and hardware first, then install `backend/requirements-ai.txt` and supply approved model files at paths configured by environment variables. Model weights are not included in Git.

### Install and run the console

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The frontend API base can be configured with `NEXT_PUBLIC_API_BASE_URL`; local defaults point to the development Django API. Use `frontend/.env.example` for map tile configuration. Follow the map tile provider's attribution and usage policy.

### Optional AI and service dependencies

Configure only the integrations you intend to test:

- **Cameras:** private camera reachability, relay config, and camera-specific credentials.
- **AI:** install AI dependencies; provide compatible model weights and device settings.
- **SMS/OTP:** approved Exotel account settings; never expose them to the frontend.
- **Firebase/FCM:** backend service account, Firestore rules/indexes, and explicit FCM settings.
- **PostGIS/Redis:** use the production Compose stack or a matching local service.
- **Pinata/blockchain:** approved private storage, deployed contract, server-side credentials, and evidence-retention policy.

## Production deployment baseline

The `docker-compose.production.yml` file is a single-host baseline, not a hosted deployment. It places Caddy on public ports 80/443, keeps the database/cache/relay on private container networks, and wires Django to PostgreSQL/PostGIS and Redis. Review [deploy/README.md](deploy/README.md) before use. You must provide a Linux host, Docker, DNS, unique secrets, valid environment values, backups, monitoring, and firewall/security-group rules. A WAF/DDoS service is external and is not supplied by Caddy or this repository.

The PostgreSQL state migration can import a local state file using `python manage.py import_local_state` as documented in the deployment guide. Treat that file as sensitive because it may contain operator records or credentials. Transfer it over a protected channel; do not commit it.

## API outline

The API is rooted directly at `/api` (it is **not** `/api/v1`). Routes are defined in `backend/config/urls.py`. Main groups include:

- **Authentication:** `/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/passkey/*`, `/api/auth/revoke`, `/api/auth/audit`.
- **Bootstrap and records:** `/api/bootstrap`, `/api/alerts`, `/api/alerts/{id}/action`, `/api/activity`, `/api/guards`, `/api/handover`.
- **Dispatch:** `/api/alerts/{id}/dispatch`, `/dispatch-sms`, and `/dispatch-otp/verify`.
- **GIS:** `/api/geospatial` and `/api/geospatial/{collection}/{id}`.
- **Camera and AI:** `/api/cameras/{id}`, `/api/cameras/test`, `/api/cameras/{id}/stream`, `/api/inference/frame`.
- **Analytics and trust:** `/api/analytics/evaluate`, `/api/analytics/triage`, `/api/audit-chain`, `/api/monitoring/metrics`.
- **External-service status:** `/api/firebase/status`, `/api/blockchain/status`, `/api/auth/exotel-status`.

Authentication and role requirements vary by endpoint. Consult `backend/app/api/views.py`; never infer authorization solely from frontend visibility.

## Development checks and CI

```bash
cd backend
DJANGO_DEBUG=true python -m unittest discover -s tests -v
DJANGO_DEBUG=true python manage.py check
DJANGO_DEBUG=true python manage.py makemigrations --check --dry-run

cd ../frontend
npm ci
npm run typecheck
npm run build
```

GitHub Actions runs backend tests/configuration checks and frontend typecheck/build on pushes and pull requests to `main`. **Known issue:** the current CI backend install step installs `requirements-web.txt` and `requirements-services.txt` but not OpenCV from `requirements-ai.txt`; the test `test_resized_inference_scales_boxes_back_to_source_coordinates` therefore fails with `ModuleNotFoundError: cv2`. The latest frontend CI job passed. A green local run made with the AI dependencies installed does not make that CI run green.

## Security and responsible use

- Keep secrets, local API state, camera passwords, model files, evidence, and signing keys out of Git and frontend environment variables.
- Keep demo user/OTP/data settings off in deployed environments.
- Restrict camera ingest and management APIs to trusted networks; never publish raw RTSP credentials.
- Treat face and plate data as sensitive. Use an appropriate legal basis, consent where required, access controls, retention/deletion rules, and documented human review.
- Keep automated detections as candidates. Do not use a model score as sole grounds for dispatch, enforcement, or adverse action.
- Configure HTTPS, secure cookies, allowed hosts, CORS/CSRF origins, firewall, backup/restore, monitoring, and incident response before launch.
- Read [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for detailed current limits and deployment checks.

## Repository guides

- [Production readiness and known limitations](PRODUCTION_READINESS.md)
- [Production deployment and local-state import](deploy/README.md)
- [Inference pipeline configuration and privacy](backend/app/services/inference/README.md)
- [Camera relay configuration](backend/app/services/cameras/README.md)
- [Environment examples](backend/.env.example), [frontend/.env.example](frontend/.env.example), and [deploy/.env.example](deploy/.env.example)
