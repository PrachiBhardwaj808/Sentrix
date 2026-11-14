# Sentrix Technical Documentation Index

Welcome to the **Sentrix** documentation directory. All technical specifications, architectural designs, deployment manuals, and audit reports are categorized below.

---

## Documentation Categories

### 1. Architecture
System architecture diagrams, data flow models, and component boundaries.
- [`docs/architecture/system-architecture.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/architecture/system-architecture.md) — Comprehensive architecture specification, service topology, PostGIS data flows, and security boundaries.

### 2. Implementation
Technical implementation details, backend worker integration, and frontend engineering specifications.
- [`docs/implementation/implementation.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/implementation/implementation.md) — Core backend implementation plan, computer vision worker integration, and data persistence contracts.
- [`docs/implementation/frontend-implementation.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/implementation/frontend-implementation.md) — Full web platform implementation plan, command console UI specifications, and guard duty module design.

### 3. Blockchain & Cryptography
Decentralized evidence integrity verification and smart contract infrastructure.
- [`docs/blockchain/blockchain-implementation.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/blockchain/blockchain-implementation.md) — Architecture of tamper-evident chain-of-custody, SHA-256 evidence hashing, and dual-dispatch to IPFS/EVM.
- [`docs/blockchain/blockchain-setup.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/blockchain/blockchain-setup.md) — Setup guide for local Ganache / Hardhat EVM testnets and `EvidenceRegistry.sol` contract deployment.

### 4. Deployment & Infrastructure
Containerization, hardware sizing, network requirements, and cloud deployment guides.
- [`docs/deployment/DOCKER.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/deployment/DOCKER.md) — Docker Compose instructions for local development and multi-container orchestration.
- [`docs/deployment/hardware-and-deployment.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/deployment/hardware-and-deployment.md) — Production hardware sizing, edge AI accelerator specs, and high-availability server topologies.

### 5. Guides & Developer Onboarding
Step-by-step developer manuals and quickstart guides.
- [`docs/guides/HOW_TO_RUN.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/guides/HOW_TO_RUN.md) — Developer quickstart guide for launching the backend, frontend, and media relay locally.
- [`docs/guides/structured.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/guides/structured.md) — Comprehensive technical reference and developer onboarding walkthrough.

### 6. Feature Documentation
Detailed functional workflows and operator manuals.
- `docs/feature-documentation/Sentrix_Features_and_Workflow.docx` — Complete operational workflow specifications, incident triage guidelines, and field operator procedures.

### 7. Audits & Reports
Production readiness audits, feature completion metrics, and security reviews.
- [`docs/reports/PRODUCTION_READINESS.md`](file:///c:/Users/prach/OneDrive/Desktop/Projects/Sentrix/Sentrix/docs/reports/PRODUCTION_READINESS.md) — Production readiness checklist, security verification status, and deployment gates.
- `docs/reports/Sentrix_Feature_Status_Audit.docx` — Systematic feature status audit and operational verification report.
