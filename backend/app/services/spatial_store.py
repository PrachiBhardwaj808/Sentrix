"""PostGIS projection and geospatial querying for validated Sentrix map features."""

from __future__ import annotations

import json
import math
import os
from typing import Any, Sequence

from django.db import connection, transaction


SPATIAL_COLLECTIONS = ("communities", "resources", "infrastructure", "roads")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Standard Haversine great-circle distance calculation in kilometers."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return 6371.0 * 2.0 * math.asin(math.sqrt(max(0.0, min(1.0, a))))


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
    """Seed the spatial projection once at startup from the canonical state."""
    if not _enabled():
        return
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SELECT EXISTS (SELECT 1 FROM sentrix_spatial_features)")
        if cursor.fetchone()[0]:
            return
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


def features_in_bbox(
    south: float,
    west: float,
    north: float,
    east: float,
    collection: str | None = None,
    state_fallback: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]] | list[dict[str, Any]] | None:
    """Query features inside a geographic bounding box.

    If PostGIS is enabled, leverages the GiST spatial index using ST_MakeEnvelope and &&.
    If PostGIS is disabled and state_fallback is provided, falls back to in-memory bounding box filtering.
    """
    if _enabled():
        try:
            return _query_bbox_postgis(south, west, north, east, collection)
        except Exception:
            if state_fallback is None:
                return None
    if state_fallback is not None:
        return _filter_bbox_in_memory(state_fallback, south, west, north, east, collection)
    return None


def _query_bbox_postgis(
    south: float, west: float, north: float, east: float, collection: str | None = None
) -> dict[str, list[dict[str, Any]]] | list[dict[str, Any]]:
    with connection.cursor() as cursor:
        if collection:
            cursor.execute(
                """
                SELECT payload
                FROM sentrix_spatial_features
                WHERE collection = %s
                  AND geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
                  AND ST_Intersects(geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
                ORDER BY record_id
                """,
                [collection, west, south, east, north, west, south, east, north],
            )
            return [json.loads(p) if isinstance(p, str) else p for (p,) in cursor.fetchall()]

        grouped: dict[str, list[dict[str, Any]]] = {c: [] for c in SPATIAL_COLLECTIONS}
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
        for coll, payload in cursor.fetchall():
            if coll in grouped:
                grouped[coll].append(json.loads(payload) if isinstance(payload, str) else payload)
        return grouped


def _filter_bbox_in_memory(
    state: dict[str, Any], south: float, west: float, north: float, east: float, collection: str | None = None
) -> dict[str, list[dict[str, Any]]] | list[dict[str, Any]]:
    target_collections = (collection,) if collection else SPATIAL_COLLECTIONS
    grouped: dict[str, list[dict[str, Any]]] = {c: [] for c in target_collections}

    for coll in target_collections:
        items = state.get(coll, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            if coll == "roads" and isinstance(item.get("points"), list):
                if any(
                    isinstance(p, dict)
                    and "lat" in p
                    and "lng" in p
                    and west <= float(p["lng"]) <= east
                    and south <= float(p["lat"]) <= north
                    for p in item["points"]
                ):
                    grouped[coll].append(item)
            else:
                coords = item.get("coordinates")
                if isinstance(coords, dict) and "lat" in coords and "lng" in coords:
                    try:
                        lat = float(coords["lat"])
                        lng = float(coords["lng"])
                        if west <= lng <= east and south <= lat <= north:
                            grouped[coll].append(item)
                    except (TypeError, ValueError):
                        continue

    if collection:
        return grouped.get(collection, [])
    return grouped


def query_nearest_features(
    collection: str | Sequence[str],
    lat: float,
    lng: float,
    radius_km: float = 50.0,
    limit: int = 25,
) -> list[dict[str, Any]] | None:
    """Find features within radius_km using PostGIS ST_DWithin and ST_DistanceSphere.

    Uses PostGIS spatial operators:
    - ST_DWithin(geom::geography, point::geography, radius_meters) backed by the GiST spatial index.
    - ST_DistanceSphere(geom, point) for true geodesic distance in km.
    Returns None if PostGIS is not available.
    """
    if not _enabled():
        return None

    radius_meters = float(radius_km) * 1000.0
    collections = [collection] if isinstance(collection, str) else list(collection)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT collection, payload,
                   (ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326)) / 1000.0) AS distance_km
            FROM sentrix_spatial_features
            WHERE collection = ANY(%s)
              AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)
            ORDER BY distance_km ASC
            LIMIT %s
            """,
            [lng, lat, collections, lng, lat, radius_meters, limit],
        )
        results: list[dict[str, Any]] = []
        for _coll, payload, distance_km in cursor.fetchall():
            record = json.loads(payload) if isinstance(payload, str) else payload
            record_copy = dict(record)
            record_copy["distanceKm"] = round(float(distance_km), 3)
            results.append(record_copy)
        return results


def nearest_responders(
    lat: float,
    lng: float,
    radius_km: float = 25.0,
    limit: int = 5,
    state: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Locate the nearest emergency responders / resources to coordinates.

    Uses PostGIS spatial operators (ST_DWithin, ST_DistanceSphere) when enabled.
    Gracefully falls back to Haversine great-circle calculation when PostGIS is unavailable.
    """
    radius_km = max(0.1, min(float(radius_km), 100.0))
    limit = max(1, min(int(limit), 50))

    if _enabled():
        try:
            db_results = query_nearest_features("resources", lat, lng, radius_km, limit)
            if db_results is not None:
                return db_results
        except Exception:
            pass

    if state is None:
        return []

    resources = state.get("resources", [])
    if not isinstance(resources, list):
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for item in resources:
        if not isinstance(item, dict):
            continue
        coords = item.get("coordinates")
        if not isinstance(coords, dict):
            continue
        try:
            r_lat = float(coords["lat"])
            r_lng = float(coords["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (-90 <= r_lat <= 90 and -180 <= r_lng <= 180):
            continue
        dist = haversine_km(lat, lng, r_lat, r_lng)
        if dist <= radius_km:
            scored.append((dist, {**item, "distanceKm": round(dist, 3)}))

    scored.sort(key=lambda entry: entry[0])
    return [entry[1] for entry in scored[:limit]]


def route_recommendation(
    lat: float,
    lng: float,
    radius_km: float = 10.0,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Calculate the optimal patrol or responder route recommendation to coordinates.

    Evaluates road segments and nearby alerts using PostGIS spatial operators:
    - LineString distance using ST_DistanceSphere and ST_DWithin
    - Proximity to affected vs open corridors
    Gracefully falls back to Haversine point-to-road calculation when PostGIS is unavailable.
    """
    radius_km = max(0.5, min(float(radius_km), 50.0))
    nearby_roads: list[dict[str, Any]] = []
    used_provider = "haversine_fallback"

    if _enabled():
        try:
            db_roads = query_nearest_features("roads", lat, lng, radius_km, limit=20)
            if db_roads is not None:
                nearby_roads = db_roads
                used_provider = "postgis"
        except Exception:
            nearby_roads = []

    if used_provider == "haversine_fallback" and state:
        roads = state.get("roads", [])
        if isinstance(roads, list):
            scored: list[tuple[float, dict[str, Any]]] = []
            for road in roads:
                if not isinstance(road, dict):
                    continue
                points = road.get("points")
                if not isinstance(points, list) or not points:
                    continue
                try:
                    best_dist = min(
                        haversine_km(lat, lng, float(p["lat"]), float(p["lng"]))
                        for p in points
                        if isinstance(p, dict) and "lat" in p and "lng" in p
                    )
                except (TypeError, ValueError):
                    continue
                if best_dist <= radius_km:
                    scored.append((best_dist, {**road, "distanceKm": round(best_dist, 3)}))
            scored.sort(key=lambda entry: entry[0])
            nearby_roads = [entry[1] for entry in scored]

    nearby_alerts: list[dict[str, Any]] = []
    if state:
        alerts = state.get("alerts", [])
        if isinstance(alerts, list):
            for alert in alerts:
                if not isinstance(alert, dict) or alert.get("status") == "resolved":
                    continue
                coords = alert.get("coordinates")
                if isinstance(coords, dict) and "lat" in coords and "lng" in coords:
                    try:
                        a_dist = haversine_km(lat, lng, float(coords["lat"]), float(coords["lng"]))
                        if a_dist <= 2.5:
                            nearby_alerts.append({**alert, "distanceKm": round(a_dist, 3)})
                    except (TypeError, ValueError):
                        continue

    affected_roads = [
        r for r in nearby_roads
        if str(r.get("status", "")).casefold() in ("affected", "high_risk", "blocked")
    ]
    open_roads = [
        r for r in nearby_roads
        if str(r.get("status", "")).casefold() in ("open", "clear", "active")
    ]
    if not open_roads and nearby_roads:
        open_roads = [r for r in nearby_roads if r not in affected_roads]

    nearest_open = open_roads[0] if open_roads else None
    nearest_affected = affected_roads[0] if affected_roads else None

    if nearest_affected and nearest_open:
        route_text = f"{nearest_open.get('name', 'Available route')} -> approach via alternate corridor"
        avoid_text = nearest_affected.get("name", "Affected perimeter road")
        reason_text = (
            f"Segment '{nearest_affected.get('name')}' is {nearest_affected.get('status', 'affected')} "
            f"({nearest_affected.get('distanceKm')} km away). Dispatched units should route via '{nearest_open.get('name')}'."
        )
    elif nearest_affected and not nearest_open:
        route_text = "Proceed with caution; no verified open road registered in corridor"
        avoid_text = nearest_affected.get("name", "Affected perimeter road")
        reason_text = f"Immediate access road '{nearest_affected.get('name')}' is marked {nearest_affected.get('status')}."
    elif nearest_open:
        route_text = f"{nearest_open.get('name')} -> direct approach"
        avoid_text = "Active incident perimeter" if nearby_alerts else "No restricted segment identified"
        reason_text = (
            "Response team routed along open perimeter corridor keeping outside active hazard zones."
            if nearby_alerts
            else f"Direct approach along verified open corridor '{nearest_open.get('name')}'."
        )
    else:
        route_text = "No configured response route in corridor"
        avoid_text = "Active incident perimeter" if nearby_alerts else "Unsurveyed perimeter"
        reason_text = "No registered roads within response corridor. Add verified road geometries or dispatch aerial unit."

    return {
        "target": {"lat": round(lat, 5), "lng": round(lng, 5)},
        "radiusKm": radius_km,
        "provider": used_provider,
        "route": route_text,
        "avoid": avoid_text,
        "reason": reason_text,
        "nearestRoad": nearest_open,
        "affectedRoad": nearest_affected,
        "nearbyRoads": nearby_roads[:10],
        "activeAlertsCount": len(nearby_alerts),
    }


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
