"""PostGIS projection for validated Sentrix map features."""

from __future__ import annotations

import json
import os
from typing import Any

from django.db import connection, transaction


SPATIAL_COLLECTIONS = ("communities", "resources", "infrastructure", "roads")


def geometry_for_feature(collection: str, record: dict[str, Any]) -> dict[str, Any] | None:
    if collection == "roads":
        points = record.get("points")
        if not isinstance(points, list) or len(points) < 2:
            return None
        coordinates = [_longitude_latitude(point) for point in points]
        if any(point is None for point in coordinates):
            return None
        return {"type": "LineString", "coordinates": coordinates}

    if collection not in SPATIAL_COLLECTIONS:
        return None
    coordinates = _longitude_latitude(record.get("coordinates"))
    if coordinates is None:
        return None
    return {"type": "Point", "coordinates": coordinates}


def upsert_spatial_feature(collection: str, record: dict[str, Any]) -> None:
    if not _enabled():
        return
    geometry = geometry_for_feature(collection, record)
    if geometry is None:
        raise ValueError("feature has no valid PostGIS geometry")
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO sentrix_spatial_features (collection, record_id, payload, geom)
            VALUES (%s, %s, %s::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            ON CONFLICT (collection, record_id) DO UPDATE SET
                payload = EXCLUDED.payload,
                geom = EXCLUDED.geom,
                updated_at = CURRENT_TIMESTAMP
            """,
            [collection, str(record["id"]), json.dumps(record), json.dumps(geometry)],
        )


def delete_spatial_feature(collection: str, record_id: str) -> None:
    if not _enabled():
        return
    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM sentrix_spatial_features WHERE collection = %s AND record_id = %s",
            [collection, str(record_id)],
        )


def sync_spatial_features(state: dict[str, Any]) -> None:
    """Rebuild the spatial projection once at startup from the canonical state."""
    if not _enabled():
        return
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("DELETE FROM sentrix_spatial_features")
        for collection in SPATIAL_COLLECTIONS:
            for record in state.get(collection, []):
                if isinstance(record, dict) and record.get("id"):
                    geometry = geometry_for_feature(collection, record)
                    if geometry is None:
                        continue
                    cursor.execute(
                        """
                        INSERT INTO sentrix_spatial_features (collection, record_id, payload, geom)
                        VALUES (%s, %s, %s::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                        ON CONFLICT (collection, record_id) DO UPDATE SET
                            payload = EXCLUDED.payload,
                            geom = EXCLUDED.geom,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        [collection, str(record["id"]), json.dumps(record), json.dumps(geometry)],
                    )


def features_in_bbox(south: float, west: float, north: float, east: float) -> dict[str, list[dict[str, Any]]] | None:
    if not _enabled():
        return None
    grouped = {collection: [] for collection in SPATIAL_COLLECTIONS}
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT collection, payload
            FROM sentrix_spatial_features
            WHERE geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
              AND ST_Intersects(geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
            ORDER BY collection, record_id
            """,
            [west, south, east, north, west, south, east, north],
        )
        for collection, payload in cursor.fetchall():
            if collection in grouped:
                grouped[collection].append(json.loads(payload) if isinstance(payload, str) else payload)
    return grouped


def _enabled() -> bool:
    return os.getenv("SENTRIX_STATE_STORAGE", "").strip().lower() == "postgres" and connection.vendor == "postgresql"


def _longitude_latitude(value: Any) -> list[float] | None:
    if not isinstance(value, dict):
        return None
    try:
        latitude = float(value["lat"])
        longitude = float(value["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return [longitude, latitude]
