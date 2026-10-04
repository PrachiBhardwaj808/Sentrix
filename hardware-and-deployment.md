# Hardware and Deployment Plan

This document defines the recommended hardware and deployment model for the Indian border-surveillance system. The design is **offline-first and hybrid**: AI inference continues at the border outpost when the network is unavailable, while the cloud is used for coordination, dashboards, backups, and blockchain synchronization whenever connectivity is available.

## Recommended architecture

```text
CCTV / NVR
    |
    v
Local surveillance server
  - Django API and worker
  - Person, face and ANPR models
  - Local event database
  - Encrypted evidence cache
  - Offline outbox and retry queue
    |
    +-- Network available --> Cloud API / dashboard / Firebase / Pinata / blockchain
    |
    +-- Network unavailable -> Continue detection and queue signed event records locally
```

The local server can be an approved computer already available at the border post or an on-premise rack/server-room machine connected to the CCTV/NVR network. A Jetson gateway is **not required**. A GPU is optional for a small demonstration, but becomes useful when several camera streams must be processed at the same time.

## Hardware profiles

| Use case | CPU | RAM | Storage | GPU | Expected role |
|---|---:|---:|---:|---:|---|
| Development or one-camera demo | 6-core modern CPU | 16 GB | 512 GB SSD | Optional | Run a sample stream or one local camera at reduced FPS |
| Recommended one-camera deployment | 8-core CPU | 32 GB | 512 GB–1 TB NVMe | NVIDIA GPU with 8–12 GB VRAM | Continuous person/face detection and event-triggered ANPR |
| Multiple-camera outpost | 12–16 CPU cores | 32–64 GB | 1–2 TB NVMe plus retention storage | 12–16 GB VRAM | Process several streams with room for the Django worker and queue |
| Central command deployment | 16+ CPU cores | 64 GB+ | Redundant storage | 16 GB+ VRAM or multiple GPUs | Aggregate alerts and evidence from multiple outposts |

These are planning profiles rather than strict procurement requirements. The actual capacity depends on camera resolution, frame rate, model size, number of simultaneous streams, and the evidence-retention period.

## Prototype performance reference

The current prototype was tested locally with CPU-only inference using the person, face, and ANPR services:

- Person and face pipeline: approximately **3 FPS** on one camera.
- Combined person, face, and ANPR pipeline: approximately **0.3 FPS** on one camera during the test.
- The ANPR path is intentionally event-driven and includes OCR, which is much more expensive than person tracking.

These measurements show why the production pipeline should not run every model on every frame. They are useful baseline measurements, not a guarantee for different hardware or camera feeds.

## Efficient inference schedule

1. Read the CCTV/NVR stream locally.
2. Run person detection/tracking at the configured stream rate.
3. Run face detection only on relevant person crops and every few frames.
4. Run vehicle and license-plate detection only after a vehicle is detected.
5. Run OCR only on a stable, high-quality plate crop.
6. Create an incident only after the configured confidence and persistence rules are met.
7. Upload evidence and submit blockchain transactions asynchronously; never block the camera loop on the network.

This reduces CPU/GPU usage, avoids unnecessary OCR calls, and keeps alert generation working during connectivity loss.

## Local, cloud, and hybrid comparison

### Local-only

AI inference, the event database, evidence cache, and the operator interface run at the outpost.

Advantages:

- Continues working without internet access.
- Lowest camera-to-alert latency.
- Sensitive video can remain inside the border network.

Limitations:

- Requires hardware maintenance at each outpost.
- A local failure can affect that outpost unless storage and power are redundant.
- A public blockchain transaction still needs connectivity; it must be queued while offline.

### Cloud-only

Camera data is sent to a cloud service where the AI models run.

Advantages:

- Centralized operations and easier software updates.
- Compute can be scaled for a demonstration or command center.

Limitations:

- It cannot reliably process a remote camera during a network outage.
- Continuous video upload is costly and bandwidth-heavy.
- Free cloud tiers are not suitable for dependable, multi-camera production inference.

### Hybrid (recommended)

Run the latency-sensitive AI pipeline and offline queue locally. Send only alerts, hashes, selected snapshots, and required metadata to the cloud when the link is available.

This gives the project local resilience without giving up a central command dashboard, remote review, cloud backup, or blockchain anchoring.

## Data placement

At the outpost, store the following on encrypted local storage:

- A local SQLite or PostgreSQL event database.
- Encrypted snapshots and short evidence clips, subject to a retention policy.
- The offline outbox containing pending evidence metadata and blockchain jobs.
- AI model files and their recorded version/hash.
- Audit logs for local operator actions.

In the cloud, store only what the deployment policy permits:

- Firebase or another authenticated database for synchronized incident metadata.
- Private Pinata/IPFS objects for evidence that must be remotely reviewable.
- Blockchain transaction references and cryptographic hashes, not raw CCTV video.
- The dashboard and aggregated operational status.

Private evidence storage is the default. Public IPFS gateways and public blockchain data must not expose classified images, personal data, exact patrol patterns, or operationally sensitive coordinates.

## Offline behavior and time audit

When the satellite, cellular, or wired link fails:

1. The camera and local AI worker continue detecting events.
2. The local system records the event timestamp using synchronized system time and stores a monotonic sequence number.
3. The evidence is hashed immediately and placed in the encrypted outbox.
4. The operator can review the incident locally, but the pending status is visible until synchronization succeeds.
5. When connectivity returns, a worker uploads the evidence, writes the corresponding blockchain record, and stores the transaction hash locally and in the cloud.
6. Retries are idempotent, so a timeout or duplicate delivery cannot create a second record for the same evidence.

The blockchain timestamp represents the time at which the network accepted the transaction. The original capture time, local sequence number, device identifier, and synchronization delay must also be retained so an auditor can distinguish **capture time** from **chain-confirmation time**.

## Power and reliability considerations

For a real outpost installation, the local server and network equipment should be connected to a UPS, use automatic restart after power recovery, and write the outbox to durable storage. Where the risk justifies it, use mirrored disks and a secondary local copy of critical evidence. These measures protect availability; the blockchain protects the integrity and history of synchronized records.

## Deployment recommendation for the hackathon

Use the following staged setup:

- **Local demo:** one laptop or desktop, one camera or sample video, CPU inference, and local SQLite/outbox.
- **Cloud demo:** a small persistent Django service for the API and workers, a Vercel-hosted dashboard, Firebase for authenticated metadata, and private Pinata storage for selected evidence.
- **Blockchain demo:** a testnet contract and one backend signer wallet. Keep the private key in the deployment provider's secret manager; do not put it in Git or the browser.
- **Production-shaped behavior:** demonstrate a deliberate network interruption, show that local detection continues, then restore connectivity and show the queued incident being synchronized and anchored on-chain.

The cloud service should receive event records and selected evidence rather than an always-on raw video stream. For a future multi-camera deployment, add a dedicated GPU server or approved edge inference appliance after measuring the target camera count and FPS requirement.

## Bottom line

For this project, **hybrid is the most efficient and credible design**: local inference protects response time and offline operation, while the cloud provides centralized visibility and blockchain synchronization. Start with 16 GB RAM for the hackathon demo; use 32 GB RAM and an 8–12 GB VRAM GPU for a reliable one-camera continuous deployment.
