# Third-Party Notices

## Ultralytics YOLO (`ultralytics`)

The AI inference services in `backend/app/services/inference/` use `ultralytics` (listed in `backend/requirements-ai.txt`) for object, vehicle, and optional plate/face detection.

- **License:** GNU Affero General Public License v3.0 (**AGPL-3.0**) or a commercial license from Ultralytics.
- **Compliance Note:** Sentrix's own source code is licensed under MIT, but any deployment or distribution that includes `ultralytics` must comply with the **AGPL-3.0** terms (including network-use source disclosure) or obtain a **commercial Ultralytics license**, or replace the detector with a permissively licensed alternative (such as an ONNX/Apache-2.0 detector).

## ANPR module

The ANPR plate-format rules and service design in `app/services/inference/anpr/` are adapted from the supplied `IBVAP-modules/anpr-module` source. That source includes the Apache License 2.0; a copy is retained at `third_party_licenses/ANPR-APACHE-2.0.txt`.

## EasyOCR & OpenCV

- `easyocr` is licensed under the Apache License 2.0.
- `opencv-python-headless` is licensed under the Apache License 2.0.

## Person-tracking and face-detection modules

The supplied person-tracking script and face-recognition notebook did not include an explicit redistribution license. Their original source files, model weights, videos, result media, and sample face images are therefore not copied into this repository. The project contains new backend service boundaries that integrate the underlying capabilities through separately installed and properly licensed dependencies.
