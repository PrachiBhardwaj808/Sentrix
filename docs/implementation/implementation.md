# Implementation Plan

This document tracks the practical implementation of the Border Surveillance platform and the integration of reusable modules from `C:\Users\Lenovo\Downloads\IBVAP-modules\IBVAP-modules`.

## Integration objective

The existing repository provides the Django backend and Next.js frontend structure. The external module bundle may contain frontend assets, AI models, and backend components. This integration will add only backend-relevant code and configuration that fits the project architecture, while keeping the existing documentation and scaffolding intact.

## Runtime data and local camera behavior

The application no longer ships with seeded alerts, guards, cameras, sectors, identities, or evidence images. Django starts with an empty state and the frontend displays only records returned by the API. The previous ignored API state file was removed so stale seeded records do not return after a restart.

For local testing, the Live Cameras page includes `frontend/components/video/LocalCameraFeed.tsx`. After the operator clicks **Enable Local Camera**, the browser requests an available webcam through `getUserMedia`, renders it locally, and sends compressed sample frames to Django's `/api/inference/frame` endpoint. Django runs the configured YOLO model and returns detection boxes, confidence, model name, and inference latency; the browser draws the returned boxes. Real CCTV/NVR streams still require a registered camera record and a WebRTC/HLS relay because browsers cannot play RTSP directly.

## Target backend architecture

```text
Existing CCTV/NVR or approved local surveillance server
        -> video ingestion and AI inference
        -> durable local outbox during network loss
        -> Django API and alert/rule services
        -> Firebase, Pinata, and blockchain audit records
        -> command-and-control dashboard
```

## Integration rules

- Preserve existing files and do not overwrite project work without review.
- Keep frontend-specific code out of `backend/`.
- Treat model weights, generated media, credentials, and local runtime data as non-versioned assets.
- Place reusable Python services, scripts, and configuration under the Django backend structure.
- Record the source-to-destination mapping and any required adaptation after the source inventory is complete.

## Source inventory and integration mapping

| Source item | Decision | Destination or handling |
| --- | --- | --- |
| `backend/` and `frontend/` | Not copied | They contain the same placeholder scaffold already present in this repository. |
| `anpr-module` Python implementation | Integrated | `backend/app/services/inference/anpr/` as a lazy-loaded Django-worker service. |
| `person-detection-module` script | Reworked | `backend/app/services/inference/person/` removes hard-coded input video and GUI behaviour. |
| `face-detection-module` notebook | Reworked | `backend/app/services/inference/face/` provides detection only; recognition remains a separately authorized capability. |
| Model weights, sample videos, output media, and sample face images | Not copied | Runtime assets stay in ignored local storage and must be supplied through approved deployment channels. |

## Integrated backend modules

```text
backend/app/services/inference/
├── anpr/                 # Indian plate detection and OCR
├── person/               # Person detection and DeepSORT tracking
├── face/                 # Face detection boundary
├── contracts.py          # Shared normalized detection objects
└── README.md             # Runtime paths, privacy, and attribution
```

The module dependencies are listed in `backend/requirements-ai.txt`. AI workers must load weights from an ignored local runtime path such as `backend/.localdata/models/`; no model weights or demo media are tracked by Git.

## Pinata/IPFS integration

Pinata will hold encrypted CCTV snapshots or short incident clips off-chain. The Pinata file is private; the blockchain stores only a cryptographic evidence hash and audit metadata, while Firestore stores the operational record and the CID needed by the Django API.

### Values to provide later

Leave these placeholders empty until the Pinata workspace, private gateway, and deployment secrets are available:

```dotenv
# Django server only; never expose through NEXT_PUBLIC_* variables.
PINATA_JWT=<ADD_LATER>
PINATA_GATEWAY_URL=<ADD_LATER_RESTRICTED_GATEWAY>
PINATA_GROUP_ID=<OPTIONAL_ADD_LATER>
PINATA_NETWORK=private
PINATA_ALLOW_PUBLIC_DEMO=false
PINATA_UPLOAD_URL=https://uploads.pinata.cloud/v3/files
PINATA_API_URL=https://api.pinata.cloud

# Application policy, not a secret.
PINATA_UPLOAD_TIMEOUT_SECONDS=30
PINATA_MAX_UPLOAD_BYTES=<SET_APPROVED_LIMIT>
```

The values belong in the Django server environment or an approved secret manager. During local development, use an ignored backend `.env` file or operating-system environment variables. Do not commit the values to GitHub, put them in frontend environment variables, or send the Pinata JWT to the browser.

Pinata currently documents Private IPFS as plan-dependent. Confirm that the selected Pinata workspace supports private uploads before enabling real evidence. If the available plan supports only public IPFS, use it only with synthetic or redacted demonstration media; do not upload operational border evidence.

### Blockchain values to provide later

The append-only contract source is included at `backend/blockchain/contracts/EvidenceRegistry.sol`. After it is deployed by the approved deployment process, provide these values to the Django worker environment:

```dotenv
BLOCKCHAIN_RPC_URL=<ADD_LATER_APPROVED_RPC_ENDPOINT>
BLOCKCHAIN_CHAIN_ID=<ADD_LATER_NETWORK_CHAIN_ID>
BLOCKCHAIN_CONTRACT_ADDRESS=<ADD_LATER_DEPLOYED_CONTRACT_ADDRESS>
BLOCKCHAIN_SIGNER_PRIVATE_KEY=<ADD_LATER_SERVER_SECRET>
BLOCKCHAIN_CONFIRMATIONS=1
BLOCKCHAIN_TX_TIMEOUT_SECONDS=120
BLOCKCHAIN_GAS_LIMIT=<OPTIONAL_ADD_LATER>
```

The signer key must remain in a Django secret manager or server environment. It must never be placed in GitHub, Firebase client configuration, Vercel frontend variables, or a browser bundle.

### Private evidence upload flow

1. The local border server captures the incident snapshot or approved short clip.
2. The evidence service calculates a SHA-256 hash from the exact bytes before upload.
3. The event and file are written to the durable local outbox so an outage cannot lose the record.
4. A Django worker uploads the file to Pinata using the server-only JWT and private storage settings.
5. The worker records the returned CID, Pinata file identifier if available, byte size, MIME type, SHA-256 hash, and `uploaded_at` in Firestore.
6. Django submits the SHA-256 evidence hash—not the raw file—to the append-only blockchain contract.
7. After the blockchain transaction is confirmed, Firestore stores the transaction ID and the event changes to `confirmed`.

The upload must be idempotent. Persist the `event_id`, upload state, CID, and transaction ID before retrying. If a request times out after Pinata may have accepted the file, reconcile the existing upload before creating another copy.

### Private retrieval flow

The Next.js dashboard requests evidence through Django after Firebase authentication and role checks. Django validates access, verifies the stored hash when appropriate, and streams the file through the restricted Pinata gateway or issues a short-lived authorized link. The frontend receives evidence access only; it never receives `PINATA_JWT` or the blockchain signer key.

Do not use a public Pinata gateway for real border evidence. Do not put snapshots, clips, face images, face embeddings, number plates, full identities, or sensitive coordinates on a public blockchain. For demonstrations, use synthetic or manually redacted media in a separate test Pinata workspace.

### Backend components implemented for Pinata

The following Django-side service boundaries are now implemented; they remain disabled until the Pinata and blockchain values are supplied:

```text
backend/app/services/evidence/
├── hashing.py          # SHA-256 for evidence and approved model artifacts
├── pinata_client.py    # Private upload, CID persistence, and authorized retrieval
├── custody.py          # CREATED/VIEWED/DOWNLOADED/ASSIGNED/RESOLVED events
├── provenance.py       # High-severity model version and artifact records
└── firestore_sink.py   # Operational alert-state adapter
```

The Pinata client uses the current private Files API upload operation and creates temporary private download links. Its HTTP transport is injectable, so upload/retry behavior can be tested without sending files to Pinata.

The synchronization worker also includes a `FirestoreEventSink`; initialize it with the approved Firebase Admin Firestore client so the dashboard receives the latest operational state without exposing local evidence paths.

The ZIP integration's Firebase environment keys are supported without copying its credential values. Use either `GOOGLE_APPLICATION_CREDENTIALS` or all of `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_CLIENT_ID`. Firebase initialization is lazy and optional for local development; the Django API exposes a safe `/api/firebase/status` health check.

Incident references and custody-event references are deterministic. The contract treats repeated registration or custody submissions with the same reference as safe no-ops, allowing a worker to retry after a timeout without creating conflicting evidence records.

The SQLite outbox repository now persists `evidence_sha256`, `pinata_cid`, `pinata_file_id`, `uploaded_at`, `blockchain_tx_id`, `anchored_at`, custody transaction IDs, model provenance, retry state, and a short worker lease. The worker sequence is:

```text
pending_local
    -> pinata_pending
    -> evidence_uploaded
    -> blockchain_pending
    -> confirmed
```

Any failure keeps the event and local evidence for retry. Local evidence is deleted only after the approved cloud-retention and blockchain-confirmation policy has succeeded.

### Pinata handoff checklist

- [ ] Create or select the approved Pinata workspace.
- [ ] Configure private file storage and a restricted gateway.
- [ ] Create a least-privilege server JWT and store it outside Git.
- [ ] Fill the placeholders above in the Django deployment environment.
- [x] Implement the private client and outbox reconciliation worker.
- [x] Test upload, retry state handling, private retrieval-link generation, and hash verification without network access.
- [x] Add the Firestore operational-event sink adapter.
- [x] Add the append-only `EvidenceRegistry` contract and Django Web3 client.
- [ ] Deploy the contract through the approved blockchain deployment process.
- [ ] Test a real upload, retry after timeout, private retrieval, and deletion/retention policy with synthetic media after credentials are supplied.
- [ ] Confirm that the Vercel frontend can access evidence only through authorized Django requests.
- [ ] Enable real evidence only after the security and retention review is approved.

## Status

Backend module integration and the local evidence/blockchain service implementation are complete. Pinata credentials, gateway details, blockchain RPC settings, contract address, and signer key are intentionally left as placeholders. The next steps are to supply approved values, deploy the append-only contract, initialize the Firestore sink with the project’s Firebase Admin client, and validate the full flow with synthetic evidence.
