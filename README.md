# Sentrix

**See Risks. Map Impact. Respond Faster.**

[![CI](https://github.com/PrachiBhardwaj808/Sentrix/actions/workflows/ci.yml/badge.svg)](https://github.com/PrachiBhardwaj808/Sentrix/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/PrachiBhardwaj808/Sentrix)
![License](https://img.shields.io/badge/license-MIT-green.svg)
[![Python](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/next.js-14+-black.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%20%2F%20PostGIS-336791.svg)](https://postgis.net/)

Sentrix is an edge-capable, cloud-ready AI-GIS public safety and community resilience platform. It correlates live camera streams, real-time computer vision inference (person tracking, vehicle localization, Indian ANPR), and geographic information systems (GIS) with PostGIS spatial operators to provide district command centers with rapid situational awareness, nearest-responder dispatch, and cryptographically verifiable evidence chains.

---

## 1. Problem Statement

Urban districts and national capital regions face urgent public safety and emergency coordination challenges:

* **Hit-and-Run & Traffic Hazards**: Pedestrians and two-wheelers account for a disproportionate majority of road crash fatalities, often with delayed incident localization.
* **Missing Persons & Vulnerable Citizens**: Search-and-recovery windows require immediate cross-camera tracing without infringing on public privacy rights.
* **Geospatial Coordination Gaps**: Command centers frequently operate with fragmented tools where video surveillance feeds, spatial maps, and responder telemetry are disconnected.
* **Evidence Integrity & Chain of Custody**: Digital video evidence is vulnerable to tampering and dispute without cryptographic verification.

Sentrix addresses these challenges by uniting video perception, PostGIS spatial indexing, and blockchain custody into a single unified operational console.

---

## 2. Key Features

* **Multi-Model Computer Vision**: Local YOLOv8/v11 object tracking (persons, vehicles) and Indian license plate recognition (EasyOCR with state code normalization).
* **Consent-Gated Biometrics**: Privacy-by-design face detection with server-side embeddings; matching operates strictly against opt-in, consent-verified reference registries.
* **PostGIS Spatial Operators**: Database-level proximity search (`ST_DistanceSphere`, `ST_DWithin`) and bounding box filters (`ST_MakeEnvelope`, `&&`) with GiST indexing and graceful Haversine fallback.
* **Tactical GIS Command Console**: Multi-layer interactive Leaflet map rendering real-time incidents, cameras, patrol routes, community vulnerability scores, and infrastructure impact.
* **Nearest-Responder Dispatch**: Automated proximity calculations identifying the nearest quick-response team (QRF) or patrol van, secured by 6-digit OTP verification.
* **Optimal Route Recommendation**: Dynamic corridor analysis selecting open patrol paths while avoiding active hazard perimeters and affected road segments.
* **Immutable Evidence Ledger**: SHA-256 evidence hashing, local audit chains, IPFS Pinata off-chain storage, and optional Ethereum/Polygon smart contract anchoring (`EvidenceRegistry.sol`).
* **Enterprise Security**: WebAuthn/FIDO2 passwordless hardware key support, signed session tokens, rate limiting, and zero-trust internal Docker network segmentation.

---

## 3. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript, Tailwind CSS, Lucide Icons, Leaflet / GIS Engine |
| **Backend API** | Django 5.2, Python 3.12, Gunicorn, Psycopg 3, WebAuthn |
| **Spatial Engine** | PostgreSQL 16, PostGIS 3.5, GiST 2D Spatial Indexing, GeoJSON Import/Export |
| **AI & Inference** | PyTorch (CPU/CUDA), Torchvision, Ultralytics YOLOv8/v11, EasyOCR, DeepSORT |
| **Streaming Media** | MediaMTX (RTSP ingest, HLS & WebRTC ultra-low-latency playback) |
| **Cache & State** | Redis 7, In-memory LocMem fallback |
| **Integrations** | Web3.py (Solidity contracts), Pinata (IPFS), Google Cloud Firestore & FCM, Exotel SMS |
| **DevOps & Edge** | Docker, Docker Compose, Caddy 2 (Automated TLS Reverse Proxy), GitHub Actions CI |

---

## 4. High-Level Architecture

```text
[ RTSP / CCTV Cameras ]
          │
          ▼
[ MediaMTX Relay ] ──(HLS / WebRTC)──► [ Next.js Web Console (Port 3000) ]
          │                                         │
    (Video Frames)                            (HTTP / REST)
          ▼                                         ▼
[ AI Inference Pipeline ] ──────────────► [ Django Outpost API (Port 8000) ]
  • YOLO Person Tracking                            │
  • Indian ANPR / EasyOCR                   ┌───────┴───────┐
  • InsightFace / Haar                      ▼               ▼
                                   [( PostGIS 16 )]   [( Redis 7 )]
                                   • ST_DWithin       • Session Store
                                   • ST_Distance      • Cache
                                   • GiST Index
```

For complete architectural diagrams, state transitions, and component specifications, refer to [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md).

---

## 5. Repository Directory Structure

```
Sentrix/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Multi-job CI pipeline (backend, frontend, security)
├── backend/                       # Django 5.2 API Outpost
│   ├── app/                       # Core application, APIs, services, and workers
│   │   ├── api/                   # REST views, routes (map, auth), throttling, middleware
│   │   ├── services/              # Inference, spatial_store, analytics, evidence, audit
│   │   └── models.py              # Relational models and state persistence
│   ├── blockchain/contracts/      # EvidenceRegistry.sol smart contract
│   ├── config/                    # Django configuration (settings, urls, wsgi)
│   ├── tests/                     # 76 automated unit tests
│   ├── Dockerfile                 # Python 3.12 container definition
│   ├── requirements-web.txt       # Web framework dependencies
│   ├── requirements-services.txt  # Cloud and blockchain dependencies
│   └── requirements-ai.txt        # Deep learning and vision dependencies
├── frontend/                      # Next.js 14+ Tactical Command Console
│   ├── app/                       # App Router pages (alerts, live-feed, map, admin)
│   ├── components/                # UI components (GIS Leaflet map, video feed, controls)
│   ├── lib/                       # API clients, auth helpers, types, GIS calculations
│   └── Dockerfile                 # Multi-stage production container
├── infrastructure/                # Deployment and runtime configurations
│   ├── docker/                    # MediaMTX relay configuration
│   ├── deployment/                # Caddyfile reverse proxy, production README, env files
│   └── firebase/                  # Firestore security rules and index definitions
├── docs/                          # Comprehensive technical documentation
│   ├── architecture/              # System architecture and technical design
│   ├── implementation/            # Implementation notes and technical details
│   ├── blockchain/                # Smart contract architecture and setup guides
│   ├── deployment/                # Hardware specifications, Docker setup, and runbooks
│   ├── feature-documentation/     # Feature workflows and system capabilities (.docx)
│   ├── reports/                   # Audit reports and production readiness evaluations
│   └── guides/                    # Getting started and operational onboarding guides
├── scripts/                       # Multi-service launcher scripts
│   ├── start_all.bat              # Windows automated service launcher
│   └── start_all.sh               # Linux/macOS automated service launcher
├── docker-compose.yml             # Development orchestration (MediaMTX, backend, frontend)
├── docker-compose.production.yml  # Production stack (Caddy, PostGIS, Redis, backend, frontend)
├── firebase.json                  # Firebase deployment configuration
├── .firebaserc                    # Firebase project settings
├── vercel.json                    # Vercel deployment configuration
├── pyproject.toml                 # Ruff, Black, and test coverage configurations
└── README.md                      # Project master documentation
```

---

## 6. Installation & Setup

### Prerequisites
* **Python**: 3.10+ (tested on Python 3.12)
* **Node.js**: 20+ (with npm)
* **Git**

### Clone the Repository
```bash
git clone https://github.com/PrachiBhardwaj808/Sentrix.git
cd Sentrix
```

### Backend Setup
```bash
cd backend
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements-web.txt
pip install -r requirements-services.txt
pip install -r requirements-ai.txt

# Run migrations and start server
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

### Frontend Setup
```bash
cd frontend
npm ci
npm run dev
```

---

## 7. How to Run

### Quick Launch Scripts
Automated scripts start the MediaMTX stream relay, Django API backend, and Next.js frontend concurrently:

* **Windows**:
  ```cmd
  scripts\start_all.bat
  ```
* **Linux / macOS**:
  ```bash
  chmod +x scripts/start_all.sh
  ./scripts/start_all.sh
  ```

Once started, access the interfaces:
* **Command Console**: [http://localhost:3000](http://localhost:3000)
* **Live Camera Stream**: [http://localhost:3000/live-feed](http://localhost:3000/live-feed)
* **Backend API Health**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 8. Docker Setup Instructions

Sentrix includes ready-to-run multi-container Docker Compose configurations.

### Development Environment
Launches the frontend, backend (with AI inference enabled in CPU mode), and MediaMTX relay:

```bash
docker compose build
docker compose up -d
```

### Production Stack
Launches the hardened production stack featuring Caddy (automatic TLS on ports 80/443), PostGIS 16, Redis 7, Gunicorn, and isolated internal networks:

```bash
# 1. Configure environment files
cp infrastructure/deployment/.env.example infrastructure/deployment/.env
cp backend/.env.example backend/.env

# 2. Start the production stack
docker compose --env-file infrastructure/deployment/.env -f docker-compose.production.yml up -d
```

For in-depth Docker operational instructions, refer to [docs/deployment/DOCKER.md](docs/deployment/DOCKER.md) and [infrastructure/deployment/README.md](infrastructure/deployment/README.md).

---

## 9. Documentation Index

Detailed technical documentation is organized by domain in the [`docs/`](docs/) directory:

| Section | Document | Description |
|---|---|---|
| **Architecture** | [system-architecture.md](docs/architecture/system-architecture.md) | High-level system architecture, intelligence loops, and component specs |
| **Implementation**| [implementation.md](docs/implementation/implementation.md) | Technical implementation details and engineering design notes |
| **Blockchain** | [blockchain-implementation.md](docs/blockchain/blockchain-implementation.md) | Evidence ledger smart contract specification and event schemas |
| | [blockchain-setup.md](docs/blockchain/blockchain-setup.md) | Local testnet and Web3 deployment setup guide |
| **Deployment** | [DOCKER.md](docs/deployment/DOCKER.md) | Docker Desktop configuration, volume mounts, and container commands |
| | [hardware-and-deployment.md](docs/deployment/hardware-and-deployment.md) | Edge compute hardware requirements, camera specs, and topologies |
| | [infrastructure/deployment/README.md](infrastructure/deployment/README.md) | Production Caddy, UFW firewall, and PostGIS deployment guide |
| **Reports** | [PRODUCTION_READINESS.md](docs/reports/PRODUCTION_READINESS.md) | Operational audit, production checklist, and boundary analysis |
| **Guides** | [HOW_TO_RUN.md](docs/guides/HOW_TO_RUN.md) | Step-by-step developer onboarding and runtime troubleshooting |
| | [structured.md](docs/guides/structured.md) | Detailed feature walkthrough and architectural breakdown |

---

## 10. Testing & Verification

The backend test suite covers all subsystems, including PostGIS spatial operators, nearest-responder dispatch, route recommendations, and camera proxies:

```bash
cd backend
python -m unittest discover -s tests -v
```

To run Django system configuration checks:
```bash
python manage.py check
```

---

## 11. Contributing Guidelines

1. **Branching Strategy**: Branch from `main` using descriptive naming (`feature/your-feature`, `fix/issue-description`).
2. **Code Standards**:
   * Python: Formatted with Ruff / Black at a 120-character line limit.
   * TypeScript: Strict type safety enforced (`npm run typecheck`).
3. **Automated Testing**: Ensure all unit tests pass before submitting pull requests.
4. **Security**: Never commit real secret keys, private credentials, or live API tokens. Always use `.env.example` templates.

---

## 12. License

This project is licensed under the MIT License. See [backend/THIRD_PARTY_NOTICES.md](backend/THIRD_PARTY_NOTICES.md) for third-party library notices and license details.
