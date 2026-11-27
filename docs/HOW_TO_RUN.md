# Sentrix — Setup, Configuration & Execution Guide

This guide covers local development, Docker Compose deployment, AI model setup, and test execution for Sentrix.

---

## 1. Prerequisites

| Requirement | Version / Notes |
|---|---|
| **Python** | 3.12 recommended (tested in CI on Python 3.12; 3.10+ compatible) |
| **Node.js & npm** | Node.js 20+ (tested in CI on Node.js 22) |
| **Git** | For cloning the repository |
| **Docker & Docker Compose** | Optional; required for containerized dev or production PostGIS/Redis/Caddy stack |
| **MediaMTX** | Optional for RTSP camera relay (`bluenviron/mediamtx` in Docker, or local binary at `backend/.localdata/bin/mediamtx.exe` on Windows) |

---

## 2. Clone & Environment Configuration

```bash
git clone https://github.com/PrachiBhardwaj808/Sentrix.git
cd Sentrix
```

### Backend Environment (`backend/.env`)

```bash
cp backend/.env.example backend/.env
```

Key variables in `backend/.env`:

| Variable | Local Default / Example | Purpose |
|---|---|---|
| `DJANGO_DEBUG` | `true` (local) / `false` (prod) | Enables debug mode; when `false`, `DJANGO_SECRET_KEY` is required |
| `DJANGO_SECRET_KEY` | `<random-secret>` | Required when `DJANGO_DEBUG=false` |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Allowed HTTP hostnames |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:3000,http://localhost:3000` | Permitted browser origins |
| `DJANGO_DB_ENGINE` | `sqlite` (unset) or `postgis` | Selects SQLite (`.localdata/django.sqlite3`) or PostgreSQL/PostGIS |
| `SENTRIX_STATE_STORAGE` | `postgres` (with PostGIS) | Enables PostGIS spatial table projection when using PostgreSQL |
| `AUTH_REQUIRE_2FA` | `true` | Enforces 2FA OTP on password login |
| `AUTH_ALLOW_DEMO_USERS` | `false` | Local-only switch to seed demo operator accounts |
| `AUTH_ALLOW_DEMO_OTP` | `false` | Local-only loopback OTP bypass (keep `false` in production) |
| `SENTRIX_ENABLE_DEMO_DATA` | `false` | Gates `python manage.py seed_demo` |
| `SENTRIX_GEOCODER_PROVIDER` | `local` | `local` (offline collections), `nominatim`, or `disabled` |
| `AI_DEVICE` | `cuda` (or `cpu`) | Inference device (`cuda`, `mps`, or `cpu`) |
| `MEDIA_RELAY_ENABLED` | `true` | Enables MediaMTX RTSP-to-HLS/WebRTC relay integration |

### Frontend Environment (`frontend/.env.local`)

```bash
cp frontend/.env.example frontend/.env.local
```

Key variables in `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=&copy; OpenStreetMap contributors
```

---

## 3. AI Model Setup

Model weights are excluded from Git and stored locally under `backend/.localdata/models/` (or configured via environment variables):

```text
backend/.localdata/models/
├── yolov8n.pt                    # Default vehicle & person detector (PERSON_MODEL_PATH / ANPR_VEHICLE_MODEL_PATH)
├── INPD_more_accuracy_n.pt       # Optional Indian license-plate detector (ANPR_PLATE_MODEL_PATH)
└── yolov8n-face-keypoints.pt     # Optional face detector (FACE_MODEL_PATH)
```

- If `ANPR_PLATE_MODEL_PATH` is not present, `AnprService` automatically falls back to scanning detected vehicle crops with EasyOCR (`vehicle_crop_fallback`).
- If `FACE_MODEL_PATH` is not present, `FaceDetectionService` uses OpenCV's bundled Haar cascade fallback.
- If `backend/.localdata/models/yolov8n.pt` is not present, Ultralytics will attempt to download `yolov8n.pt` on first inference call if network access is available, or report a configuration error on `/api/inference/frame`.

---

## 4. Running Locally (Without Docker)

### 4.1 Backend Setup & Execution

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

# Install web & service dependencies
pip install -r requirements-web.txt -r requirements-services.txt

# Install AI dependencies (CPU PyTorch example)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ai.txt

# Verify configuration and apply migrations (creates .localdata/django.sqlite3)
python manage.py check
python manage.py migrate

# Start the development server
python manage.py runserver 127.0.0.1:8000
```

> **Note on WebSockets:** `daphne` is in `INSTALLED_APPS`, so `manage.py runserver` serves both HTTP and `/ws/alerts/` WebSockets locally. You can also run ASGI explicitly with `daphne -b 127.0.0.1 -p 8000 config.asgi:application`.

### 4.2 Frontend Setup & Execution

In a new terminal:

```bash
cd frontend
npm ci
npm run dev
```

### 4.3 Quick Launch Scripts

From the repository root:

- **Windows:** `scripts\start_all.bat` (launches MediaMTX if present at `backend\.localdata\bin\mediamtx.exe`, Django backend, and Next.js frontend).
- **Linux / macOS:** `chmod +x scripts/start_all.sh && ./scripts/start_all.sh` (launches Django backend and Next.js frontend).

### 4.4 Accessing the Application

- **Command Console:** `http://localhost:3000`
- **Live Feed & Local Camera Test:** `http://localhost:3000/live-feed`
- **GIS Map:** `http://localhost:3000/map`
- **Backend Health Check:** `http://127.0.0.1:8000/api/health`

---

## 5. Running with Docker

### 5.1 Development Stack (`docker-compose.yml`)

Launches `media-relay` (MediaMTX), `backend` (Django + AI dependencies in CPU mode), and `frontend` (Next.js):

```bash
[ -f backend/.env ] || cp backend/.env.example backend/.env
docker compose build
docker compose up -d
```

To check status and logs:

```bash
docker compose ps
docker compose logs -f backend
curl http://localhost:8000/api/health
```

### 5.2 Production Baseline Stack (`docker-compose.production.yml`)

Launches `edge` (Caddy 2 with automatic TLS on ports 80/443), `frontend`, `backend` (Gunicorn WSGI), `database` (`postgis/postgis:16-3.5`), `cache` (`redis:7-alpine`), and `media-relay` on isolated internal Docker networks:

```bash
cp infrastructure/deployment/.env.example infrastructure/deployment/.env
cp backend/.env.example backend/.env
# Edit both .env files with your domain, DJANGO_SECRET_KEY, and POSTGRES_PASSWORD

docker compose --env-file infrastructure/deployment/.env -f docker-compose.production.yml up --build -d
```

For firewall, Caddy, and backup instructions, see [infrastructure/deployment/README.md](../infrastructure/deployment/README.md).

---

## 6. Running Tests & Checks

### Backend Tests (88 unit tests across 22 files)

Run from the **repository root** (`Sentrix/`):

```bash
# Linux / macOS:
DJANGO_DEBUG=true python -m unittest discover -s backend/tests -v
DJANGO_DEBUG=true python backend/manage.py check

# Windows PowerShell:
$env:DJANGO_DEBUG="true"; python -m unittest discover -s backend/tests -v
```

### Frontend Checks & Tests (7 unit tests across 2 files)

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

---

## 7. Demo Execution

1. Keep `SENTRIX_ENABLE_DEMO_DATA=false` in production. For a local demo, set `SENTRIX_ENABLE_DEMO_DATA=true`, `AUTH_ALLOW_DEMO_USERS=true`, and `AUTH_ALLOW_DEMO_OTP=true` in `backend/.env` (loopback only).
2. Optionally seed demo records: `python backend/manage.py seed_demo` (and clear later with `python backend/manage.py clear_demo_data`).
3. Open `http://localhost:3000/live-feed` and click **Enable Local Camera** (or load a local video file) to sample frames to `POST /api/inference/frame` and inspect vehicle, person, and ANPR detections.
4. For physical LAN/VPN RTSP cameras, register the camera in **Camera Management** using a private RFC 1918 IP address and your own camera credentials; never commit credentials to `.md` or `.env.example` files.

---

## 8. Troubleshooting

- **`ModuleNotFoundError: No module named 'backend'` when running tests:** Run `unittest discover` from the repository root (`Sentrix/`), not from inside `backend/`.
- **Port already in use (`3000`, `8000`, `8554`, `8888`):** Stop conflicting local processes before starting Docker Compose or `scripts/start_all.*`.
- **`DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=false`:** Set `DJANGO_DEBUG=true` for local development or provide a strong `DJANGO_SECRET_KEY` in `backend/.env`.
- **AI inference returns `503`:** Ensure `requirements-ai.txt` is installed and model weights exist or can be downloaded to `backend/.localdata/models/`.
