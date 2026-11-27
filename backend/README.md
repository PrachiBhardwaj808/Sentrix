# Sentrix Backend Services

The **Sentrix Backend** is a Django 5.2 service providing REST APIs (`/api/*`), WebSocket alert broadcasting (`/ws/alerts/`), PostGIS/Haversine geospatial queries, lazy-loaded computer vision inference (YOLO + EasyOCR ANPR), and tamper-evident SHA-256 audit logging.

---

## Directory Layout

```text
backend/
├── app/
│   ├── api/
│   │   ├── consumers.py           # Channels WebSocket consumer (/ws/alerts/)
│   │   ├── routing.py             # Channels WebSocket URL routing
│   │   ├── routes/map.py          # Map search, nearby, features, workspace, nearest-responders, route
│   │   ├── repository.py          # Canonical state persistence & auth user separation
│   │   ├── throttling.py          # Rate limiting for login & map geocoding
│   │   └── views.py               # Core REST API views (/api/*)
│   ├── management/commands/       # seed_demo.py, clear_demo_data.py, import_local_state.py
│   ├── migrations/                # 0001_initial.py, 0002_spatial_features.py
│   ├── models.py                  # ApiStateDocument
│   └── services/
│       ├── analytics/rules.py     # CameraRuleEngine (repeated_plate, fence, dwell, night, crowd)
│       ├── audit/chain.py         # Local SHA-256 hash chain for alerts & activityLog
│       ├── broadcaster.py         # Sync/async Channels event broadcaster
│       ├── cameras/               # connection.py (private-IP check), relay.py (MediaMTX)
│       ├── evidence/              # Hashing, custody, optional Pinata & Firestore sink
│       ├── inference/             # LiveInferencePipeline, anpr/, person/, face/
│       ├── notifications/         # Exotel SMS, OTP, optional FCM
│       ├── spatial_store.py       # PostGIS GiST operators & Haversine fallback
│       └── triage/agent.py        # Reviewable incident fusion
├── blockchain/contracts/          # Optional EvidenceRegistry.sol (frozen/secondary)
├── config/                        # settings.py, urls.py, asgi.py, wsgi.py, mediamtx.yml
├── tests/                         # 23 unit test files (95 tests)
├── manage.py
├── requirements-web.txt
├── requirements-services.txt
└── requirements-ai.txt
```

---

## Key Capabilities

1. **AI Inference & Indian ANPR (`app/services/inference/`):** Lazy-loaded YOLO vehicle/person detection, EasyOCR ANPR with Indian plate normalization (`plate_format.py`), and DeepSORT tracking.
2. **Geospatial Engine (`app/services/spatial_store.py`):** PostGIS `ST_DWithin`, `ST_DistanceSphere`, and `ST_MakeEnvelope` with GiST indexing, falling back to in-memory straight-line Haversine on SQLite.
3. **Tamper-Evident Audit Chain (`app/services/audit/chain.py`):** Sequential SHA-256 hash chain over `alerts` and `activityLog`, verifiable via `GET /api/audit-chain`.
4. **Real-Time WebSocket Stream (`app/api/consumers.py`):** Django Channels consumer on `/ws/alerts/` (active under local ASGI `runserver`/Daphne; `docker-compose.production.yml` currently uses Gunicorn WSGI).

---

## Setup & Testing

See [docs/HOW_TO_RUN.md](../docs/HOW_TO_RUN.md) for full setup instructions.

Run the **95 backend unit tests** from the **repository root** (`Sentrix/`):

```bash
# Linux / macOS:
DJANGO_DEBUG=true python -m unittest discover -s backend/tests -v
DJANGO_DEBUG=true python backend/manage.py check

# Windows PowerShell:
$env:DJANGO_DEBUG="true"; python -m unittest discover -s backend/tests -v
```
