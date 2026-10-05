"""Optional Firebase Cloud Messaging adapter for alert notifications."""

from __future__ import annotations

import os
from typing import Any, Mapping


def get_status() -> dict[str, Any]:
    topic = os.getenv("FCM_ALERT_TOPIC", "").strip()
    enabled = os.getenv("FCM_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
    return {
        "enabled": enabled,
        "configured": bool(enabled and topic),
        "topic": topic or None,
        "message": "FCM topic notifications are ready." if enabled and topic else "FCM notifications are disabled or no topic is configured.",
    }


def send_alert_notification(alert: Mapping[str, Any]) -> dict[str, Any]:
    status = get_status()
    if not status["configured"]:
        return {**status, "status": "disabled", "messageId": None}
    try:
        from firebase_admin import messaging
    except ImportError as exc:  # pragma: no cover - deployment dependency
        raise RuntimeError("firebase-admin is required for FCM notifications") from exc

    message = messaging.Message(
        topic=str(status["topic"]),
        notification=messaging.Notification(
            title=f"Sentrix {str(alert.get('level') or 'normal').upper()} alert",
            body=str(alert.get("eventType") or "New surveillance incident")[:240],
        ),
        data={
            "alertId": str(alert.get("id") or ""),
            "severity": str(alert.get("level") or "normal"),
            "cameraId": str(alert.get("sourceCameraId") or ""),
        },
    )
    message_id = messaging.send(message)
    return {**status, "status": "sent", "messageId": message_id}
