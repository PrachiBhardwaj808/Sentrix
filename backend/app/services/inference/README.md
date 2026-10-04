# AI Module Integration

This package converts the reusable material in `IBVAP-modules` into services that can be called by Django workers. It does not run video files, open GUI windows, write output videos, or load model weights during Django startup.

## Integrated modules

| Source module | Backend destination | Integration |
| --- | --- | --- |
| `anpr-module` | `inference/anpr/` | Indian plate format validation and a lazy-loaded YOLO + EasyOCR frame service |
| `person-detection-module` | `inference/person/` | Lazy-loaded YOLO + DeepSORT frame service; removes hard-coded video/UI behaviour |
| `face-detection-module` | `inference/face/` | Lazy-loaded YOLO face detection with a bundled OpenCV frontal-face fallback |
| `insightface-master` | `inference/face/insightface_adapter.py` | Optional lazy InsightFace detector/embedding provider; disabled by default and backend-only |

The source `backend/` and `frontend/` folders contained only placeholder files already present in this repository, so they were not duplicated.

## Runtime model paths

Model weights are runtime assets and remain outside Git. Place approved weights in the ignored local runtime directory, for example:

```text
backend/.localdata/models/
├── yolov8n.pt
├── INPD_more_accuracy_n.pt
└── yolov8n-face-keypoints.pt  # optional; preferred when available
```

Configure their absolute paths through Django environment variables:

```text
PERSON_MODEL_PATH=
ANPR_VEHICLE_MODEL_PATH=
ANPR_PLATE_MODEL_PATH=
FACE_MODEL_PATH=
FACE_PROVIDER=opencv_yolo
INSIGHTFACE_MODEL_NAME=buffalo_l
INSIGHTFACE_ROOT=
```

Create one service instance per camera worker. A tracker keeps state across sequential frames, so it must not be shared by unrelated camera streams.

## Local browser inference endpoint

For local debugging, Django exposes `POST /api/inference/frame`. It accepts one JPEG frame and runs the enabled modules together:

- person detection plus DeepSORT tracking using `PERSON_MODEL_PATH`;
- face location detection using `FACE_MODEL_PATH` when present, otherwise OpenCV's bundled frontal-face cascade (identity matching is not enabled);
- optional InsightFace face detection/embedding extraction when `FACE_PROVIDER=insightface` is explicitly configured (embeddings never enter the response);
- Indian ANPR using `ANPR_VEHICLE_MODEL_PATH`, `ANPR_PLATE_MODEL_PATH`, and EasyOCR, retaining only validated Indian plate formats. If the plate weight is absent, the general vehicle boxes are scanned with OCR as a lower-accuracy fallback.

The response includes normalized boxes, confidence scores, track IDs, recognized plate attributes, per-module status, model names, device, and inference time. The endpoint does not create alerts or persist frames; the alert pipeline should consume only detections that pass its camera-zone, confidence, and persistence rules.

## Privacy and retention

- Do not commit model weights, videos, result files, or known-face sample images.
- Treat plate text, face detections, and any later embeddings as sensitive data.
- Keep face recognition/watchlist matching separate from face detection and protect it with explicit authorization, retention, and audit controls.
- Send only alert-worthy, normalized events to Django; do not write per-frame detections to Firestore.

## Attribution

The ANPR implementation is adapted from the supplied Apache-2.0 licensed module. See `backend/THIRD_PARTY_NOTICES.md` and `backend/third_party_licenses/ANPR-APACHE-2.0.txt`.

The supplied person-tracking script and face-recognition notebook were used to determine integration boundaries. Their sample media, model weights, face images, and notebook code were not copied into this repository.
