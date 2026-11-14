"""Location workspace aggregation for the Sentrix map.

Given a map point, return everything operators are working on there:
alerts, cameras, guards, communities, resources, infrastructure,
roads, watchlist hits, and recent activity — with distances and
simple task-focused summaries.
"""

from __future__ import annotations

import math
from typing import Any

from .spatial_store import (
    _enabled as postgis_enabled,
    haversine_km as _haversine_km,
    nearest_responders,
    query_nearest_features,
    route_recommendation,
)


def haversine_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    return _haversine_km(float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"]))


def _point_of(item: dict[str, Any]) -> dict[str, float] | None:
    coords = item.get("coordinates")
    if isinstance(coords, dict):
        try:
            lat = float(coords["lat"])
            lng = float(coords["lng"])
        except (KeyError, TypeError, ValueError):
            return None
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return {"lat": lat, "lng": lng}
    return None


def _nearby(items: Any, center: dict[str, float], radius_km: float, limit: int) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        point = _point_of(item)
        if point is None:
            continue
        distance = haversine_km(center, point)
        if distance <= radius_km:
            scored.append((distance, {**item, "distanceKm": round(distance, 3)}))
    scored.sort(key=lambda entry: entry[0])
    return [entry[1] for entry in scored[:limit]]


def _nearby_roads(items: Any, center: dict[str, float], radius_km: float, limit: int) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        points = item.get("points")
        if not isinstance(points, list) or not points:
            continue
        try:
            best = min(
                haversine_km(center, {"lat": float(p["lat"]), "lng": float(p["lng"])})
                for p in points
                if isinstance(p, dict) and "lat" in p and "lng" in p
            )
        except (TypeError, ValueError):
            continue
        if best <= radius_km:
            scored.append((best, {**item, "distanceKm": round(best, 3)}))
    scored.sort(key=lambda entry: entry[0])
    return [entry[1] for entry in scored[:limit]]


def build_workspace(
    state: dict[str, Any], lat: float, lng: float, radius_km: float = 4.0, limit: int = 25
) -> dict[str, Any]:
    center = {"lat": lat, "lng": lng}
    radius_km = max(0.1, min(float(radius_km), 50.0))
    limit = max(1, min(int(limit), 50))

    # Leverage PostGIS spatial operators (ST_DWithin, ST_DistanceSphere) when enabled;
    # fall back gracefully to Haversine great-circle calculation.
    if postgis_enabled():
        try:
            communities = query_nearest_features("communities", lat, lng, radius_km, limit)
            if communities is None:
                communities = _nearby(state.get("communities"), center, radius_km, limit)
            resources = query_nearest_features("resources", lat, lng, radius_km, limit)
            if resources is None:
                resources = _nearby(state.get("resources"), center, radius_km, limit)
            infrastructure = query_nearest_features("infrastructure", lat, lng, radius_km, limit)
            if infrastructure is None:
                infrastructure = _nearby(state.get("infrastructure"), center, radius_km, limit)
            roads = query_nearest_features("roads", lat, lng, radius_km, limit)
            if roads is None:
                roads = _nearby_roads(state.get("roads"), center, radius_km, limit)
        except Exception:
            communities = _nearby(state.get("communities"), center, radius_km, limit)
            resources = _nearby(state.get("resources"), center, radius_km, limit)
            infrastructure = _nearby(state.get("infrastructure"), center, radius_km, limit)
            roads = _nearby_roads(state.get("roads"), center, radius_km, limit)
    else:
        communities = _nearby(state.get("communities"), center, radius_km, limit)
        resources = _nearby(state.get("resources"), center, radius_km, limit)
        infrastructure = _nearby(state.get("infrastructure"), center, radius_km, limit)
        roads = _nearby_roads(state.get("roads"), center, radius_km, limit)

    alerts = _nearby(state.get("alerts"), center, radius_km, limit)
    cameras = _nearby(state.get("cameras"), center, radius_km, limit)
    guards = [g for g in state.get("guards", []) if isinstance(g, dict) and str(g.get("currentSector") or "")]
    activity = state.get("activityLog", [])
    recent_activity = [a for a in activity if isinstance(a, dict)][:10]

    open_alerts = [a for a in alerts if a.get("status") in ("open", "acknowledged", "escalated")]
    critical = [a for a in alerts if a.get("level") == "critical" and a.get("status") != "resolved"]
    offline_cameras = [c for c in cameras if c.get("status") not in ("online", "active")]

    responders = nearest_responders(lat, lng, radius_km=radius_km, limit=5, state=state)
    routing = route_recommendation(lat, lng, radius_km=radius_km, state=state)

    return {
        "center": center,
        "radiusKm": radius_km,
        "summary": {
            "openAlerts": len(open_alerts),
            "criticalUnresolved": len(critical),
            "camerasNearby": len(cameras),
            "camerasOffline": len(offline_cameras),
            "communities": len(communities),
            "resources": len(resources),
            "infrastructure": len(infrastructure),
            "roads": len(roads),
        },
        "tasks": {
            "needsReview": [a["id"] for a in open_alerts[:10]],
            "offlineCameras": [c.get("id") for c in offline_cameras[:10]],
        },
        "alerts": alerts,
        "cameras": cameras,
        "guards": guards[:limit],
        "communities": communities,
        "resources": resources,
        "infrastructure": infrastructure,
        "roads": roads,
        "recentActivity": recent_activity,
        "nearestResponders": responders,
        "routeRecommendation": routing,
    }
