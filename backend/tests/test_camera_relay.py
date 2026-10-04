from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.app.services.cameras.connection import is_private_or_local_ip, test_camera_connection
from backend.app.services.cameras.relay import (
    CameraRelayError,
    build_rtsp_url,
    register_camera_relay,
    sanitize_path_name,
)


class CameraRelayTests(unittest.TestCase):
    def test_private_ip_validation(self) -> None:
        self.assertTrue(is_private_or_local_ip("192.168.1.250"))
        self.assertTrue(is_private_or_local_ip("10.30.4.53"))
        self.assertTrue(is_private_or_local_ip("172.16.10.1"))
        self.assertTrue(is_private_or_local_ip("127.0.0.1"))
        self.assertTrue(is_private_or_local_ip("localhost"))

        self.assertFalse(is_private_or_local_ip("8.8.8.8"))
        self.assertFalse(is_private_or_local_ip("1.1.1.1"))
        self.assertFalse(is_private_or_local_ip(""))

    def test_build_rtsp_url_structured_with_special_chars(self) -> None:
        camera = {
            "id": "CAM-TEST-01",
            "ipAddress": "192.168.1.250",
            "rtspPort": 554,
            "rtspUsername": "admin",
            "rtspPassword": "Admin@123",
            "rtspChannel": "1",
            "streamProfile": "0",
        }
        url = build_rtsp_url(camera)
        self.assertEqual(
            url,
            "rtsp://admin:Admin%40123@192.168.1.250:554/cam/realmonitor?channel=1&subtype=0",
        )

    def test_build_rtsp_url_rejects_public_ip(self) -> None:
        camera = {
            "id": "CAM-PUBLIC",
            "ipAddress": "8.8.8.8",
            "rtspPort": 554,
        }
        with self.assertRaises(CameraRelayError):
            build_rtsp_url(camera)

    def test_camera_test_connection_rejects_public_ip(self) -> None:
        res = test_camera_connection("8.8.8.8", 554)
        self.assertFalse(res["reachable"])
        self.assertEqual(res["code"], "PUBLIC_IP_FORBIDDEN")

    def test_sanitize_path_name(self) -> None:
        self.assertEqual(sanitize_path_name("CAM-ALPHA-01"), "CAM-ALPHA-01")
        self.assertEqual(sanitize_path_name("Camera #1 / Gate"), "Camera__1___Gate")

    @patch("backend.app.services.cameras.relay.requests.post")
    def test_register_camera_relay_success(self, mock_post: MagicMock) -> None:
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        camera = {
            "id": "CAM-ALPHA-01",
            "ipAddress": "192.168.1.250",
            "rtspPort": 554,
            "rtspUsername": "admin",
            "rtspPassword": "Admin@123",
        }
        result = register_camera_relay(camera)
        self.assertTrue(result["relayAvailable"])
        self.assertIn("/CAM-ALPHA-01/index.m3u8", result["hlsUrl"])
        self.assertIn("/CAM-ALPHA-01/whep", result["webrtcUrl"])
        # Ensure password is never exposed in relay output
        self.assertNotIn("Admin@123", str(result))
        self.assertNotIn("Admin%40123", str(result))