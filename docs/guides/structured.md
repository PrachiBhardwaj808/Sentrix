# Border Surveillance Implementation Structure

This document is the implementation blueprint for the border-surveillance platform. It translates the technology stack into modules, data contracts, delivery phases, and operational responsibilities.

## 1. Target architecture

```text
IP cameras (RTSP/ONVIF)
        |
        v
Video ingestion -> AI/CV inference -> Event bus -> Django rule engine
                                                       |
                           +---------------------------+---------------------------+
                           v                                                       v
             Firestore + Storage + FCM + Django Channels             Evidence smart contract
                           |                                           (custody + provenance)
                           +---------------------------+---------------------------+
                                                       v
                              Next.js dashboard deployed on Vercel
```

### Primary responsibilities

| Component | Responsibility | Runtime |
| --- | --- | --- |
| Video ingestion | Pull RTSP/ONVIF streams, sample frames, and publish work | Python/OpenCV, Redis Streams |
| AI inference | Detect, track, classify, read plates, and identify faces | Python, PyTorch, YOLO, ONNX Runtime/TensorRT |
| Event transport | Move detection events between services | Kafka or RabbitMQ |
| Django backend | Authenticated APIs, rule evaluation, persistence orchestration, and live updates | Django, Django REST Framework, Django Channels |
| Firebase | Alerts, media, users, notifications, and real-time dashboard data | Firestore, Storage, Auth, FCM, Cloud Functions |
| Evidence ledger | Preserve evidence custody and high-severity model provenance | Smart contract, blockchain |
| Frontend | Command-and-control dashboard, maps, video wall, and operator workflows | Next.js/React, TypeScript, WebRTC |
| Local surveillance runtime | Run inference near remote border posts and sync alerts | Existing CCTV/NVR or approved local server |
| Web deployment | Host the dashboard and web-facing application | Vercel |

## 2. Repository implementation layout

```text
.
├── backend/
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── app/
│   │   ├── api/
│   │   │   ├── urls.py
│   │   │   ├── permissions.py
│   │   │   ├── serializers/
│   │   │   ├── views/
│   │   │   └── consumers/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── logging.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── firebase.py
│   │   │   └── repositories/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── alerts/
│   │   │   ├── cameras/
│   │   │   ├── notifications/
│   │   │   └── rules/
│   │   └── workers/
│   │       ├── event_consumer.py
│   │       └── media_processor.py
│   └── tests/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   ├── public/
│   └── tests/
└── structured.md
```

## 3. Django backend implementation

### Data-state rule and local camera path

The repository contains no seeded operational records. Django starts with empty alerts, cameras, guards, sectors, and activity collections, and the Next.js client renders an explicit empty state until real records are registered or produced by the inference pipeline. The old ignored runtime state is rejected when it does not match the current state schema, preventing stale seed data from reappearing.

The Live Cameras page also provides a browser-local camera preview. `frontend/components/video/LocalCameraFeed.tsx` requests `getUserMedia` only after the operator clicks **Enable Local Camera**, attaches the stream to a native video element, samples compressed frames, sends them to Django's `/api/inference/frame` endpoint, and draws the returned detections. The full video stream is not uploaded. Production CCTV/RTSP sources still enter through the approved local ingestion service and a WebRTC/HLS relay.

### Project configuration

- `manage.py`: Django command entry point.
- `config/settings.py`: installed apps, middleware, Firebase credentials, Channels, CORS, logging, and environment configuration.
- `config/urls.py`: mounts API URLs and health endpoints.
- `config/asgi.py`: serves HTTP and WebSocket traffic through Django Channels.
- `config/wsgi.py`: conventional WSGI entry point for compatible hosting.

### API modules

| Module | Initial responsibility |
| --- | --- |
| `api/serializers/` | Validate and serialize camera, alert, detection, sector, and watchlist payloads |
| `api/views/alerts.py` | List, filter, acknowledge, assign, and close alerts |
| `api/views/cameras.py` | Register cameras, update configuration, and expose camera health |
| `api/views/detections.py` | Receive normalized detection events and provide history |
| `api/views/sectors.py` | Manage BOPs, sectors, and virtual-fence polygons |
| `api/views/watchlist.py` | Manage approved face and plate watchlist entries |
| `api/views/evidence.py` | Return evidence verification history for an alert |
| `api/consumers/alerts.py` | Push live alert updates through Django Channels |
| `api/permissions.py` | Enforce Guard, Operator, Admin, and Command Center roles |

Use Django REST Framework routers and version the public API under `/api/v1/`.

### Service boundaries

- `services/cameras`: camera registration, stream metadata, connection state, and health checks.
- `services/rules`: polygon/line-crossing checks, night movement rules, suspicious-activity rules, and cooldown/debounce logic.
- `services/alerts`: normalize detections into alerts, assign severity, deduplicate events, and manage lifecycle transitions.
- `services/notifications`: FCM notifications and optional external command-and-control webhooks.
- `services/evidence`: calculate evidence hashes, submit custody/provenance records, and retrieve verification history.
- `db/repositories`: isolate Firestore and Storage access from views and business logic.
- `workers/event_consumer.py`: consume Kafka/RabbitMQ messages and hand normalized events to the rule service.
- `workers/media_processor.py`: upload snapshots, face/plate crops, and short clips to Firebase Storage.

### Backend API surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health/` | Service and dependency health |
| `GET/POST` | `/api/v1/cameras/` | List and register cameras |
| `GET/PATCH` | `/api/v1/cameras/{camera_id}/` | Read or update camera configuration |
| `GET` | `/api/v1/alerts/` | Filter alerts by sector, type, severity, status, and time |
| `POST` | `/api/v1/alerts/{alert_id}/acknowledge/` | Acknowledge an alert |
| `POST` | `/api/v1/events/detections/` | Ingest a normalized detection event |
| `GET` | `/api/v1/alerts/{alert_id}/evidence/` | Return custody events and model provenance |
| `GET/POST` | `/api/v1/sectors/` | Manage sectors, BOPs, and virtual fences |
| `GET/POST` | `/api/v1/watchlist/` | Manage face and plate watchlist entries |
| `WS` | `/ws/alerts/` | Stream authorized live alert updates |

## 4. Detection and alert contracts

### Normalized detection event

```json
{
  "event_id": "evt_01H...",
  "camera_id": "cam_bop_001",
  "timestamp": "2026-08-26T12:30:45Z",
  "location": {"latitude": 27.7172, "longitude": 85.3240},
  "objects": [
    {
      "track_id": "track_42",
      "class": "person",
      "confidence": 0.94,
      "bbox": [0.12, 0.18, 0.31, 0.72]
    }
  ],
  "capability": "human_detection",
  "media": {"snapshot_path": null, "clip_path": null}
}
```

### Alert document

Store alert-worthy events at `alerts/{alertId}` in Firestore.

```text
alert_id, camera_id, sector_id, type, severity, status,
timestamp, location (GeoPoint), confidence, track_ids,
media_url, acknowledged_by, acknowledged_at, created_at, updated_at
```

Recommended alert statuses are `open`, `acknowledged`, `investigating`, `resolved`, and `false_positive`.

### Event handling rules

1. Do not write every video frame or bounding box to Firestore.
2. Debounce repeated detections by camera, capability, track, and time window.
3. Store only alert-worthy events in Firestore.
4. Batch raw analytics to Cloud Storage or BigQuery when required.
5. Keep media in Firebase Storage and save only stable references in the alert document.
6. Use GeoPoint plus a geospatial helper for sector/radius queries.

### Blockchain evidence accountability

The blockchain integration has two explicit responsibilities. It does not store video, images, biometric data, or complete user identities.

#### Chain of custody

When evidence is created, viewed, downloaded, assigned, or resolved, `services/evidence` appends a smart-contract custody event containing:

```text
alert_id, evidence_id, action, timestamp, actor_role, evidence_hash, previous_transaction_id
```

The evidence hash is calculated from the stored media file. The related Firebase alert stores the resulting transaction ID. During review, the dashboard retrieves the ordered custody records and compares a newly calculated file hash with the hash recorded in the creation event. This reveals evidence replacement or tampering without placing the evidence itself on-chain.

#### AI model provenance

For a high-severity alert, the backend appends a provenance record that binds the alert to the inference artefact that generated it:

```text
alert_id, model_id, model_version, model_artifact_hash,
confidence, decision_threshold, inference_timestamp, transaction_id
```

The model artifact hash identifies the approved model build. Recording it alongside the alert lets an auditor verify that the decision was generated by the expected model version and not by an untracked or modified model.

#### Smart-contract flow

1. AI inference produces a normalized detection event with its model metadata.
2. Django applies rules and creates the Firebase alert and protected media reference.
3. For a high-severity alert, Django hashes the media and records model provenance on-chain.
4. Each later evidence action adds a custody event to the same on-chain incident trail.
5. The dashboard reads the Firebase alert for live operations and the blockchain transaction IDs for verification.

## 5. AI/CV implementation order

1. OpenCV RTSP/ONVIF capture and frame sampling.
2. Human and vehicle detection using YOLO with ByteTrack or DeepSORT.
3. Redis Streams queue and normalized event publisher.
4. Django event consumer and Firestore alert persistence.
5. Virtual-fence polygon and line-crossing rules.
6. ANPR using plate detection plus EasyOCR or PaddleOCR.
7. Face detection and watchlist matching using RetinaFace/MTCNN plus ArcFace embeddings.
8. Night-time movement using low-light enhancement or IR feeds.
9. Suspicious-activity classification using pose estimation plus LSTM or ST-GCN.
10. ONNX Runtime/TensorRT optimization and packaging for the approved local or central server environment.

## 6. Frontend implementation

### Routes

- `/auth`: login and session state.
- `/dashboard`: alert summary, camera health, and operator KPIs.
- `/cameras`: camera registration, status, and live stream selection.
- `/alerts`: searchable alert queue and alert detail view.
- `/map`: BOP locations, sectors, fences, cameras, and alert markers.
- `/settings`: users, roles, notification preferences, and system settings.

### Shared client modules

- `lib/firebase.ts`: Firebase initialization and Firestore/FCM clients.
- `lib/api.ts`: Django REST API client with auth and error handling.
- `hooks/useAlerts.ts`: Firestore listener and WebSocket alert stream.
- `hooks/useCameras.ts`: camera list, health, and stream state.
- `components/video/`: WebRTC player and multi-camera wall.
- `components/maps/`: Leaflet or Mapbox layers for sectors and fences.
- `types/`: shared alert, detection, camera, sector, user, and watchlist types.

## 7. Authentication and security

- Use Firebase Authentication for user identity.
- Validate Firebase ID tokens at the Django boundary.
- Map Firebase custom claims to Guard, Operator, Admin, and Command Center roles.
- Enforce object-level authorization by sector and camera assignment.
- Keep credentials in environment variables and secret managers; never commit service-account JSON.
- Restrict CORS to the Vercel production domain and approved development origins.
- Redact sensitive face, plate, and location data from application logs.
- Audit alert acknowledgement, assignment, resolution, and watchlist changes.

## 8. Deployment structure

### Vercel

- Deploy the Next.js dashboard to Vercel.
- Configure Firebase client settings and the Django API base URL as Vercel environment variables.
- Use preview deployments for pull requests and production deployment from `main`.
- Keep WebRTC stream endpoints and WebSocket origins explicitly configured for the deployed domain.

### Django and edge services

- Run the Django API and event workers as separately managed services reachable by the Vercel application.
- Use existing CCTV/NVR recording and an approved border-post server for local inference when offline detection is required; if no local compute is available, synchronize recorded footage after uplink is restored.
- Synchronize alert metadata and selected media rather than raw video from edge nodes.
- Use GitHub Actions for backend checks, frontend checks, image/model packaging, and deployment triggers.

## 9. Environment variables

### Backend

```text
DJANGO_SECRET_KEY=
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=
DJANGO_CORS_ALLOWED_ORIGINS=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIRESTORE_DATABASE_ID=(default)
EVENT_BUS_URL=
REDIS_URL=
FCM_ENABLED=true
```

### Frontend

```text
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_ALERTS_WS_URL=
```

## 10. Testing and acceptance criteria

### Backend

- Unit-test rule evaluation, debouncing, severity assignment, and status transitions.
- Test DRF permissions for every role and protected resource.
- Test Firestore repository behavior with emulators or isolated test doubles.
- Test event consumer retry and dead-letter behavior.
- Test WebSocket authorization and alert delivery.

### Frontend

- Test alert feed filtering and acknowledgement workflows.
- Test camera status and reconnect states.
- Test map rendering of sectors and virtual fences.
- Test role-based navigation and protected routes.
- Run an end-to-end smoke test against a Firebase emulator and Django test server.

### End-to-end acceptance

The first vertical slice is complete when a single camera can produce a human-detection event, the Django service can apply a rule, an alert is written to Firestore, a snapshot is stored, and an authorized dashboard user sees the alert live and can acknowledge it.

## 11. Delivery phases

| Phase | Deliverable | Completion signal |
| --- | --- | --- |
| 1 | Project bootstrap | Django and Next.js health pages run locally |
| 2 | Single-camera ingestion | RTSP feed produces normalized events |
| 3 | Alert pipeline | Event-to-Firestore alert flow works end to end |
| 4 | Dashboard | Operators can see cameras, alerts, and map data |
| 5 | Specialized detection | ANPR, face, fence, night, and activity modules are independently testable |
| 6 | Production web deployment | Vercel preview and production deployments work with environment configuration |
| 7 | Local deployment | Border-post server can infer locally and synchronize alert data |
