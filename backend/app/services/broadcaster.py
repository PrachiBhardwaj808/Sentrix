import asyncio
from datetime import datetime, timezone
import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def broadcast_event(event_type: str, payload: dict[str, Any]) -> bool:
    """
    Broadcast an event to all connected operator consoles on the 'alerts' channel layer group.
    Safely dispatches whether called from synchronous Django view threads, background workers,
    or active asyncio event loops.
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            return False

        message = {
            "event": event_type,
            "payload": payload,
            "timestamp": _now_iso(),
        }

        group_message = {
            "type": "event_message",
            "message": message,
        }

        # Detect if we are already in an active asyncio event loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            asyncio.create_task(channel_layer.group_send("alerts", group_message))
        else:
            async_to_sync(channel_layer.group_send)("alerts", group_message)

        return True
    except Exception as exc:
        logger.debug("WebSocket broadcast skipped or failed for '%s': %s", event_type, exc)
        return False


def broadcast_alert_created(alert: dict[str, Any]) -> bool:
    """Notify all connected consoles that a new incident alert was created."""
    return broadcast_event("alert.created", alert)


def broadcast_alert_updated(alert: dict[str, Any], action: str | None = None) -> bool:
    """Notify all connected consoles of an alert status transition (acknowledged, escalated, resolved)."""
    payload = dict(alert)
    if action:
        payload["action"] = action
    return broadcast_event("alert.updated", payload)


def broadcast_camera_updated(camera: dict[str, Any]) -> bool:
    """Notify all connected consoles of a camera status toggle, sensitivity update, or zone commitment."""
    return broadcast_event("camera.updated", camera)


def broadcast_dispatch_event(
    alert: dict[str, Any],
    guard: dict[str, Any] | None = None,
    activity: dict[str, Any] | None = None,
) -> bool:
    """Notify all connected consoles that a quick response team / guard was dispatched."""
    payload: dict[str, Any] = {"alert": alert}
    if guard:
        payload["guard"] = guard
    if activity:
        payload["activity"] = activity
    return broadcast_event("dispatch.created", payload)


def broadcast_dispatch_verified(alert: dict[str, Any]) -> bool:
    """Notify all connected consoles that a dispatched guard's OTP was verified."""
    return broadcast_event("dispatch.verified", {"alert": alert})


def broadcast_system_updated(system_data: dict[str, Any]) -> bool:
    """Notify all connected consoles of a system-level DEFCON or lockdown state change."""
    return broadcast_event("system.updated", system_data)


def broadcast_activity_created(activity: dict[str, Any]) -> bool:
    """Notify all connected consoles of a new audit or activity log entry."""
    return broadcast_event("activity.created", activity)
