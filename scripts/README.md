# Sentrix Automation & Startup Scripts

This directory contains utility launcher and orchestration scripts for the Sentrix platform across Windows, Linux, and macOS environments.

---

## Launcher Scripts

| Script | Platform | Description |
| --- | --- | --- |
| [`start_all.bat`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/scripts/start_all.bat) | Windows (Command Prompt / PowerShell) | Launches MediaMTX, Django backend API, and Next.js frontend in separate terminal windows. |
| [`start_all.sh`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/scripts/start_all.sh) | Linux / macOS (Bash) | Spawns Django backend API and Next.js frontend with unified process trapping and automatic cleanup on `SIGINT`/`SIGTERM`/`EXIT`. |

---

## Services Orchestrated

Running the startup scripts spins up the following local runtime stack:

1. **MediaMTX Relay** (`:8554` RTSP, `:8888` HLS, `:8889` WebRTC, `:9997` API)
   - Configuration: `backend/config/mediamtx.yml` (or `infrastructure/docker/mediamtx.yml`)
   - Binary path (Windows local dev): `backend/.localdata/bin/mediamtx.exe`

2. **Django Backend API** (`http://127.0.0.1:8000`)
   - Working Directory: `backend/`
   - Virtual Environment: Automatically activated from `backend/venv` if present, falling back to system `python3`.
   - Entry Command: `python manage.py runserver 127.0.0.1:8000`

3. **Next.js Command Console Frontend** (`http://localhost:3000`)
   - Working Directory: `frontend/`
   - Entry Command: `npm run dev`

---

## Path Resolution

Both scripts resolve the repository root dynamically relative to their script location:
- **Windows (`start_all.bat`)**: Uses `set "ROOT_DIR=%~dp0.."` to reliably locate `backend` and `frontend` regardless of the caller's working directory.
- **POSIX (`start_all.sh`)**: Uses `ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` for bulletproof directory resolution across subshells.

---

## Prerequisites

Before executing the startup scripts, ensure:
1. **Python 3.10+** is installed with backend requirements installed:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements-web.txt -r requirements-services.txt
   ```
2. **Node.js 18+** & **npm** are installed with frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Ports `3000`, `8000`, and `8888` are free and available on `localhost`.
