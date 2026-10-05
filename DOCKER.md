# Sentrix with Docker

This setup runs the complete local demo stack:

| Service | Container port | Host URL | Purpose |
|---|---:|---|---|
| Frontend | 3000 | http://localhost:3000 | Next.js command center |
| Django API | 8000 | http://localhost:8000 | Authentication, alerts, cameras, analytics |
| MediaMTX HLS | 8888 | http://localhost:8888 | Browser-compatible camera playback |
| MediaMTX WebRTC | 8889 | http://localhost:8889 | Low-latency browser playback |
| MediaMTX RTSP | 8554 | rtsp://localhost:8554 | Camera stream ingest |

The backend image includes the AI dependencies and uses CPU mode by default in
Docker. Existing model files in `backend/.localdata/models` are mounted into
the container. Additional model files should be placed there locally; secrets
and Firebase keys are never copied into the image.

## Install Docker on macOS

1. Download Docker Desktop from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Install the Apple Silicon build for an M-series Mac, or the Intel build for
   an Intel Mac.
3. Open Docker Desktop and wait until it says **Docker Desktop is running**.
4. Open Terminal and verify:

   ```bash
   docker --version
   docker compose version
   ```

## First-time setup

From the project root:

```bash
cd "/Users/akshit/Desktop/SIH /border-surveillance-main"

# Create the backend environment file if it does not exist.
[ -f backend/.env ] || cp backend/.env.example backend/.env
```

Keep real Firebase, Exotel, blockchain, and signing secrets only in
`backend/.env`. Do not put them in `Dockerfile`, `docker-compose.yml`, or a
`NEXT_PUBLIC_*` variable.

## Build and start

The first build downloads Python AI packages and may take several minutes:

```bash
docker compose build
docker compose up
```

Open:

- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/api/health

To run in the background:

```bash
docker compose up -d
docker compose ps
docker compose logs -f backend
```

## Stop, restart, and rebuild

```bash
# Stop containers while preserving local state.
docker compose down

# Restart existing images.
docker compose up -d

# Rebuild after changing Python or Node dependencies.
docker compose build --no-cache
docker compose up -d
```

Do not use `docker compose down -v` unless you intentionally want to remove
Docker-managed volumes. The bind-mounted `backend/.localdata` directory holds
the local SQLite database, alert state, and model files.

## Camera stream notes

Docker does not make a private camera reachable from the internet. For a
camera on another network, use Tailscale/VPN or a camera relay. Do not expose
RTSP directly to the public internet. Once a stream reaches MediaMTX, the
browser should use its HLS/WebRTC URL rather than a raw `rtsp://` URL.

## Troubleshooting

If a port is already in use, stop the old local processes or change the host
side of the mapping, for example `3001:3000` for the frontend. The container
port on the right side must remain unchanged.

If the backend shows offline, check:

```bash
docker compose ps
docker compose logs --tail=200 backend
curl http://localhost:8000/api/health
```

If AI inference reports missing weights, place the required model file in
`backend/.localdata/models` and restart the backend container.
