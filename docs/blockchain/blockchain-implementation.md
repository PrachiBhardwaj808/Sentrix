# Blockchain and Local Storage Implementation

This document explains where surveillance data is stored and how the blockchain layer works with Django, Firebase, Pinata, and the existing border surveillance infrastructure.

## 1. Where data is stored locally

Local storage belongs on the existing local border-post server, CCTV/NVR server, or approved control-room computer at each surveillance location. The IP camera should stream data to that approved local system; the camera itself should not be treated as the durable database.

The existing NVR can continue recording camera footage, while the surveillance application runs on an approved local or central server. If a camera/NVR has no built-in analytics and there is no local server running the AI service, a network outage will stop new AI detections; only recording can continue. Local AI alerting during an outage therefore requires either camera-native analytics or an approved local server.

Recommended production location on the local Linux-based border-post server:

```text
/var/lib/border-surveillance/
├── database/
│   └── events.sqlite3          # Durable event metadata and offline outbox
├── media/
│   ├── snapshots/              # Encrypted incident snapshots
│   └── clips/                  # Encrypted short clips, if enabled
├── queue/
│   └── failed-events/          # Events waiting for retry or manual review
├── models/
│   └── approved/               # Read-only AI model files
└── logs/
    └── local-service.log       # Rotating local service logs
```

Use an encrypted SSD or approved encrypted local storage volume for `media/`, rather than an unprotected system disk. For a single local server, SQLite is sufficient for event metadata and the durable outbox. Use local PostgreSQL when multiple cameras and workers require higher concurrent write capacity.

Redis Streams can be used for fast frame/event processing, but it must not be the only copy of an unsynchronized alert. The SQLite/PostgreSQL outbox is the recovery source after a restart or power failure.

### Local storage responsibilities

| Data | Local location | Retention |
| --- | --- | --- |
| Detection metadata | SQLite/PostgreSQL | Until synchronized and retained by policy |
| Pending alert queue | Durable outbox table | Until Firebase and blockchain confirmation |
| Snapshots | Encrypted local SSD | Until cloud upload and retention confirmation |
| Short clips | Encrypted local SSD | High-severity incidents only |
| AI models | Read-only model directory | Until replaced by an approved version |
| Processing logs | Rotating log files | Short operational retention |

Local paths are for runtime data and must never be committed to Git. Development can use an ignored directory such as `backend/.localdata/`.

## 2. Complete data flow

```text
IP camera (RTSP/ONVIF)
        |
        v
Local border-post server / CCTV-NVR server
  - runs AI inference
  - hashes and signs evidence
  - saves event to durable outbox
        |
        +-- network unavailable --> local queue and local alerting
        |
        +-- network restored -----> Django synchronization API
                                      |
                 +--------------------+--------------------+
                 v                                         v
       Firebase Firestore/Storage              Pinata private IPFS
       operational alert + media               snapshot/clip + CID
                 |                                         |
                 +--------------------+--------------------+
                                      v
                            Blockchain smart contract
                            evidence proof + audit events
                                      |
                                      v
                            Next.js command dashboard
```

## 3. What the blockchain stores

The blockchain is not stored on the local border-post server, Firebase, or Vercel. It is a distributed ledger maintained by the selected blockchain network. The local server stores only pending events, synchronization state, and confirmed transaction IDs.

The smart contract should store minimum, non-sensitive information:

```text
incident_reference_hash
evidence_hash
action                         # created, viewed, downloaded, assigned, resolved
actor_role
event_timestamp
model_version_hash             # high-severity alerts only
model_artifact_hash            # high-severity alerts only
transaction_reference
```

Do not store video, images, face embeddings, number plates, full user identities, or precise sensitive locations on a public blockchain. Firebase and Pinata hold the protected off-chain data. Firestore stores the Pinata CID and links it to the blockchain transaction.

## 4. Blockchain implementation

Implement the non-upgradeable `EvidenceRegistry` contract in `backend/blockchain/contracts/EvidenceRegistry.sol` on an approved EVM-compatible network. It is append-only: it can register an incident and append audit events, but it provides no delete or edit functions.

The contract needs two main operations:

```text
registerIncident(
    incident_reference_hash,
    evidence_hash,
    captured_at
)

registerHighSeverityIncident(
    incident_reference_hash,
    evidence_hash,
    model_version_hash,
    model_artifact_hash,
    confidence,
    decision_threshold,
    captured_at
)

appendCustodyEvent(
    custody_event_id,
    incident_reference_hash,
    evidence_hash,
    action,
    actor_role,
    occurred_at
)
```

Incident and custody references are deterministic. Repeating a call with the same reference is a safe no-op after a timeout, while a changed evidence hash for an existing incident is rejected.

Only the authorized Django blockchain service account can submit transactions. Django authenticates the user with Firebase, checks the user’s role, and then signs the transaction on the server. The Vercel frontend never receives a blockchain private key.

## 5. Runtime sequence

### A. Threat detection

1. The AI model detects a person, vehicle, or virtual-fence violation.
2. The local surveillance server captures the snapshot and calculates its SHA-256 hash.
3. The local server records the model version and model artifact hash.
4. The local server stores the complete event in the local durable outbox.
5. The local server records `captured_at` and `queued_at` timestamps and continues monitoring if the network is unavailable.

### B. Synchronization after an outage

1. The sync worker detects that connectivity has returned.
2. It sends queued events to a Django batch endpoint.
3. Django uses `event_id` as an idempotency key so retries cannot create duplicate alerts.
4. Django stores the alert in Firestore and uploads the evidence to Firebase Storage or Pinata.
5. Pinata returns a CID for an uploaded IPFS file; the CID is saved in Firestore.
6. Django submits the evidence hash and relevant incident metadata to the smart contract.
7. Django waits for the transaction receipt and saves the transaction ID and block number in Firestore.
8. The edge event changes from `pending` to `confirmed` only after the required cloud and blockchain confirmations succeed.

### C. Evidence chain of custody

When an authorized user creates, views, downloads, assigns, or resolves evidence:

1. Django validates the user’s Firebase role and access to the incident.
2. Django records the action in Firestore for fast dashboard queries.
3. Django appends the action, evidence hash, actor role, and timestamp to the smart contract.
4. Firestore stores the resulting transaction ID in the incident’s audit trail.

### D. AI model provenance

For high-severity alerts, the model identifier, version, and artifact hash are included in the initial blockchain record. During an investigation, reviewers can compare the recorded artifact hash with the approved model file to verify which model build produced the alert.

## 6. Timestamps and auditability

An outage means the blockchain transaction may occur later than the detection. Store separate timestamps instead of treating the blockchain timestamp as the detection time:

```text
captured_at       = camera/edge detection time
queued_at         = event persisted locally
received_at       = Django received the event
uploaded_at       = evidence stored in Firebase or Pinata
anchored_at       = blockchain transaction confirmed
verified_at       = evidence hash checked by a commander
```

Also store a per-camera `sequence_number` and a local-server or camera-service signature. Sequence numbers help reconstruct order when events arrive late or out of order; signatures help show that the event originated from an approved surveillance system.

## 7. Failure handling

```text
pending_local
    -> submitted_to_django
    -> evidence_uploaded
    -> blockchain_pending
    -> confirmed
```

If any step fails, retain the event locally and retry with exponential backoff. Move events that exceed the retry limit to `failed-events/` and show them for operator review. Do not delete local evidence until the required confirmations are complete.

For critical deployments, replicate signed pending events to another approved local server or command post. This protects against loss of the primary surveillance server or its local storage before synchronization.

## 8. Security requirements

- Store the Pinata JWT, Firebase service credentials, and blockchain signer key only in the Django server environment or a secret manager.
- Use Pinata private storage and a restricted gateway for CCTV evidence.
- Encrypt the local SSD and restrict the edge service account’s filesystem permissions.
- Use a dedicated blockchain signer with only the contract permissions it needs.
- Use a non-upgradeable contract, or protect contract administration with multi-party approval and a timelock.
- Keep complete user identities off-chain; record only a role or privacy-preserving actor reference.
- Treat blockchain as proof of what was submitted, not proof that the AI decision itself was correct.

## 9. Suggested code structure

```text
backend/app/services/
├── evidence/
│   ├── hashing.py                # SHA-256 evidence and model hashes
│   ├── pinata_client.py          # Private IPFS uploads and CID handling
│   ├── custody.py                # Evidence action records
│   └── provenance.py             # High-severity model records
├── blockchain/
│   ├── contract_client.py        # web3.py contract calls
│   ├── transaction_worker.py     # Retry and receipt handling
│   └── verification.py           # Hash and transaction verification
└── offline_queue/
    ├── models.py                 # Outbox state and event metadata
    ├── repository.py             # SQLite/PostgreSQL persistence
    └── sync_worker.py            # Reconnect and batch synchronization
```

## 10. MVP scope

For the prototype, implement one complete vertical slice:

```text
One camera -> one local border server -> one snapshot -> Pinata CID
-> Django alert -> smart-contract evidence hash
-> Firebase transaction link -> dashboard verification
```

Add chain-of-custody events and model provenance after the initial alert flow is confirmed. This keeps the blockchain integration demonstrable without attempting to place continuous CCTV video or every frame on-chain.
