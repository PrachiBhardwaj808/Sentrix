"""Configurable geocoding and local location search for the Sentrix map.

The map must search names, landmarks, saved locations, coordinates,
cameras, alerts, communities, infrastructure, roads, and checkpoints
without depending on a paid provider in local deployments.

Provider selection:
  SENTRIX_GEOCODER_PROVIDER=local      (default, offline only)
  SENTRIX_GEOCODER_PROVIDER=nominatim  (OpenStreetMap, usage-limited)
  SENTRIX_GEOCODER_PROVIDER=disabled   (coordinate input only)

Caching and rate limiting are built in so the optional remote provider
cannot be hammered by live keystroke suggestions.
"""

from __future__ import annotations

import os
import re
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from threading import RLock
from typing import Any


COORDINATE_PATTERN = re.compile(
    r"^\s*(?P<lat>[+-]?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(?P<lng>[+-]?\d{1,3}(?:\.\d+)?)\s*$"
)

_LATLNG_PREFIX_PATTERN = re.compile(
    r"^\s*(?:lat(?:itude)?|lng|lon(?:gitude)?)?\s*[:=]?\s*(?P<lat>[+-]?\d{1,3}(?:\.\d+)?)"
    r"\s*[,;\s]\s*(?:lat(?:itude)?|lng|lon(?:gitude)?)?\s*[:=]?\s*(?P<lng>[+-]?\d{1,3}(?:\.\d+)?)\s*$",
    re.IGNORECASE,
)


def parse_coordinate_input(text: str) -> dict[str, float] | None:
    """Parse direct coordinate input such as ``28.6139, 77.2090``."""
    if not isinstance(text, str) or not text.strip():
        return None
    cleaned = text.strip().replace("(", "").replace(")", "")
    match = COORDINATE_PATTERN.match(cleaned) or _LATLNG_PREFIX_PATTERN.match(cleaned)
    if not match:
        return None
    try:
        lat = float(match.group("lat"))
        lng = float(match.group("lng"))
    except (TypeError, ValueError):
        return None
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        return None
    return {"lat": lat, "lng": lng}


def geocoder_provider() -> str:
    return os.getenv("SENTRIX_GEOCODER_PROVIDER", "local").strip().lower() or "local"


def _cache_ttl_seconds() -> int:
    try:
        return max(30, int(os.getenv("SENTRIX_GEOCODER_CACHE_TTL_SECONDS", "300")))
    except ValueError:
        return 300


def _rate_limit_per_minute() -> int:
    try:
        return max(1, int(os.getenv("SENTRIX_GEOCODER_RATE_LIMIT", "30")))
    except ValueError:
        return 30


class GeocoderCache:
    """Tiny TTL LRU cache for remote geocoder responses."""

    def __init__(self, max_entries: int = 200) -> None:
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_entries = max_entries
        self._lock = RLock()

    def get(self, key: str) -> Any | None:
        ttl = _cache_ttl_seconds()
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            stored_at, value = entry
            if now - stored_at > ttl:
                self._store.pop(key, None)
                return None
            self._store.move_to_end(key)
            return value

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key.strip().casefold()] = (time.monotonic(), value)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


class RateLimiter:
    """Fixed-window rate limiter for outbound geocoder calls."""

    def __init__(self) -> None:
        self._hits: list[float] = []
        self._lock = RLock()

    def check(self) -> None:
        limit = _rate_limit_per_minute()
        now = time.monotonic()
        window_start = now - 60.0
        with self._lock:
            self._hits = [hit for hit in self._hits if hit > window_start]
            if len(self._hits) >= limit:
                raise RateLimitExceeded(
                    f"geocoder rate limit exceeded ({limit}/minute)"
                )
            self._hits.append(now)


class RateLimitExceeded(RuntimeError):
    pass


_CACHE = GeocoderCache()
_LIMITER = RateLimiter()


def _text_fields(record: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("name", "label", "title", "value", "eventType", "code", "type", "category", "reason"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)
    return " ".join(parts).casefold()


def _point_for(record: dict[str, Any]) -> dict[str, float] | None:
    coordinates = record.get("coordinates")
    if isinstance(coordinates, dict):
        try:
            lat = float(coordinates["lat"])
            lng = float(coordinates["lng"])
        except (KeyError, TypeError, ValueError):
            return None
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return {"lat": lat, "lng": lng}
    points = record.get("points")
    if isinstance(points, list) and points:
        first = points[0] if isinstance(points[0], dict) else None
        if first:
            try:
                return {"lat": float(first["lat"]), "lng": float(first["lng"])}
            except (KeyError, TypeError, ValueError):
                return None
    center = record.get("centerCoordinates")
    if isinstance(center, dict):
        try:
            return {"lat": float(center["lat"]), "lng": float(center["lng"])}
        except (KeyError, TypeError, ValueError):
            return None
    return None


def search_local_collections(query: str, state: dict[str, Any], limit: int = 8) -> list[dict[str, Any]]:
    """Search backend-owned collections for map suggestions."""
    needle = (query or "").strip().casefold()
    if not needle:
        return []
    limit = max(1, min(int(limit or 8), 20))
    results: list[dict[str, Any]] = []

    coordinate = parse_coordinate_input(query)
    if coordinate:
        results.append({
            "id": f"coord:{coordinate['lat']:.5f},{coordinate['lng']:.5f}",
            "kind": "coordinates",
            "label": f"{coordinate['lat']:.5f}, {coordinate['lng']:.5f}",
            "sublabel": "Direct coordinates",
            "lat": coordinate["lat"],
            "lng": coordinate["lng"],
            "source": "coordinate_input",
        })

    collections: tuple[tuple[str, str], ...] = (
        ("cameras", "camera"),
        ("alerts", "alert"),
        ("communities", "community"),
        ("infrastructure", "infrastructure"),
        ("roads", "road"),
        ("resources", "resource"),
        ("sectors", "checkpoint"),
        ("guards", "checkpoint"),
        ("watchlistEntries", "watchlist"),
    )
    for collection, kind in collections:
        items = state.get(collection, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            haystack = f"{_text_fields(item)} {str(item.get('id', '')).casefold()}"
            if needle not in haystack:
                continue
            point = _point_for(item)
            if point is None and kind == "road" and isinstance(item.get("points"), list):
                continue
            if point is None:
                continue
            label = str(item.get("name") or item.get("label") or item.get("eventType") or item.get("id"))
            sublabel = {
                "camera": f"Camera · {item.get('status', 'unknown')}",
                "alert": f"Alert · {item.get('level', 'medium')} · {item.get('status', 'open')}",
                "community": "Community",
                "infrastructure": f"Infrastructure · {item.get('type', 'site')}",
                "road": f"Road · {item.get('status', 'open')}",
                "resource": f"Resource · {item.get('type', 'unit')}",
                "checkpoint": "Checkpoint / post",
                "watchlist": "Watchlist",
            }.get(kind, kind)
            results.append({
                "id": f"{kind}:{item.get('id')}",
                "kind": kind,
                "label": label,
                "sublabel": sublabel,
                "lat": point["lat"],
                "lng": point["lng"],
                "source": "local_state",
                "recordId": str(item.get("id")),
            })
            if len(results) >= limit:
                return results[:limit]
    return results[:limit]


def search_remote(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Query the configured remote provider with cache and rate limits."""
    provider = geocoder_provider()
    if provider == "disabled":
        return []
    if provider != "nominatim":
        return []
    needle = query.strip()
    if len(needle) < 3:
        return []
    cache_key = f"nominatim:{needle.casefold()}:{limit}"
    cached = _CACHE.get(cache_key)
    if cached is not None:
        return cached
    _LIMITER.check()
    params = urllib.parse.urlencode({
        "q": needle,
        "format": "jsonv2",
        "limit": max(1, min(limit, 8)),
        "addressdetails": 1,
    })
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{params}",
        headers={"User-Agent": "SentrixCommandCenter/1.0 (operations map search)"},
    )
    with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310
        import json

        payload = json.loads(response.read().decode("utf-8"))
    results: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for item in payload:
            try:
                lat = float(item["lat"])
                lng = float(item["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            results.append({
                "id": f"nominatim:{item.get('place_id')}",
                "kind": "place",
                "label": str(item.get("display_name", needle).split(",")[0]),
                "sublabel": str(item.get("display_name", ""))[:120],
                "lat": lat,
                "lng": lng,
                "source": "nominatim",
            })
    _CACHE.put(cache_key, results)
    return results


def clear_cache() -> None:
    _CACHE.clear()
