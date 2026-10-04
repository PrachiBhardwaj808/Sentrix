# Third-Party Notices

## ANPR module

The ANPR plate-format rules and service design in `app/services/inference/anpr/` are adapted from the supplied `IBVAP-modules/anpr-module` source. That source includes the Apache License 2.0; a copy is retained at `third_party_licenses/ANPR-APACHE-2.0.txt`.

## Person-tracking and face-detection modules

The supplied person-tracking script and face-recognition notebook did not include an explicit redistribution license. Their original source files, model weights, videos, result media, and sample face images are therefore not copied into this repository. The project contains new backend service boundaries that integrate the underlying capabilities through separately installed and properly licensed dependencies.
