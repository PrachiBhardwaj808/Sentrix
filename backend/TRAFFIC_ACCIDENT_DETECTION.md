# Traffic accident detection

Sentrix can run an optional, local YOLO object detector on each analyzed camera frame. Accident/crash/collision detections are returned as `traffic_accident` candidates and the live-feed UI creates a **critical, operator-review** alert with the captured evidence. This is a candidate signal, not a confirmed crash or an automatic dispatch. A camera location is required for a mappable alert.

## Enable a detector

1. Obtain compatible YOLO `.pt` weights from a reviewed source and check its model card, license, class names, and intended domain. The configured model is not downloaded automatically.
2. Install `backend/requirements-ai.txt` in the inference environment.
3. Set in `backend/.env`:

   ```env
   AI_ENABLE_TRAFFIC_ACCIDENT=true
   AI_TRAFFIC_ACCIDENT_CONFIDENCE=0.55
   TRAFFIC_ACCIDENT_MODEL_PATH=.localdata/models/traffic-accident.pt
   ```

4. Restart Django and inspect the inference module status. Keep the model disabled if weights are absent or unvalidated.

The detector emits only classes whose label contains `accident`, `crash`, or `collision`; vehicle detections alone do not become crash alerts. It runs per frame when enabled, so use a GPU-capable worker and tune capture cadence and confidence against local footage before operational use.

## Candidate resources

These user-provided resources are references, not bundled code or data. Confirm licenses and compatibility before downloading or deployment.

### Models

- [DETR traffic accident detection](https://huggingface.co/hilmantm/detr-traffic-accident-detection) — Apache-2.0; Transformers object-detection model. It is not directly compatible with this YOLO `.pt` adapter.
- [YOLO11x traffic accident detection](https://huggingface.co/Enos-123/traffic-accident-detection-yolo11x) — MIT model card; Ultralytics object detector. Candidate weights may be compatible after checking the repository files and label set.
- [VideoMAE-2 dashcam collision prediction](https://huggingface.co/jatinmehra/Accident-Detection-using-Dashcam) — MIT model card; Transformers video classifier. It needs a temporal clip-classification adapter and is not supported by the current frame detector.

### Pipelines and data

- [roihan12 traffic accident detection](https://github.com/roihan12/traffic-accident-detection) — YOLOv8/OpenCV/Flask example pipeline; reference only.
- [Accident-Detection-Model](https://github.com/shubhankar-shandilya-india/Accident-Detection-Model) — training and inference example; reference only.
- [ACCIDENT benchmark](https://github.com/accidentbench/ACCIDENT) — surveillance-video benchmark and baselines; review dataset terms before use.
- [Car Crash Dataset (CCD)](https://www.kaggle.com/datasets/asefjamilajwad/car-crash-dataset-ccd), [ACCIDENT competition](https://www.kaggle.com/competitions/accident), and [Nexar collision prediction](https://www.kaggle.com/competitions/nexar-collision-prediction) — datasets/benchmarks are not bundled or downloaded by Sentrix.
- [Nexar crash prediction training code](https://github.com/Jatin-Mehra119/-Nexar-Dashcam-Crash-Prediction-Challenge) — reference training pipeline.

The pinned model used by this adapter is `epoch61.pt` from the YOLO11x repository revision `cdc556d278e00273fc3af373051b0df2fb7c7f1e` (SHA-256 `ea56e358905e79e1451170e699b21ad774ca95e12034ae1ab1f7d09fd3619cae`). Download or verify it with:

```bash
cd backend
./venv/bin/python scripts/download_traffic_accident_model.py
```

The model file is stored under `.localdata/models/` and is intentionally excluded from Git. This avoids committing the 109 MiB binary while keeping retrieval reproducible.
