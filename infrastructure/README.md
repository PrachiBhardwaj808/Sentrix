# Sentrix Infrastructure & Deployment Configuration

This directory centralizes all infrastructure, containerization, edge proxy, and cloud service configuration for the Sentrix platform.

---

## Directory Organization

```
infrastructure/
├── deployment/          # Production deployment configs and reverse proxy orchestration
│   ├── .env.example     # Production environment variable template (PostGIS, domains, SSL)
│   ├── Caddyfile        # Edge Caddy reverse proxy config (TLS termination, API routing)
│   └── README.md        # Detailed production deployment and single-node setup guide
├── docker/              # Container service configurations
│   └── mediamtx.yml     # Standalone MediaMTX RTSP/HLS/WebRTC streaming relay config
└── firebase/            # Firebase / Firestore security and indexing rules
    ├── firestore.rules          # Firestore granular security & role-based access rules
    └── firestore.indexes.json   # Composite index definitions for incident & alert queries
```

---

## Integration with Root Configurations

The files in this directory are directly referenced by root-level configuration files:

| Root Configuration | Reference Path | Purpose |
| --- | --- | --- |
| `docker-compose.yml` | `infrastructure/docker/mediamtx.yml` | Mounts MediaMTX config into `sentrix-media-relay` container |
| `docker-compose.production.yml` | `infrastructure/deployment/Caddyfile` | Mounts Caddy edge proxy configuration into `edge` container |
| `docker-compose.production.yml` | `infrastructure/docker/mediamtx.yml` | Media relay stream configuration |
| `firebase.json` | `infrastructure/firebase/firestore.rules` | Security rules deployed via Firebase CLI (`firebase deploy`) |
| `firebase.json` | `infrastructure/firebase/firestore.indexes.json` | Database indexes deployed via Firebase CLI |

---

## Deployment Quickstart

For local development with Docker Compose:
```bash
docker compose up --build
```

For production single-node deployment with Caddy edge TLS, PostGIS, and Redis:
```bash
# 1. Prepare production environment variables
cp infrastructure/deployment/.env.example infrastructure/deployment/.env
# Edit infrastructure/deployment/.env with production domain and credentials

# 2. Launch production stack
docker compose -f docker-compose.production.yml up -d
```

For full production deployment instructions, refer to [`infrastructure/deployment/README.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/infrastructure/deployment/README.md).
