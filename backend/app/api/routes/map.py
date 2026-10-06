"""Map domain endpoints: search, nearby, viewport, and location workspace."""

from __future__ import annotations

import math
from typing import Any

from django.core import signing
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_http_methods

from ..repository import repository


def _error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _session_from_request(request: HttpRequest) -> dict[str, Any] | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        value = signing.loads(header[7:], salt="borderlens.console.auth", max_age=60 * 60 * 12)
    except signing.BadSignature:
        return None
    if not isinstance(value, dict):
        return None
    operator_id = str(value.get("operatorId") or "")
    user = repository.get_auth_user(operator_id)
    if not user or user.get("disabled"):
        return None
    try:
        token_version = int(value.get("tokenVersion", 1))
        current_version = int(user.get("tokenVersion", 1))
    except (TypeError, ValueError):
        return None
    if token_version != current_version:
        return None
    return value


def _valid_coordinates(value: dict[str, Any]) -> bool:
    try:
        latitude = float(value.get("lat"))
        longitude = float(value.get("lng"))
    except (TypeError, ValueError):
        return False
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _haversine_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    lat1 = math.radians(float(a["lat"]))
    lat2 = math.radians(float(b["lat"]))
    delta_lat = lat2 - lat1
    delta_lng = math.radians(float(b["lng"]) - float(a["lng"]))
    h = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


@require_http_methods(["GET"])
def map_search(request: HttpRequest) -> JsonResponse:
    """Live map suggestions across local collections plus coordinate input."""
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    from ...services.geocoding import (
        RateLimitExceeded,
        geocoder_provider,
        search_local_collections,
        search_remote,
    )

    query = str(request.GET.get("q") or "").strip()
    if len(query) < 2:
        return _error("search query must be at least 2 characters")
    try:
        limit = max(1, min(int(request.GET.get("limit", "8")), 20))
    except (TypeError, ValueError):
        return _error("limit must be an integer")
    snapshot = repository.snapshot()
    results = search_local_collections(query, snapshot, limit)
    provider = geocoder_provider()
    remote_results: list[dict[str, Any]] = []
    if provider not in {"disabled"} and len(results) < limit:
        try:
            remote_results = search_remote(query, limit - len(results))
        except RateLimitExceeded as exc:
            response = JsonResponse({
                "query": query,
                "provider": provider,
                "results": results,
                "remote": [],
                "warning": str(exc),
            })
            response.status_code = 429
            return response
        except Exception:
            remote_results = []
    return JsonResponse({
        "query": query,
        "provider": provider,
        "results": [*results, *remote_results],
        "remote": remote_results,
    })


@require_http_methods(["GET"])
def nearby_assets(request: HttpRequest) -> JsonResponse:
    """Assets near a map point for the right-side details panel."""
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    try:
        lat = float(request.GET.get("lat", ""))
        lng = float(request.GET.get("lng", ""))
    except (TypeError, ValueError):
        return _error("lat and lng query parameters are required")
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        return _error("coordinates are out of range")
    try:
        radius_km = float(request.GET.get("radiusKm", "4"))
    except (TypeError, ValueError):
        return _error("radiusKm must be numeric")
    radius_km = max(0.1, min(radius_km, 50.0))
    try:
        limit = max(1, min(int(request.GET.get("limit", "8")), 25))
    except (TypeError, ValueError):
        return _error("limit must be an integer")
    snapshot = repository.snapshot()
    center = {"lat": lat, "lng": lng}
    grouped: dict[str, list[dict[str, Any]]] = {
        "cameras": [],
        "alerts": [],
        "communities": [],
        "resources": [],
        "infrastructure": [],
    }
    for collection in grouped:
        items = snapshot.get(collection, [])
        if not isinstance(items, list):
            continue
        scored: list[tuple[float, dict[str, Any]]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            point = item.get("coordinates")
            if not isinstance(point, dict) or not _valid_coordinates(point):
                continue
            distance = _haversine_km(center, point)
            if distance <= radius_km:
                scored.append((distance, {**item, "distanceKm": round(distance, 3)}))
        scored.sort(key=lambda entry: entry[0])
        grouped[collection] = [entry[1] for entry in scored[:limit]]
    return JsonResponse({"center": center, "radiusKm": radius_km, **grouped})


@require_http_methods(["GET"])
def map_features(request: HttpRequest) -> JsonResponse:
    """Paginated, filterable map viewport API for performance."""
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    try:
        page = max(1, int(request.GET.get("page", "1")))
        page_size = max(1, min(int(request.GET.get("pageSize", "50")), 200))
    except (TypeError, ValueError):
        return _error("page and pageSize must be integers")
    record_type = str(request.GET.get("recordType") or "alerts").strip().lower()
    if record_type not in {"alerts", "cameras", "communities", "resources", "infrastructure", "roads"}:
        return _error("unsupported recordType")
    snapshot = repository.snapshot()
    items = list(snapshot.get(record_type, []))
    severity = str(request.GET.get("severity") or "").strip().lower()
    status = str(request.GET.get("status") or "").strip().lower()
    sector = str(request.GET.get("sector") or "").strip().casefold()
    source = str(request.GET.get("source") or "").strip().casefold()
    if severity:
        items = [
            item
            for item in items
            if str(item.get("level") or item.get("triageSeverity") or "").casefold() == severity
        ]
    if status:
        items = [item for item in items if str(item.get("status") or "").casefold() == status]
    if sector:
        items = [item for item in items if sector in str(item.get("sector") or "").casefold()]
    if source:
        items = [item for item in items if str(item.get("evidenceSource") or "").casefold() == source]
    bbox_parameter = request.GET.get("bbox")
    if bbox_parameter:
        try:
            west, south, east, north = (float(value) for value in bbox_parameter.split(","))
        except (TypeError, ValueError):
            return _error("bbox must be west,south,east,north numeric coordinates")
        filtered: list[dict[str, Any]] = []
        for item in items:
            point = item.get("coordinates")
            if isinstance(point, dict) and _valid_coordinates(point):
                if west <= float(point["lng"]) <= east and south <= float(point["lat"]) <= north:
                    filtered.append(item)
            elif record_type == "roads" and isinstance(item.get("points"), list):
                if any(
                    isinstance(point, dict) and _valid_coordinates(point)
                    and west <= float(point["lng"]) <= east and south <= float(point["lat"]) <= north
                    for point in item["points"]
                ):
                    filtered.append(item)
        items = filtered
    total = len(items)
    start = (page - 1) * page_size
    return JsonResponse({
        "recordType": record_type,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "features": items[start:start + page_size],
    })


@require_http_methods(["GET"])
def location_workspace(request: HttpRequest) -> JsonResponse:
    """Everything operators are working on around one map point."""
    session = _session_from_request(request)
    if not session:
        return _error("authenticated operator access is required", 401)
    from ...services.location_workspace import build_workspace

    try:
        lat = float(request.GET.get("lat", ""))
        lng = float(request.GET.get("lng", ""))
    except (TypeError, ValueError):
        return _error("lat and lng query parameters are required")
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        return _error("coordinates are out of range")
    try:
        radius_km = float(request.GET.get("radiusKm", "4"))
    except (TypeError, ValueError):
        return _error("radiusKm must be numeric")
    return JsonResponse(build_workspace(repository.snapshot(), lat, lng, radius_km))
