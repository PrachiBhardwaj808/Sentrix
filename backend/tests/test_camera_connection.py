"""No-network tests for camera URL validation and socket diagnostics."""

from __future__ import annotations

import socket
import unittest
from unittest.mock import patch

from backend.app.services.cameras.connection import test_camera_url


class CameraConnectionTests(unittest.TestCase):
    def test_raw_rtsp_url_uses_default_camera_port(self) -> None:
        with patch("socket.create_connection") as connect:
            result = test_camera_url("rtsp://admin:secret@192.168.1.250/cam/realmonitor")

        connect.assert_called_once_with(("192.168.1.250", 554), timeout=3.0)
        self.assertTrue(result.reachable)
        self.assertEqual(result.protocol, "rtsp")

    def test_public_ip_is_blocked(self) -> None:
        result = test_camera_url("rtsp://8.8.8.8:554/camera")

        self.assertFalse(result.reachable)
        self.assertEqual(result.code, "public_host_blocked")

    def test_refused_port_has_actionable_message(self) -> None:
        with patch("socket.create_connection", side_effect=ConnectionRefusedError):
            result = test_camera_url("rtsp://192.168.1.250:554/camera")

        self.assertFalse(result.reachable)
        self.assertEqual(result.code, "connection_refused")

    def test_timeout_has_network_message(self) -> None:
        with patch("socket.create_connection", side_effect=socket.timeout):
            result = test_camera_url("http://192.168.1.250:8080/video")

        self.assertFalse(result.reachable)
        self.assertEqual(result.code, "timeout")


if __name__ == "__main__":
    unittest.main()
