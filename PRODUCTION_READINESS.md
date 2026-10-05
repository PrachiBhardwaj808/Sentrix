# Sentrix production-readiness record

This document records what is implemented in the local codebase, what was
verified during this hardening pass, and what must still be completed before a
real deployment. It is deliberately conservative: a green local test is not a
claim that an AI model is accurate in every border environment.

## Executive status

| Area | Status | Current implementation | Still required before production |
|---|---|---|---|
| Authentication and authorization | Hardened locally / not production-complete | Signed 12-hour bearer sessions, role checks on sensitive API writes, source-IP audit events, WebAuthn/Face ID path, explicit local demo switches | Use one managed identity authority such as Firebase Auth or an enterprise IdP, rotate/revoke users operationally, and test account recovery/rate limits |
| Demo credentials and OTP fallback | Gated | Demo users are created only by `seed_demo`; demo OTP is disabled by default and accepted only from loopback when explicitly enabled | Configure Exotel or another approved SMS provider; keep both demo switches false |
| Firebase alert persistence and FCM | Retry-capable / projection model | Alert writes use deterministic IDs, server timestamps when Firebase Admin is available, append-only `alerts_events` records, local bounded Firestore/FCM outboxes, exponential retry, and dead-letter state | Deploy Firestore rules/indexes/backups, configure an approved FCM topic, and run a failure/recovery drill against the real project |
| Face/AI pipeline | Functional adapter / accuracy unverified | Person, face, ANPR, optional InsightFace adapters share normalized detections; metrics expose model latency | Benchmark on representative day/night/thermal footage, publish precision/recall/false-positive results, and review model licenses |
| CCTV relay | Demo-capable / operationally partial | RTSP registration and browser HLS/WebRTC relay path, connection tests, bounded frame path | Run a supervised MediaMTX/go2rtc service with heartbeat, reconnect/backoff, authentication, and camera outage alarms |
| Runtime monitoring | Implemented locally | `/api/monitoring/metrics`, dashboard model-health panel, bounded p50/p95 windows, inference FPS and dropped-frame fields | Export to Prometheus/OpenTelemetry and alert on camera/model thresholds |
| Integrity audit | Implemented locally | Local SHA-256 hash chain for alert/activity mutations plus authenticated verification endpoint `/api/audit-chain` | Put state on durable append-only storage, restrict access, and test restore/rotation procedures |
| Security configuration | Safer defaults | Secret required when debug is false, restrictive CORS/hosts defaults, optional HTTPS/HSTS/security-cookie settings, JPEG upload validation | Set all production values, use TLS, managed secrets, CSRF trusted origins, firewall rules, and external review |
| Workflow congestion | Partially mitigated | Only a small camera preview set is mounted on the dashboard; alert views are bounded; local metrics are bounded | Add list virtualization/pagination to every high-volume operator view and load-test the maximum camera count |

## End-to-end workflow

1. An operator authenticates with the backend. Password verification happens on
   the server, a configured second factor is delivered to the registered phone,
   and the signed session includes the operator tier and token version.
2. The frontend sends the bearer token with protected requests. The backend
   re-checks the signature, expiry, account status, and token version; browser
   route guards are only a usability layer.
3. A camera supplies browser-compatible HLS/WebRTC or a local JPEG frame path.
   Raw RTSP is not playable by a browser without a relay. The backend runs the
   enabled person, face, ANPR, and optional object adapters through normalized
   detection contracts.
4. Inference results include model status, bounding boxes, confidence, frame
   metrics, and recent p50/p95 latency. Rule evaluation and triage produce an
   explainable incident candidate; an operator remains responsible for review.
5. An alert is written to local state and, when configured, to the Firebase
   alert projection plus an immutable event document. If Firebase is down, the
   record stays local and enters the bounded retry outbox. Repeated writes use
   the alert ID and are idempotent.
6. Alert and activity mutations append a hash-chain record containing the
   previous hash, content hash, operation, and timestamp. An administrator or
   command operator can verify the chain through `/api/audit-chain`.
7. Dispatch requires command/admin authorization. The assigned guard receives
   the configured SMS/OTP only when the Exotel integration is configured;
   plaintext OTP values are not written to Firebase or logs.

## Local hash-chain design

The chain is an integrity signal, not a substitute for access control or a
tamper-proof database. Each entry stores metadata and hashes rather than raw
evidence. A verifier recomputes every content hash and link from the genesis
hash. A mismatch reports the first broken sequence. Existing legacy alerts and
activity records are imported once when the repository first sees an empty
chain, so the migration is visible as `legacy_import` entries.

The chain covers `alerts` and `activityLog`. Authentication audit entries,
camera configuration, and model artifacts still require the deployment's
central audit/logging policy.

## Firebase recovery behavior

The local outboxes keep one item per alert ID, store the last error and attempt
count, retry with bounded exponential backoff, and move an item to dead-letter
after eight failed attempts. A subsequent authenticated bootstrap or alerts
request flushes due items. FCM is disabled unless `FCM_ENABLED=true` and
`FCM_ALERT_TOPIC` are set. Operators must inspect the health response and
dead-letter counts; a local `alertsSynced=false` response means the alert is
preserved locally but has not yet been confirmed in Firebase.

## AI and accuracy evidence still needed

The repository currently reports runtime latency and model status, not a valid
accuracy score. Before claiming performance, create a consented, labelled test
set covering camera, distance, lighting, weather, clothing, plate angle, and
occlusion. Report per-module precision, recall, F1, false-positive rate,
false-negative rate, and a confidence-threshold trade-off. Face identity must
remain consent-gated, embedding-only, and operator-reviewed; a generic face
box is not an identity match.

InsightFace model packages and the `buffalo_l`/`antelope` family have licensing
and redistribution requirements. Keep model files out of the public frontend
and record the exact model name, version, artifact hash, provider, and license
in the deployment inventory.

## Deployment checklist

- Set a long random `DJANGO_SECRET_KEY`; never use the example value.
- Set `DJANGO_DEBUG=false`, explicit `DJANGO_ALLOWED_HOSTS`, restrictive
  `CORS_ALLOWED_ORIGINS`, and matching `DJANGO_CSRF_TRUSTED_ORIGINS`.
- Use the admin-only `POST /api/auth/revoke` operation when an operator leaves
  the team or a token must be invalidated; it increments that user's token
  version and can disable the account.
- Enable `DJANGO_SECURE_SSL_REDIRECT`, secure cookies, and HSTS only behind a
  correctly configured HTTPS proxy.
- Keep Firebase service-account material, Exotel credentials, relay credentials,
  model files, and blockchain signer keys on the backend secret store only.
- Keep `AUTH_ALLOW_DEMO_USERS=false` and `AUTH_ALLOW_DEMO_OTP=false`.
- Configure Firestore rules so clients cannot write alert projections/events
  directly; only the backend service account may write them. Add backups and
  retention/lifecycle policies for evidence storage.
- Put MediaMTX/go2rtc and camera networks behind firewall/authentication rules;
  never expose an RTSP password in a browser URL or screenshot.
- Run migration, seed only intentionally, `check --deploy`, the backend tests,
  frontend typecheck, and production build in CI.
- Perform a camera disconnect, Firebase outage, disk-full, expired-token,
  revoked-token, duplicate-alert, and model-unavailable drill before launch.

## Verification commands

From the repository root:

```text
cd backend
source venv/bin/activate
python -m unittest discover -s tests -q
python manage.py check
python manage.py check --deploy

cd ../frontend
npm run typecheck
npm run build
```

The exact output from the latest local run should be recorded with the release
commit. A successful build does not validate live camera reachability, Firebase
permissions, SMS delivery, or model accuracy.
