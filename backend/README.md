# Sentrix Backend Services

The **Sentrix Backend** is a high-performance Django outpost service providing geospatial intelligence, live video pipeline orchestration, multi-model AI inference adapters, and decentralized evidence integrity verification.

---

## Architecture Overview

```
backend/
├── app/
│   ├── api/             # REST routes, view controllers, and WebSocket handlers:
│   │   ├── consumers.py           # Real-time WebSocket consumer for /ws/alerts/
│   │   ├── routing.py             # Channels WebSocket URL routing
│   │   └── views.py               # REST API controllers
│   ├── core/            # App configuration, security throttling, rate limits, cryptographic helpers
│   ├── db/              # Database connection routers and spatial schema definitions
│   ├── management/      # Custom Django management commands (e.g. data migrations, setup)
│   ├── migrations/      # Django schema migrations
│   ├── models/          # Relational data models (alerts, cameras, guards, evidence)
│   ├── schemas/         # Data validation schemas and serialization types
│   ├── services/        # Domain business logic:
│   │   ├── broadcaster.py         # Asynchronous & synchronous real-time event broadcaster
│   │   ├── spatial_store.py       # PostGIS spatial operators & Haversine fallback engine
│   │   ├── location_workspace.py  # Spatial indexing, sector bounding boxes, GIS queries
│   │   ├── evidence_pipeline.py   # Multi-signature hash sealing & IPFS/Pinata dispatch
│   │   ├── camera_relay.py        # MediaMTX RTSP/WebRTC/HLS stream orchestration
│   │   └── inference/             # Computer vision inference workers (YOLO, DeepSORT, ANPR, Face)
│   └── workers/         # Background worker routines and pipeline listeners
├── blockchain/
│   └── contracts/       # Solidity smart contracts (EvidenceRegistry.sol)
├── config/              # Django core configuration (settings.py, urls.py, wsgi.py, asgi.py, mediamtx.yml)
├── tests/               # 23 automated test suites covering all services, REST APIs, and WebSockets
├── manage.py            # Django CLI management entry point
├── requirements-web.txt      # Core web framework, Channels, Daphne, and database dependencies
├── requirements-services.txt # Redis, Web3, cryptographic, and cloud storage clients
└── requirements-ai.txt       # Computer vision & deep learning libraries (OpenCV, PyTorch, YOLO)
```

---

## Key Capabilities

### 1. Geospatial PostGIS Intelligence Engine
- Native PostgreSQL/PostGIS spatial querying leveraging `ST_DWithin`, `ST_DistanceSphere`, `ST_MakeEnvelope`, and GiST spatial indexes.
- Transparent and graceful in-memory Haversine fallback when PostGIS / PostgreSQL is unavailable or when running on local SQLite.
- Spatial bounding box filtering, nearest-responder dispatch optimization, and sector evacuation routing.

### 2. Multi-Model AI Video Analytics
- Modular inference pipeline supporting YOLOv8 person/object detection, DeepSORT object tracking, and ANPR plate recognition.
- Lazy-loading architecture ensuring AI dependencies only initialize when inference workers run.
- Zero synthetic data generation: APIs report honest empty states when no active cameras or incidents exist.

### 3. Blockchain & Cryptographic Chain-of-Custody
- SHA-256 evidence hashing and immutable receipt generation.
- Dual-dispatch to IPFS (via Pinata) and EVM smart contracts (`EvidenceRegistry.sol`).
- Cryptographic proof generation ensuring digital evidence is tamper-evident and admissible in court.

### 4. Real-Time WebSocket Telemetry & Alert Stream
- Native Django Channels & Daphne ASGI WebSocket routing serving `/ws/alerts/`.
- Instant server-push delivery of live incident alerts, camera status updates, QRF guard dispatches, and DEFCON changes.
- Dual-mode channel layer: in-memory channel layer for local development and Redis channel layer for production clustering.

---

## Setup & Running Locally

### 1. Create Virtual Environment & Install Dependencies
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

# Install web and service dependencies
pip install -r requirements-web.txt -r requirements-services.txt

# (Optional) Install AI inference dependencies
pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-ai.txt
```

### 2. Run Database Migrations & System Checks
```bash
python manage.py check
python manage.py migrate
```

### 3. Launch Development Server
```bash
python manage.py runserver 127.0.0.1:8000
```

---

## Running Automated Tests

Run the full backend test suite with Django's test runner or Python's `unittest`:

```bash
# From repository root:
python -m unittest discover -s backend/tests -v

# Or from within the backend directory:
python -m unittest discover -s tests -t .. -v

# Run geospatial spatial store tests specifically:
python -m unittest backend.tests.test_spatial_store -v

# Run map search and routing API tests:
python -m unittest backend.tests.test_map_search -v
```
