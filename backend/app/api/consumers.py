from datetime import datetime, timezone
import logging
from typing import Any

from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AlertConsumer(AsyncJsonWebsocketConsumer):
    """
    Real-time WebSocket consumer for the Sentrix Operator Console.
    Subscribes connected clients to the 'alerts' channel layer group,
    forwarding live alerts, camera status changes, and dispatch events.
    """

    GROUP_NAME = "alerts"

    async def connect(self) -> None:
        self.group_name = self.GROUP_NAME

        # Add this consumer's channel to the alerts broadcast group
        if self.channel_layer:
            await self.channel_layer.group_add(self.group_name, self.channel_name)

        await self.accept()

        logger.info("Operator console connected to WebSocket alerts channel: %s", self.channel_name)

        # Send initial connection acknowledgment to client
        await self.send_json({
            "type": "connection.established",
            "channel": "alerts",
            "message": "Connected to Sentrix real-time alert and telemetry stream",
            "timestamp": _now_iso(),
        })

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, "group_name") and self.channel_layer:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("WebSocket alerts channel disconnected: %s (code: %s)", self.channel_name, close_code)

    async def receive_json(self, content: dict[str, Any], **kwargs: Any) -> None:
        """Handle incoming control messages from the client (e.g., ping/pong or filter requests)."""
        msg_type = content.get("type", "")

        if msg_type == "ping":
            await self.send_json({
                "type": "pong",
                "timestamp": _now_iso(),
            })
        elif msg_type == "subscribe":
            channels = content.get("channels") or ["alerts", "cameras", "dispatches", "system"]
            await self.send_json({
                "type": "subscription.ack",
                "channels": channels,
                "timestamp": _now_iso(),
            })
        else:
            # Echo generic acknowledgment
            await self.send_json({
                "type": "ack",
                "receivedType": msg_type,
                "timestamp": _now_iso(),
            })

    # Group message handlers (triggered by channel_layer.group_send)

    async def event_message(self, event: dict[str, Any]) -> None:
        """Standard envelope forwarding method."""
        message = event.get("message") or {}
        await self.send_json(message)

    async def alert_created(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "alert.created",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def alert_updated(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "alert.updated",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def camera_updated(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "camera.updated",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def dispatch_event(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "dispatch.created",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def dispatch_verified(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "dispatch.verified",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def system_updated(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "system.updated",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })

    async def activity_created(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "event": "activity.created",
            "payload": event.get("payload", {}),
            "timestamp": event.get("timestamp") or _now_iso(),
        })
