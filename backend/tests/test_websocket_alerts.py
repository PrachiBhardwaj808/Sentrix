import unittest
from channels.testing.websocket import WebsocketCommunicator

from backend.config.asgi import application
from backend.app.services.broadcaster import (
    broadcast_alert_created,
    broadcast_alert_updated,
    broadcast_camera_updated,
    broadcast_dispatch_event,
    broadcast_dispatch_verified,
    broadcast_system_updated,
    broadcast_activity_created,
)


class WebSocketAlertsTests(unittest.IsolatedAsyncioTestCase):
    """Test the real-time WebSocket consumer, routing, and event broadcasting."""

    async def test_websocket_connection_and_handshake(self) -> None:
        communicator = WebsocketCommunicator(application, "/ws/alerts/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected, "WebSocket connection to /ws/alerts/ should be accepted")

        greeting = await communicator.receive_json_from()
        self.assertEqual(greeting.get("type"), "connection.established")
        self.assertEqual(greeting.get("channel"), "alerts")
        self.assertIn("timestamp", greeting)

        # Test heartbeat ping/pong
        await communicator.send_json_to({"type": "ping"})
        pong = await communicator.receive_json_from()
        self.assertEqual(pong.get("type"), "pong")
        self.assertIn("timestamp", pong)

        # Test channel subscription
        await communicator.send_json_to({"type": "subscribe", "channels": ["alerts", "cameras"]})
        ack = await communicator.receive_json_from()
        self.assertEqual(ack.get("type"), "subscription.ack")
        self.assertEqual(ack.get("channels"), ["alerts", "cameras"])

        await communicator.disconnect()

    async def test_live_alert_and_telemetry_broadcasts(self) -> None:
        communicator = WebsocketCommunicator(application, "/ws/alerts/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_json_from()  # Consume initial greeting

        # 1. Alert created broadcast
        sample_alert = {
            "id": "ALT-WS-999",
            "eventType": "fence_breach",
            "level": "critical",
            "sector": "Sector Alpha-1",
            "confidence": 98.5,
        }
        broadcast_alert_created(sample_alert)
        alert_event = await communicator.receive_json_from()
        self.assertEqual(alert_event.get("event"), "alert.created")
        self.assertEqual(alert_event.get("payload", {}).get("id"), "ALT-WS-999")

        # 2. Alert updated broadcast
        updated_alert = {**sample_alert, "status": "acknowledged", "acknowledgedBy": "Commander Rao"}
        broadcast_alert_updated(updated_alert, action="acknowledge")
        update_event = await communicator.receive_json_from()
        self.assertEqual(update_event.get("event"), "alert.updated")
        self.assertEqual(update_event.get("payload", {}).get("status"), "acknowledged")
        self.assertEqual(update_event.get("payload", {}).get("action"), "acknowledge")

        # 3. Camera updated broadcast
        sample_camera = {
            "id": "CAM-01",
            "name": "North Gate Perimeter",
            "status": "online",
            "aiActive": True,
        }
        broadcast_camera_updated(sample_camera)
        cam_event = await communicator.receive_json_from()
        self.assertEqual(cam_event.get("event"), "camera.updated")
        self.assertEqual(cam_event.get("payload", {}).get("id"), "CAM-01")

        # 4. Dispatch event broadcast
        sample_guard = {"id": "G-101", "name": "Havildar Singh", "rank": "Head Constable"}
        broadcast_dispatch_event(sample_alert, guard=sample_guard)
        dispatch_event = await communicator.receive_json_from()
        self.assertEqual(dispatch_event.get("event"), "dispatch.created")
        self.assertEqual(dispatch_event.get("payload", {}).get("alert", {}).get("id"), "ALT-WS-999")
        self.assertEqual(dispatch_event.get("payload", {}).get("guard", {}).get("id"), "G-101")

        # 5. Dispatch verified broadcast
        broadcast_dispatch_verified(sample_alert)
        verified_event = await communicator.receive_json_from()
        self.assertEqual(verified_event.get("event"), "dispatch.verified")

        # 6. System updated broadcast (DEFCON / Lockdown)
        broadcast_system_updated({"defconLevel": 1, "lockdownActive": True})
        system_event = await communicator.receive_json_from()
        self.assertEqual(system_event.get("event"), "system.updated")
        self.assertEqual(system_event.get("payload", {}).get("defconLevel"), 1)
        self.assertTrue(system_event.get("payload", {}).get("lockdownActive"))

        # 7. Activity created broadcast
        sample_activity = {
            "id": "ACT-123",
            "actionType": "lockdown_initiated",
            "actorName": "System AI",
        }
        broadcast_activity_created(sample_activity)
        activity_event = await communicator.receive_json_from()
        self.assertEqual(activity_event.get("event"), "activity.created")
        self.assertEqual(activity_event.get("payload", {}).get("id"), "ACT-123")

        await communicator.disconnect()

    def test_sync_broadcasters_are_safe_without_active_clients(self) -> None:
        """Ensure synchronous views can safely call broadcasters even without clients or channel layers."""
        self.assertTrue(broadcast_alert_created({"id": "ALT-OFFLINE"}))
        self.assertTrue(broadcast_alert_updated({"id": "ALT-OFFLINE"}, action="resolve"))
        self.assertTrue(broadcast_camera_updated({"id": "CAM-OFFLINE", "status": "offline"}))
        self.assertTrue(broadcast_dispatch_event({"id": "ALT-OFFLINE"}))
        self.assertTrue(broadcast_dispatch_verified({"id": "ALT-OFFLINE"}))
        self.assertTrue(broadcast_system_updated({"defconLevel": 2, "lockdownActive": False}))
        self.assertTrue(broadcast_activity_created({"id": "ACT-OFFLINE"}))
