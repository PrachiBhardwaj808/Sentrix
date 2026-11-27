"""Cross-camera vehicle sighting association, wildcard search, and plausibility filtering."""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from .plate_format import normalize_indian_plate


# Symmetric OCR confusion pairs that frequently occur in CCTV/ANPR crops.
_OCR_CONFUSION_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"0", "O", "D", "Q"}),
    frozenset({"1", "I", "L"}),
    frozenset({"2", "Z"}),
    frozenset({"5", "S"}),
    frozenset({"8", "B"}),
    frozenset({"6", "G"}),
)


def _clean_plate(value: str) -> str:
    return re.sub(r"[^A-Z0-9?*]", "", (value or "").upper())


def _substitution_cost(a: str, b: str) -> float:
    if a == b:
        return 0.0
    for group in _OCR_CONFUSION_GROUPS:
        if a in group and b in group:
            return 0.25
    return 1.0


def plate_similarity(plate_a: str, plate_b: str) -> float:
    """Return OCR-confusion-aware normalized similarity in [0.0, 1.0]."""

    a = normalize_indian_plate(plate_a)
    b = normalize_indian_plate(plate_b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    rows = len(a) + 1
    cols = len(b) + 1
    dp = [[0.0] * cols for _ in range(rows)]
    for i in range(rows):
        dp[i][0] = float(i)
    for j in range(cols):
        dp[0][j] = float(j)

    for i in range(1, rows):
        for j in range(1, cols):
            cost = _substitution_cost(a[i - 1], b[j - 1])
            dp[i][j] = min(
                dp[i - 1][j] + 1.0,
                dp[i][j - 1] + 1.0,
                dp[i - 1][j - 1] + cost,
            )

    max_len = max(len(a), len(b))
    return round(max(0.0, 1.0 - (dp[-1][-1] / max_len)), 4)


def matches_plate_pattern(plate: str, pattern: str) -> bool:
    """Match a plate against a partial/wildcard query such as ``DL1?ER48??``."""

    clean_pattern = _clean_plate(pattern)
    if not clean_pattern:
        return False
    clean_plate = re.sub(r"[^A-Z0-9]", "", (plate or "").upper())
    normalized = normalize_indian_plate(clean_plate)

    regex_parts = ["^"]
    for ch in clean_pattern:
        if ch == "?":
            regex_parts.append("[A-Z0-9]")
        elif ch == "*":
            regex_parts.append("[A-Z0-9]*")
        else:
            regex_parts.append(re.escape(ch))
    regex_parts.append("$")
    compiled = re.compile("".join(regex_parts))
    return bool(compiled.match(clean_plate) or compiled.match(normalized))


def _parse_ts(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _haversine_km(a: Mapping[str, Any], b: Mapping[str, Any]) -> float | None:
    try:
        lat1, lng1 = float(a["lat"]), float(a["lng"])
        lat2, lng2 = float(b["lat"]), float(b["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lng2 - lng1)
    h = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 6371.0 * 2.0 * math.asin(math.sqrt(max(0.0, min(1.0, h))))


def trace_vehicle_trail(
    sightings: Iterable[Mapping[str, Any]],
    *,
    query_plate: str,
    max_speed_kmh: float = 160.0,
    min_plate_similarity: float = 0.72,
) -> dict[str, Any]:
    """Build an ordered, plausibility-filtered candidate vehicle trail.

    Every sighting and link is returned as a candidate requiring operator review.
    """

    clean_query = _clean_plate(query_plate)
    is_wildcard = "?" in clean_query or "*" in clean_query
    matched: list[tuple[datetime, dict[str, Any]]] = []

    for item in sightings:
        raw_plate = str(item.get("plateNumber") or item.get("plate") or "").strip()
        if not raw_plate:
            continue
        ts = _parse_ts(item.get("timestamp"))
        if ts is None:
            continue

        if is_wildcard:
            if not matches_plate_pattern(raw_plate, clean_query):
                continue
            sim = 1.0
        else:
            sim = plate_similarity(raw_plate, clean_query)
            if sim < min_plate_similarity:
                continue

        conf_raw = float(item.get("confidence") or 0.0)
        conf = conf_raw / 100.0 if conf_raw > 1.0 else conf_raw
        matched.append((
            ts,
            {
                **dict(item),
                "normalizedPlate": normalize_indian_plate(raw_plate),
                "plateSimilarity": sim,
                "detectionConfidence": round(max(0.0, min(1.0, conf)), 4),
            },
        ))

    matched.sort(key=lambda entry: entry[0])
    ordered_sightings = [entry[1] for entry in matched]
    links: list[dict[str, Any]] = []
    rejected_links: list[dict[str, Any]] = []

    for idx in range(len(matched) - 1):
        ts_a, prev = matched[idx]
        ts_b, curr = matched[idx + 1]
        elapsed_sec = (ts_b - ts_a).total_seconds()
        dist_km = _haversine_km(prev.get("coordinates") or {}, curr.get("coordinates") or {})

        plausible = True
        reason = "plausible_transition"
        implied_speed_kmh: float | None = None

        if dist_km is not None:
            if elapsed_sec <= 0 and dist_km > 0.2:
                plausible = False
                reason = "simultaneous_distant_cameras"
            elif elapsed_sec > 0:
                implied_speed_kmh = round(dist_km / (elapsed_sec / 3600.0), 2)
                if implied_speed_kmh > max_speed_kmh:
                    plausible = False
                    reason = "implausible_travel_speed"

        sim_pair = min(prev["plateSimilarity"], curr["plateSimilarity"])
        det_pair = min(prev["detectionConfidence"], curr["detectionConfidence"])
        link_confidence = round((0.6 * sim_pair + 0.4 * det_pair) if plausible else 0.0, 4)

        link_record = {
            "fromCameraId": prev.get("cameraId") or prev.get("sourceCameraId"),
            "toCameraId": curr.get("cameraId") or curr.get("sourceCameraId"),
            "fromTimestamp": ts_a.isoformat(),
            "toTimestamp": ts_b.isoformat(),
            "elapsedSeconds": round(elapsed_sec, 2),
            "distanceKm": round(dist_km, 3) if dist_km is not None else None,
            "impliedSpeedKmh": implied_speed_kmh,
            "plausible": plausible,
            "reason": reason,
            "confidence": link_confidence,
            "requiresOperatorReview": True,
        }
        if plausible:
            links.append(link_record)
        else:
            rejected_links.append(link_record)

    return {
        "queryPlate": clean_query,
        "wildcardQuery": is_wildcard,
        "sightings": ordered_sightings,
        "links": links,
        "rejectedLinks": rejected_links,
        "requiresOperatorReview": True,
    }
