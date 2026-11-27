# Sentrix Technical Documentation Index

Central catalog for **Sentrix — Hit-and-Run Vehicle Tracing & Cross-Camera Investigation Platform**.

---

## Primary Documentation

| Document | Purpose |
|---|---|
| [README.md](../README.md) | Project overview, problem statement, features, tech stack, implementation status, and quick links |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Consolidated system architecture, AI inference pipeline, cross-camera tracing design, GIS integration, database design, and API/security boundaries |
| [HOW_TO_RUN.md](HOW_TO_RUN.md) | Prerequisites, environment configuration, AI model setup, local & Docker execution, testing, and troubleshooting |

---

## Supporting & Reference Documentation

### Audits & Operations
- [reports/PRODUCTION_READINESS.md](reports/PRODUCTION_READINESS.md) — Conservative production-readiness audit, security boundaries, and deployment checklist.
- [deployment/hardware-and-deployment.md](deployment/hardware-and-deployment.md) — Hardware sizing profiles, prototype CPU throughput benchmarks, and hybrid deployment topology.
- [infrastructure/deployment/README.md](../infrastructure/deployment/README.md) — Single-host production Docker Compose, Caddy TLS, and firewall guide.

### Module & Service Guides
- [backend/README.md](../backend/README.md) — Django backend layout, capabilities, and test commands.
- [frontend/README.md](../frontend/README.md) — Next.js 16 command console structure and local setup.
- [infrastructure/README.md](../infrastructure/README.md) — Infrastructure and Firebase configuration index.
- [scripts/README.md](../scripts/README.md) — Local multi-service launcher scripts (`start_all.bat` / `start_all.sh`).
- [backend/app/services/inference/README.md](../backend/app/services/inference/README.md) — AI module integration boundaries and model weight paths.
- [backend/app/services/cameras/README.md](../backend/app/services/cameras/README.md) — MediaMTX RTSP/HLS/WebRTC relay and private-IP validation.

### Secondary / Historical Notes
- [implementation/implementation.md](implementation/implementation.md) — Historical AI/Pinata integration notes (secondary to `ARCHITECTURE.md`).
- [implementation/frontend-implementation.md](implementation/frontend-implementation.md) — Historical frontend planning notes.
- [blockchain/blockchain-implementation.md](blockchain/blockchain-implementation.md) & [blockchain/blockchain-setup.md](blockchain/blockchain-setup.md) — Optional/frozen Web3 `EvidenceRegistry.sol` & Pinata notes (not part of the core baseline).
- `feature-documentation/Sentrix_Features_and_Workflow.docx` & `reports/Sentrix_Feature_Status_Audit.docx` — Legacy binary `.docx` artifacts.
