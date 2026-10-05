# Sentrix

**See Risks. Map Impact. Respond Faster.**

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.12-blue)
![Next.js](https://img.shields.io/badge/next.js-16.3-black)
![Event](https://img.shields.io/badge/MyBharat-Hack%20for%20Social%20Cause-orange)

An AI-GIS public safety and mobility intelligence platform for Indian districts. It detects, locates, predicts, and coordinates response to risks, starting with Delhi.



---

## 1. Executive Summary

Urban safety and district administration require rapid, coordinated, and privacy-preserving response mechanisms. Sentrix integrates computer vision inference, automatic number plate recognition (ANPR), and geographical information systems (GIS) into a unified operational console. Designed for district command centers, law enforcement, and emergency response teams, Sentrix correlates camera feeds, vehicle movements, and spatial risk heatmaps to accelerate search-and-recovery operations while strictly enforcing consent-based biometrics and cryptographic evidence hashing.

---

## 2. The Problem in Delhi

Urban mobility and public safety challenges in National Capital Region (NCR) districts, specifically Delhi, demand automated, real-time spatial awareness:

- **Fatal Road Crashes**: Delhi recorded 1,617 road deaths in 1,578 fatal crashes in 2025, marking the highest annual fatality tally since 2019 (*Source: Delhi Traffic Police data via press reports*).
- **Hit-and-Run Incidents**: 59 percent of crashes in 2021 and 2022 were classified as hit-and-run incidents; pedestrians accounted for 57 percent of all hit-and-run victims (*Source: Delhi Road Crash Fatalities Report 2022*).
- **High-Risk Crash Blackspots**: Delhi Traffic Police identified 143 high-risk locations and blackspots across the district in 2025 requiring targeted monitoring and infrastructure intervention.
- **Missing Children and Vulnerable Youth**: Delhi ranked third among Indian territories for missing children in NCRB 2022 data (6,040 missing children recorded); approximately 430 children went missing in January 2026 alone, with nearly 90 percent aged 12 to 18 (*Source: NCRB 2022 report & regional police statistics*).

*Note: All statistical figures listed above are compiled from published press reports and official data releases and should be verified against primary district databases.*

---

## 3. A Human Story

*Illustrative composite scenario based on typical district missing-person response workflows.*

### Search and Recovery: Aarti (14 Years Old, North Delhi)

```
[08:00 AM] Reporting & Consented Enrollment
  - Family reports Aarti missing near Kashmere Gate ISBT.
  - Parent enrolls a single reference photograph with signed consent into Sentrix.

[08:14 AM] AI Camera Match & Vehicle Trace
  - Camera CAM-NORTH-04 flags a potential face candidate (confidence score 0.92).
  - System flags an adjacent e-rickshaw (Registration: DL-1ER-4821) via ANPR.

[08:22 AM] GIS Cross-Camera Trail Reconstruction
  - Sentrix maps the e-rickshaw registration across 3 downstream traffic cameras.
  - Spatial trajectory plots movement eastward toward GT Road.

[08:28 AM] Automated Responder Dispatch & Verification
  - PostGIS calculates distance to nearest PCR van (PATROL-NORTH-02, 1.2 km away).
  - Field officer receives location geotag, vehicle plate, and a 6-digit OTP.

[08:41 AM] Safe Handover & Evidence Ledger Lock
  - Field officers intercept vehicle, verify identity manually, and secure Aarti.
  - Handover confirmed via OTP entry; SHA-256 evidence log locked to audit ledger.
```

---

## 4. Solution Overview

Sentrix operates as a closed-loop intelligence cycle, bridging real-time video perception with spatial GIS analysis and field action.

### The Five-Stage Intelligence Loop

1. **Detect**: Stream video feeds to identify persons, vehicles, number plates, and anomalous activity using local YOLOv8 and EasyOCR models.
2. **Locate**: Map detections to precise geographic coordinates (WGS84) with polygon geofences, FOV cones, and sector bounds.
3. **Understand**: Correlate multi-camera events, track vehicle trajectories, and verify reference matches against consent-based registries.
4. **Predict**: Aggregate incident density into spatial heatmaps (KDE/DBSCAN) to identify emerging blackspots and coverage gaps.
5. **Respond**: Route geotagged alerts to the nearest field responder using spatial distance queries, secured by OTP handovers.

```mermaid
flowchart TD
    A[CCTV / RTSP Feeds] --> B[Local AI Inference Engine]
    B -->|Objects & ANPR| C[Django REST API & Rule Engine]
    C -->|Alert Normalization| D[(PostgreSQL / PostGIS)]
    C -->|WebSockets| E[Next.js GIS Command Console]
    D -->|Spatial Queries| F[Nearest-Responder Dispatch]
    E -->|Operator Review| G[OTP Verification & Handover]
    G -->|Evidence Audit| H[SHA-256 Custody Ledger]
    H -->|Feedback Loop| C
```

---

## 5. Use Cases and SDG Alignment

| Use Case | Core Capabilities | Target SDG Alignment | Expected Impact |
| --- | --- | --- | --- |
| **Missing Persons & Children** | Consented image matching, camera candidate flags | SDG 16.2 (End violence & exploitation of children), SDG 11 | Reduces child tracing window from days to minutes. |
| **Hit-and-Run & Vehicle Tracing** | ANPR, multi-camera vehicle tracking, plate matching | SDG 3.6 (Halve road traffic deaths), SDG 11.2 | Accelerates hit-and-run identification and stolen vehicle recovery. |
| **Traffic & Congestion Monitoring** | Vehicle counting, heavy-vehicle class filtering | SDG 3.6, SDG 11.2 (Safe & sustainable transport) | Identifies traffic bottlenecks and enforces lane restrictions. |
| **Risk Heatmaps & Spatial Gaps** | GIS incident clustering, FOV coverage overlay | SDG 11 (Sustainable Cities), SDG 13 | Guides police patrolling and surveillance deployment to high-risk zones. |
| **Border & Checkpoint Management** | Border point monitoring, perimeter tripwires | SDG 16 (Strong Institutions & Public Safety) | Optional deployment profile for inter-state and border checkpoints. |

---

## 6. Key Features and Implementation Scope

Features are categorized strictly according to codebase implementation state:

| Feature | Scope Status | Description & Codebase Implementation |
| --- | --- | --- |
| **Person & Vehicle Detection** | **Implemented** | Real-time object detection (YOLOv8/YOLOX) for persons, cars, trucks, and two-wheelers in `backend/app/services/inference/`. |
| **ANPR (Number Plate Reading)** | **Implemented** | License plate extraction and OCR using EasyOCR and bounding-box localization. |
| **Face Detection & Candidate Flagging** | **Implemented** | Face bounding-box localization using OpenCV/Haar with an extensible InsightFace embeddings interface. |
| **Geotagged Alerts & Telemetry** | **Implemented** | Real-time alert ingestion with latitude, longitude, camera ID, sector code, and risk severity. |
| **Satellite & Tactical GIS Map** | **Implemented** | Dual-layer SVG tactical GIS and periodic ArcGIS World Imagery basemap integration in `TacticalSectorMap.tsx`. |
| **Alert Lifecycle Management** | **Implemented** | Full state transition pipeline: `open` -> `acknowledged` -> `investigating` -> `resolved` / `false_positive`. |
| **Responder Dispatch with OTP** | **Implemented** | Guard assignment workflow featuring 6-digit OTP verification for secure physical handover. |
| **Cryptographic Evidence Hashing** | **Implemented** | SHA-256 hashing of evidence snapshots with optional smart-contract audit trail integration. |
| **Cross-Camera Vehicle Trail** | **Partial** | Timestamped multi-camera plate correlation interface in the alert investigation module. |
| **Risk Hotspot Heatmaps** | **Partial** | Incident density visualization overlay on tactical GIS maps; backend clustering integration ready. |
| **Short-Term Risk Forecast** | **Partial** | Spatial risk scoring calculated from historic sector alert rates and camera density. |
| **Nearest-Responder Assignment** | **Partial** | Haversine and PostGIS geospatial distance calculation for nearest guard identification. |
| **Camera Coverage-Gap Analysis** | **Partial** | Camera FOV cone rendering and sector boundary overlap analysis in the GIS canvas. |
| **Citizen & NGO Report Intake** | **Planned** | Web-based intake portal for public missing-person reports and field incident flagging. |

*Note: All AI detection outputs require human operator review before action is taken. Satellite layers provide periodic/static reference imagery, not live video.*

---

## 7. Responsible AI and Privacy

Sentrix is built around privacy-by-design principles to ensure compliance with ethical guidelines and data protection norms:

1. **Consent-Based Reference Registry**: Biometrics are never scanned against arbitrary public datasets. Face matching operates exclusively against opt-in, consent-verified missing-person or authorized reference entries.
2. **Backend-Only Embeddings**: Facial feature vectors (embeddings) are generated server-side and never exposed to the client or browser DOM.
3. **Mandatory Human Verification**: AI models generate candidate flags only. No automated dispatch or legal action occurs without explicit human operator confirmation.
4. **Demographic Neutrality**: Models perform object classification and geometric feature matching. Demographic profiling, age/gender inference, and appearance matching are strictly prohibited.
5. **Comprehensive Audit Logs**: Every view, query, candidate match, and status update generates an immutable audit record containing the timestamp, operator ID, and action.
6. **Retention and Deletion Controls**: Unflagged video frame caches are discarded immediately after inference. Reference biometrics are automatically purged upon case resolution.
7. **Synthetic Demo Data**: The repository default configuration uses synthetic test data and local camera loops for evaluation.

---

## 8. System Architecture

```mermaid
graph TD
    subgraph Client Layer
        A[Next.js 16 Web Console]
        B[Tactical GIS Map Engine]
    end

    subgraph API & Application Server
        C[Django 5.0 REST API]
        D[Authentication & Role Guard]
        E[Alert & Rule Dispatcher]
    end

    subgraph AI Inference Pipeline
        F[Python Inference Runner]
        G[YOLOv8 Object Detector]
        H[EasyOCR ANPR Module]
        I[Face Candidate Matcher]
    end

    subgraph Data & Storage Layer
        J[(PostgreSQL / PostGIS Database)]
        K[(Redis Event Cache)]
        L[Local Media Storage]
    end

    subgraph Integrity & External Services
        M[SHA-256 Evidence Hasher]
        N[Optional Smart Contract Ledger]
        O[MediaMTX RTSP / HLS Stream Relay]
    end

    A <-->|HTTP REST / WS| C
    B <-->|GIS Layers| A
    O -->|Video Frames| F
    F --> G & H & I
    G & H & I -->|Detections| C
    C --> D
    D --> E
    E --> J
    E --> K
    C --> L
    E --> M
    M -.->|Hashes| N
```

---

## 9. Tech Stack

| Layer | Technology | Primary Role |
| --- | --- | --- |
| **Frontend Console** | Next.js 16 (React 18), TypeScript | Responsive command center UI, real-time telemetry, operator workflows |
| **Styling & UI** | Vanilla CSS, Tailwind CSS, Lucide Icons | Tactical dark-mode theme, crisp GIS controls, operational density |
| **State Management** | Zustand | Local reactive store for cameras, alerts, guards, and system settings |
| **Backend Framework** | Django 5.0, Django REST Framework | Authenticated REST endpoints, business logic, alert management |
| **Spatial Database** | PostgreSQL 16 with PostGIS 3.4 | Geospatial indexing, spatial queries, sector polygon containment |
| **AI Inference** | Python 3.12, PyTorch, OpenCV | Computer vision pipeline, frame processing, detection modeling |
| **Object Detection** | Ultralytics YOLOv8 / YOLOX | Real-time classification of persons, vehicles, and optical threats |
| **ANPR Engine** | EasyOCR, PyTorch | License plate detection and text recognition from video crops |
| **Stream Relay** | MediaMTX (RTSP / HLS) | Multi-camera RTSP ingestion and low-latency HLS stream distribution |
| **Blockchain Audit** | Solidity, Web3.py / Ethers.js | Optional cryptographic evidence ledger and custody timestamping |

---

## 10. Scripted Demo Walkthrough (5 Minutes)

Follow this 5-minute script to demonstrate the core capabilities of Sentrix:

```
[00:00 - 01:00] Step 1: Missing Child Alert Ingest
  1. Open http://localhost:3000/alerts.
  2. Select "Register New Incident", choose "Missing Person Intake".
  3. Upload consented reference image for Aarti (Case #DEL-2026-8841).
  4. Notice the new alert entering 'Open' status with GeoPoint priority.

[01:00 - 02:15] Step 2: Camera Feed & ANPR Candidate Flag
  1. Navigate to http://localhost:3000/live-feed.
  2. Click 'Enable Local Camera' or select CAM-ALPHA-01 (Kashmere Gate ISBT).
  3. Simulate vehicle passage; observe the bounding box overlay flagging person (94%) and vehicle plate DL-1ER-4821.
  4. System generates candidate match notification for operator confirmation.

[02:15 - 03:30] Step 3: GIS Cross-Camera Trail Analysis
  1. Open http://localhost:3000/map.
  2. Toggle 'Tripwires' and 'Vehicle Tracks' on the Tactical GIS map.
  3. Observe the calculated trajectory line across Sector 4 (North Delhi).
  4. Click Sector 4 geofence to view active cameras and sentry availability.

[03:30 - 04:15] Step 4: Nearest-Responder Dispatch & OTP Lock
  1. From the Alert Detail pane, click 'Dispatch Nearest Officer'.
  2. System identifies PATROL-NORTH-02 as closest unit via PostGIS distance query.
  3. Click 'Issue Handover Code'; system generates 6-digit OTP (e.g., 849-204).
  4. Simulate guard arrival and OTP verification to transition alert to 'Resolved'.

[04:15 - 05:00] Step 5: Spatial Heatmap & Evidence Audit
  1. Switch Map view to 'Heatmap' mode to view updated risk density around ISBT.
  2. Navigate to Alert Evidence Vault; view SHA-256 snapshot checksum.
  3. Click 'Verify Integrity' to validate evidence against audit ledger logs.
```

---

## 11. Environment Setup & Installation

### Prerequisites

- **Python**: Version 3.10+ (tested on Python 3.12)
- **Node.js**: Version 18+ (tested on Node.js 20+)
- **Database**: PostgreSQL 16 with PostGIS extension (or local SQLite for dev testing)
- **OS**: Windows 10/11, macOS, or Linux

---

### Step 1: Clone and Environment Variables Configuration

```bash
git clone https://github.com/PrachiBhardwaj808/GeoLense.git Sentrix
cd Sentrix
```

Create a `.env` file inside `backend/`:

```env
# Backend Configuration
SECRET_KEY=sentrix-development-secret-key-change-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database Configuration (PostgreSQL / PostGIS)
DB_ENGINE=django.contrib.gis.db.backends.postgis
DB_NAME=sentrix_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=127.0.0.1
DB_PORT=5432

# Optional Firebase Configuration
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

---

### Step 2: Database Setup (PostGIS)

If using PostgreSQL with PostGIS:

```sql
CREATE DATABASE sentrix_db;
\c sentrix_db;
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

### Step 3: Backend Setup

#### On Windows (PowerShell / CMD)

```cmd
cd backend
python -m venv venv
call venv\Scripts\activate
pip install -r requirements-web.txt
pip install -r requirements-services.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

#### On macOS / Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-web.txt
pip install -r requirements-services.txt
python manage.py migrate
python3 manage.py runserver 127.0.0.1:8000
```

---

### Step 4: Stream Relay Setup (MediaMTX)

#### On Windows

```cmd
cd backend
.localdata\bin\mediamtx.exe config\mediamtx.yml
```

#### On macOS / Linux

Download MediaMTX binary for your architecture and run:

```bash
./mediamtx config/mediamtx.yml
```

---

### Step 5: Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The command console will be available at `http://localhost:3000`.

---

### Step 6: Quick Start (Automated Launchers)

- **Windows**: Double-click `START_ALL.bat`
- **macOS / Linux**: Execute `./start_all.sh`

---

### Verification

1. Backend Health: Navigate to `http://127.0.0.1:8000/api/v1/health/` (should return HTTP 200 OK).
2. Frontend Console: Navigate to `http://localhost:3000/dashboard`.
3. Typecheck Test: Run `npm run typecheck` inside `frontend/` to confirm zero TypeScript compilation errors.

---

## 12. API Reference

All API routes are versioned under `/api/v1/`.

| Method | Endpoint | Description | Payload / Query Parameters |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health/` | Service health status | None |
| `GET` | `/api/v1/cameras/` | List registered cameras | `sector`, `status` |
| `POST` | `/api/v1/cameras/` | Register new camera | `{ "camera_id": "CAM-01", "ip": "192.168.1.10", "lat": 28.61, "lng": 77.20 }` |
| `GET` | `/api/v1/alerts/` | Query alert registry | `status`, `severity`, `sector_id` |
| `POST` | `/api/v1/alerts/{id}/acknowledge/` | Acknowledge alert | `{ "operator_id": "OP-12" }` |
| `POST` | `/api/v1/alerts/{id}/dispatch/` | Assign responder & OTP | `{ "guard_id": "GRD-04" }` |
| `POST` | `/api/v1/inference/frame/` | Ingest frame for AI analysis | Form data: `image` file, `camera_id` |
| `GET` | `/api/v1/alerts/{id}/evidence/` | Fetch SHA-256 evidence log | None |
| `GET` | `/api/v1/sectors/` | Fetch sector bounds & GIS layers | None |
| `WS` | `/ws/alerts/` | WebSocket live alert channel | Authorized session token |

---

## 13. Key Impact Metrics

Sentrix measures system performance against non-fabricated operational benchmarks:

- **Incident Response Time**: Measured in minutes from initial alert generation to responder dispatch confirmation.
- **Search-and-Recovery Duration**: Measured in hours from missing-person report ingestion to physical handover completion.
- **ANPR OCR Accuracy Rate**: Measured as percentage of license plates correctly parsed under variable lighting conditions.
- **False Match Disambiguation Rate**: Measured as percentage of AI candidate flags evaluated and cleared by human operators.

---



---

## 15. Security, Governance, and Project Information

### Security Checklist

- [x] Session authentication enforced for all API routes.
- [x] Biometric embeddings restricted to server-side memory.
- [x] All uploads sanitized; strict MIME type and file extension verification.
- [x] Cryptographic SHA-256 hashing applied to all evidence media.
- [x] Secrets excluded from git index (`.env` added to `.gitignore`).

---





### Third-Party Notices & Attribution

Sentrix incorporates open-source libraries and public frameworks:
- **YOLOv8**: Ultralytics (AGPL-3.0 / Commercial)
- **EasyOCR**: Jaided AI (Apache-2.0)
- **OpenCV**: Open Source Computer Vision Library (Apache-2.0)
- **Next.js & React**: Vercel & Meta (MIT)
- **Django**: Django Software Foundation (BSD-3-Clause)
- **ArcGIS World Imagery**: Esri (Used for static/periodic basemap rendering)

---

### License
[MIT License](LICENSE)


