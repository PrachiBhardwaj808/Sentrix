"""Strict GeoJSON import for administrator-managed reference features."""

from __future__ import annotations

from typing import Any


MAX_IMPORT_FEATURES = 500
POINT_COLLECTIONS = {"communities", "resources", "infrastructure"}


class GeoJsonImportError(ValueError):
    pass


def parse_feature_collection(collection: str, document: Any) -> list[dict[str, Any]]:
    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        raise GeoJsonImportError("upload must be a GeoJSON FeatureCollection")
    features = document.get("features")
    if not isinstance(features, list) or not features:
        raise GeoJsonImportError("FeatureCollection must contain at least one feature")
    if len(features) > MAX_IMPORT_FEATURES:
        raise GeoJsonImportError(f"imports are limited to {MAX_IMPORT_FEATURES} features")

    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, feature in enumerate(features):
        record = _parse_feature(collection, feature, index)
        record_id = record["id"]
        if record_id in seen_ids:
            raise GeoJsonImportError(f"feature {index + 1} duplicates id {record_id!r}")
        seen_ids.add(record_id)
        records.append(record)
    return records


def _parse_feature(collection: str, feature: Any, index: int) -> dict[str, Any]:
    label = f"feature {index + 1}"
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise GeoJsonImportError(f"{label} must have type Feature")
    properties = feature.get("properties") or {}
    geometry = feature.get("geometry")
    if not isinstance(properties, dict) or not isinstance(geometry, dict):
        raise GeoJsonImportError(f"{label} must include object properties and geometry")

    record_id = str(properties.get("id") or feature.get("id") or "").strip()
    if not record_id:
        raise GeoJsonImportError(f"{label} requires a stable id in properties.id or feature.id")
    if len(record_id) > 200:
        raise GeoJsonImportError(f"{label} id must be 200 characters or fewer")

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    record = {**properties, "id": record_id}
    if collection in POINT_COLLECTIONS and geometry_type == "Point":
        point = _coordinate_pair(coordinates, label)
        record["coordinates"] = {"lat": point[1], "lng": point[0]}
        return record
    if collection == "roads" and geometry_type == "LineString":
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            raise GeoJsonImportError(f"{label} road geometry needs at least two coordinates")
        record["points"] = [
            {"lat": point[1], "lng": point[0]}
            for point in (_coordinate_pair(item, label) for item in coordinates)
        ]
        return record
    expected = "Point" if collection in POINT_COLLECTIONS else "LineString"
    raise GeoJsonImportError(f"{label} geometry must be {expected} for collection {collection!r}")


def _coordinate_pair(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) < 2:
        raise GeoJsonImportError(f"{label} coordinates must contain longitude and latitude")
    try:
        longitude, latitude = float(value[0]), float(value[1])
    except (TypeError, ValueError):
        raise GeoJsonImportError(f"{label} coordinates must be numeric") from None
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise GeoJsonImportError(f"{label} coordinates are outside WGS84 bounds")
    return [longitude, latitude]
