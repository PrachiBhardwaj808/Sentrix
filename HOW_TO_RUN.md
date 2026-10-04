# Border Surveillance System (BorderLens) - Setup & Run Guide

## Prerequisites
- Python 3.10+ (tested on Python 3.12)
- Node.js 18+ (tested on Node.js 20+)
- Windows OS (for MediaMTX Windows binary)

---

## Quick Start (Already Configured)
- **On Windows**: Double-click `START_ALL.bat`
- **On macOS / Linux**: Run `./start_all.sh`

This launches all 3 required background services:
1. **MediaMTX Relay**: on port 8888 (HLS), 9997 (API), 8554 (RTSP)
2. **Django Backend**: on http://127.0.0.1:8000
3. **Next.js Frontend (BorderLens)**: on http://localhost:3000

---

## Setup From Scratch (On a New Machine)

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-web.txt
pip install -r requirements-services.txt
pip install -r requirements-ai.txt
python manage.py runserver 127.0.0.1:8000
```

### 2. Media Relay Setup
The mediamtx.exe binary is located at `backend/.localdata/bin/mediamtx.exe`.
Run:
```bash
cd backend
.localdata\bin\mediamtx.exe config\mediamtx.yml
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## Camera Configuration
The camera 192.168.1.250 is pre-configured in `backend/.localdata/api_state.json`:
- **ID**: CAM-ALPHA-01
- **IP**: 192.168.1.250
- **RTSP Port**: 554
- **Username**: admin
- **Password**: Admin@123
- **Stream Path**: cam/realmonitor?channel=1&subtype=0

In the web app at http://localhost:3000/live-feed, you can select CAM-ALPHA-01 or directly type 192.168.1.250 into the input box to stream live video with real-time AI inference.
