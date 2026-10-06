from __future__ import annotations

import unittest
from unittest.mock import patch

from django.test import RequestFactory

from backend.app.api.views import media_authorize


class MediaAuthorizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()

    def test_requires_media_session_cookie(self) -> None:
        response = media_authorize(self.factory.get(
            "/api/media/authorize",
            HTTP_X_FORWARDED_URI="/relay-media/CAM-01/index.m3u8",
        ))

        self.assertEqual(response.status_code, 401)

    def test_rejects_unknown_relay_path(self) -> None:
        request = self.factory.get(
            "/api/media/authorize",
            HTTP_COOKIE="sentrix_media_session=session-token",
            HTTP_X_FORWARDED_URI="/relay-media/NOT-REGISTERED/index.m3u8",
        )
        with patch("backend.app.api.views._session_from_request", return_value={"operatorId": "ADMIN-1"}):
            with patch("backend.app.api.views.repository.has_camera_path", return_value=False):
                response = media_authorize(request)

        self.assertEqual(response.status_code, 404)

    def test_allows_registered_camera_for_a_live_session(self) -> None:
        request = self.factory.get(
            "/api/media/authorize",
            HTTP_COOKIE="sentrix_media_session=session-token",
            HTTP_X_FORWARDED_URI="/relay-media/CAM-01/segment001.ts?token=ignored",
        )
        with patch("backend.app.api.views._session_from_request", return_value={"operatorId": "ADMIN-1"}):
            with patch("backend.app.api.views.repository.has_camera_path", return_value=True):
                response = media_authorize(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(request.META["HTTP_AUTHORIZATION"], "Bearer session-token")


if __name__ == "__main__":
    unittest.main()
