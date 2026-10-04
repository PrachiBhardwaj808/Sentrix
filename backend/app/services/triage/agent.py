"""Deterministic incident triage; no criminal-intent or demographic inference."""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Iterable, Mapping

from ..inference.schema import DetectionEvent, IncidentEnvelope, utc_now


class IncidentTriageAgent:
    """Fuse nearby observations into reviewable incidents.

    This is intentionally a rules-based agent. A future language model can
    produce a clearer explanation, but the severity and lifecycle remain
    explicit and auditable in code.
    """

    def __init__(self, window_seconds: int = 10, max_memory: int = 500) -> None:
        self.window_seconds = max(1, int(window_seconds))
        self.max_memory = max(20, int(max_memory))
        self._recent: OrderedDict[str, datetime] = OrderedDict()

    def triage(
        self,
        camera_id: str,
        events: Iterable[Mapping[str, Any] | DetectionEvent],
        *,
        location: Mapping[str, Any] | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        current = now or datetime.now(timezone.utc)
        normalized = [event if isinstance(event, DetectionEvent) else DetectionEvent.from_mapping(event) for event in events]
        if not normalized:
            return None
        unique = self._deduplicate(normalized, current)
        if not unique:
            return None
        severity = self._severity(unique)
        incident_id = "INC-" + sha256(f"{camera_id}:{current.isoformat()}:{len(unique)}".encode()).hexdigest()[:12].upper()
        explanation = "; ".join(self._explanation(event) for event in unique)
        envelope = IncidentEnvelope(
            incident_id=incident_id,
            camera_id=camera_id,
            timestamp=current.isoformat(),
            severity=severity,
            status="new",
            events=tuple(event.as_dict() for event in unique),
            explanation=explanation,
        ).as_dict()
        if location:
            envelope["location"] = dict(location)
        return envelope

    def _deduplicate(self, events: list[DetectionEvent], now: datetime) -> list[DetectionEvent]:
        unique: list[DetectionEvent] = []
        for event in events:
            key = f"{event.camera_id}:{event.type}:{event.track_id or ''}:{event.extra.get('plate_number', '')}"
            previous = self._recent.get(key)
            if previous and (now - previous).total_seconds() < self.window_seconds:
                continue
            self._recent[key] = now
            self._recent.move_to_end(key)
            unique.append(event)
        while len(self._recent) > self.max_memory:
            self._recent.popitem(last=False)
        return unique

    @staticmethod
    def _severity(events: list[DetectionEvent]) -> str:
        types = {event.type for event in events}
        if "weapon_object" in types and "intrusion" in types:
            return "critical"
        if "weapon_object" in types or "intrusion" in types or "movement" in types:
            return "high"
        if "plate" in types or "face" in types:
            return "medium"
        return "low"

    @staticmethod
    def _explanation(event: DetectionEvent) -> str:
        labels = {
            "weapon_object": "Potential weapon/object detected",
            "intrusion": "Possible boundary violation",
            "movement": "Unusual movement pattern",
            "face": "Potential face match or unknown face detected",
            "plate": "Vehicle plate observation recorded",
            "person": "Person detected",
            "vehicle": "Vehicle detected",
        }
        return f"{labels.get(event.type, 'Model observation')} ({event.confidence:.0%} confidence)"
