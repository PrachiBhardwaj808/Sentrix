#!/usr/bin/env bash
# ==============================================================================
# Sentrix Multi-Service Launcher
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "===================================================="
echo "  Starting Sentrix AI GIS Intelligence OS  "
echo "===================================================="

PIDS=()

cleanup() {
  echo ""
  echo "Shutting down all Sentrix services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo "All services stopped."
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start Django Backend (if available)
if [ -d "$SCRIPT_DIR/backend/venv" ]; then
  echo "[1/2] Launching Django API backend on http://127.0.0.1:8000 ..."
  (
    cd "$SCRIPT_DIR/backend"
    # shellcheck disable=SC1091
    source venv/bin/activate
    python manage.py runserver 127.0.0.1:8000
  ) &
  PIDS+=($!)
elif command -v python3 &>/dev/null && [ -f "$SCRIPT_DIR/backend/manage.py" ]; then
  echo "[1/2] Launching Django API backend with system python3 on http://127.0.0.1:8000 ..."
  (
    cd "$SCRIPT_DIR/backend"
    python3 manage.py runserver 127.0.0.1:8000
  ) &
  PIDS+=($!)
fi

# 2. Start Sentrix Next.js Frontend
echo "[2/2] Launching Sentrix Next.js frontend on http://localhost:3000 ..."
(
  cd "$SCRIPT_DIR/frontend"
  npm run dev
) &
PIDS+=($!)

echo ""
echo "===================================================="
echo "  All Sentrix Services Online!                    "
echo "  - Sentrix Console:  http://localhost:3000        "
echo "  - Live Camera Feed:    http://localhost:3000/live-feed  "
echo "===================================================="
echo "Press Ctrl+C to terminate all services."
echo ""

wait
