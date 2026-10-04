"""Explainable, camera-scoped rules built on normalized AI detections.

The rules intentionally describe observable events (crossing, dwell time,
movement, repeated plates, and crowd size). They do not infer intent or label
people as suspicious because of appearance or demographic characteristics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from math import hypot
from typing import Any, Iterable, Mapping, Sequence


def point_in_polygon(point: tuple[float, float], polygon: Sequence[Mapping[str, Any]]) -> bool:
    """Return whether an x/y point is inside a normalized percentage polygon."""

    if len(polygon) < 3:
        return False
    x, y = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        try:
            current_x = float(current.get("x", 0))
            current_y = float(current.get("y", 0))
            previous_x = float(previous.get("x", 0))
            previous_y = float(previous.get("y", 0))
        except (TypeError, ValueError):
            previous = current
            continue
        crosses = (current_y > y) != (previous_y > y)
        if crosses:
            intersection_x = (previous_x - current_x) * (y - current_y) / (previous_y - current_y) + current_x
            if x < intersection_x:
                inside = not inside
        previous = current
    return inside


def _center(box: Mapping[str, Any]) -> tuple[float, float]:
    return (
        float(box.get("x", 0)) + float(box.get("width", 0)) / 2,
        float(box.get("y", 0)) + float(box.get("height", 0)) / 2,
    )


def _timestamp(value: datetime | None) -> datetime:
    current = value or datetime.now(timezone.utc)
    return current if current.tzinfo else current.replace(tzinfo=timezone.utc)


def _in_schedule(value: datetime, schedule: Mapping[str, Any] | None) -> bool:
    if not schedule:
        return False
    try:
        start = time.fromisoformat(str(schedule.get("start", "18:00")))
        end = time.fromisoformat(str(schedule.get("end", "06:00")))
    except ValueError:
        return False
    current = value.timetz().replace(tzinfo=None)
    return current >= start or current < end if start > end else start <= current < end


@dataclass
class TrackMemory:
    inside: bool
    first_seen: datetime
    last_seen: datetime
    position: tuple[float, float]


class CameraRuleEngine:
    """Evaluate detections with independent state for every camera."""

    def __init__(self, cooldown_seconds: int = 30) -> None:
        self.cooldown_seconds = max(1, int(cooldown_seconds))
        self._tracks: dict[str, dict[str, TrackMemory]] = {}
        self._last_event: dict[tuple[str, str, str], datetime] = {}
        self._plate_counts: dict[tuple[str, str], list[datetime]] = {}

    def evaluate(
        self,
        camera: Mapping[str, Any],
        detections: Iterable[Mapping[str, Any]],
        *,
        now: datetime | None = None,
        brightness: float | None = None,
    ) -> list[dict[str, Any]]:
        current = _timestamp(now)
        camera_id = str(camera.get("id") or "unknown-camera")
        sector = str(camera.get("sector") or "Unassigned")
        polygon = camera.get("zonePolygon") or []
        camera_tracks = self._tracks.setdefault(camera_id, {})
        events: list[dict[str, Any]] = []
        current_people = 0

        for index, detection in enumerate(detections):
            label = str(detection.get("label") or "unknown").lower()
            is_face_detection = label == "face" or str(detection.get("source") or "").lower() == "face_detection"
            if label == "person":
                current_people += 1
            box = detection.get("box") or {}
            position = _center(box)
            track_id = str(detection.get("trackId") or f"anonymous-{label}-{index}")
            stable_track = bool(detection.get("trackId"))
            inside = point_in_polygon(position, polygon)
            memory = camera_tracks.get(track_id)
            if memory is None:
                memory = TrackMemory(inside, current, current, position)
                camera_tracks[track_id] = memory
                was_inside = False
            else:
                was_inside = memory.inside
                if inside and not was_inside:
                    memory.first_seen = current
                memory.inside = inside
                memory.last_seen = current
                memory.position = position

            if is_face_detection:
                event = self._event(
                    camera_id,
                    sector,
                    detection,
                    "unidentified_face_review",
                    "Unidentified face detected — operator review required",
                    "review",
                    current,
                    "medium",
                )
                if event:
                    event["identityStatus"] = "unidentified"
                    event["requiresOperatorReview"] = True
                    events.append(event)

            if stable_track and inside and not was_inside:
                event = self._event(camera_id, sector, detection, "virtual_fence_intrusion", "Virtual fence entry", "entry", current, "high")
                if event:
                    events.append(event)
            if stable_track and was_inside and not inside and camera.get("fenceExitAlerts"):
                event = self._event(camera_id, sector, detection, "virtual_fence_exit", "Virtual fence exit", "exit", current, "medium")
                if event:
                    events.append(event)
            dwell_seconds = max(1, int(camera.get("dwellTimeSeconds") or 30))
            if stable_track and inside and (current - memory.first_seen).total_seconds() >= dwell_seconds:
                event = self._event(camera_id, sector, detection, "loitering", f"Object remained inside the fence for {dwell_seconds} seconds", "dwell", current, "medium")
                if event:
                    events.append(event)

            night_by_brightness = brightness is not None and float(brightness) < float(camera.get("nightBrightnessThreshold") or 65)
            night_by_schedule = _in_schedule(current, camera.get("nightSchedule"))
            if (night_by_brightness or night_by_schedule) and label in {"person", "vehicle", "car", "motorcycle", "truck", "bus"}:
                event = self._event(camera_id, sector, detection, "night_movement", "Movement detected during configured night conditions", "night", current, "high")
                if event:
                    event["nightModeSource"] = "brightness" if night_by_brightness else "schedule"
                    events.append(event)

            plate = str((detection.get("attributes") or {}).get("plate_number") or "").strip().upper()
            if plate:
                key = (camera_id, plate)
                timestamps = [stamp for stamp in self._plate_counts.get(key, []) if (current - stamp).total_seconds() <= 300]
                timestamps.append(current)
                self._plate_counts[key] = timestamps
                threshold = max(2, int(camera.get("repeatedPlateThreshold") or 3))
                if len(timestamps) >= threshold:
                    event = self._event(camera_id, sector, detection, "repeated_plate", f"Plate observed {len(timestamps)} times in five minutes", "repeat", current, "medium")
                    if event:
                        event["plateNumber"] = plate
                        events.append(event)

        crowd_threshold = max(2, int(camera.get("crowdThreshold") or 6))
        if current_people >= crowd_threshold:
            event = self._event(camera_id, sector, {"label": "person", "confidence": 1.0, "trackId": "crowd"}, "crowd_formation", f"{current_people} people detected in one frame", "crowd", current, "medium")
            if event:
                event["count"] = current_people
                events.append(event)
        return events

    def _event(
        self,
        camera_id: str,
        sector: str,
        detection: Mapping[str, Any],
        rule: str,
        reason: str,
        direction: str,
        timestamp: datetime,
        severity: str,
    ) -> dict[str, Any] | None:
        track_id = str(detection.get("trackId") or "anonymous")
        key = (camera_id, rule, track_id)
        previous = self._last_event.get(key)
        if previous and (timestamp - previous).total_seconds() < self.cooldown_seconds:
            return None
        self._last_event[key] = timestamp
        return {
            "cameraId": camera_id,
            "sector": sector,
            "rule": rule,
            "reason": reason,
            "eventType": reason,
            "severity": severity,
            "direction": direction,
            "trackId": detection.get("trackId"),
            "objectClass": "Person" if (
                str(detection.get("label", "")).lower() in {"person", "face"}
                or str(detection.get("source", "")).lower() == "face_detection"
            ) else "Vehicle",
            "confidence": round(float(detection.get("confidence") or 0), 4),
            "timestamp": timestamp.isoformat(),
        }
