import unittest
from unittest.mock import MagicMock, patch
import requests

from backend.app.services.notifications.exotel import (
    ExotelConfig,
    ExotelConfigurationError,
    ExotelDeliveryError,
    ExotelTimeoutError,
    get_status,
    send_sms,
)


class ExotelNotificationTests(unittest.TestCase):
    """Test the hardened Exotel SMS adapter with connection timeouts and mock fallbacks."""

    def test_status_when_unconfigured(self) -> None:
        status = get_status({})
        self.assertFalse(status["configured"])
        self.assertEqual(status["provider"], "exotel")

    def test_status_when_configured(self) -> None:
        env = {
            "EXOTEL_API_KEY": "test_key",
            "EXOTEL_API_TOKEN": "test_token",
            "EXOTEL_ACCOUNT_SID": "test_sid",
            "EXOTEL_SENDER_ID": "SENTRX",
            "EXOTEL_REGION": "mumbai",
            "EXOTEL_CONNECT_TIMEOUT_SECONDS": "4",
            "EXOTEL_READ_TIMEOUT_SECONDS": "8",
        }
        status = get_status(env)
        self.assertTrue(status["configured"])
        self.assertEqual(status["senderId"], "SENTRX")
        self.assertEqual(status["timeouts"]["connectSeconds"], 4.0)
        self.assertEqual(status["timeouts"]["readSeconds"], 8.0)

    def test_send_sms_raises_when_unconfigured_without_mock_fallback(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(ExotelConfigurationError):
                send_sms("+919876543210", "Test alert", allow_mock_fallback=False)

    def test_send_sms_unconfigured_with_mock_fallback(self) -> None:
        with patch.dict("os.environ", {"EXOTEL_MOCK_FALLBACK": "true"}, clear=True):
            result = send_sms("+919876543210", "Test emergency alert")
            self.assertEqual(result["status"], "mock_delivered")
            self.assertTrue(result["mock"])
            self.assertIn("MOCK-UNCONF-", result["providerMessageId"])

    def test_send_sms_rejects_invalid_phone_or_empty_body(self) -> None:
        env = {
            "EXOTEL_API_KEY": "k",
            "EXOTEL_API_TOKEN": "t",
            "EXOTEL_ACCOUNT_SID": "s",
            "EXOTEL_SENDER_ID": "SENTRX",
        }
        with patch.dict("os.environ", env):
            with self.assertRaises(ExotelDeliveryError):
                send_sms("123", "Valid body")
            with self.assertRaises(ExotelDeliveryError):
                send_sms("+919876543210", "   ")

    @patch("backend.app.services.notifications.exotel.requests.post")
    def test_send_sms_success_parses_json_and_xml_sid(self, mock_post: MagicMock) -> None:
        env = {
            "EXOTEL_API_KEY": "test_key",
            "EXOTEL_API_TOKEN": "test_token",
            "EXOTEL_ACCOUNT_SID": "test_sid",
            "EXOTEL_SENDER_ID": "SENTRX",
        }
        with patch.dict("os.environ", env):
            # 1. JSON response format
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"SMSMessage": {"Sid": "SM-JSON-999"}}
            mock_resp.text = '{"SMSMessage": {"Sid": "SM-JSON-999"}}'
            mock_post.return_value = mock_resp

            result = send_sms("+919876543210", "Sentrix dispatch OTP: 123456")
            self.assertEqual(result["status"], "sent")
            self.assertEqual(result["providerMessageId"], "SM-JSON-999")
            self.assertFalse(result["mock"])

            # 2. XML response format
            mock_resp.json.side_effect = ValueError("Not JSON")
            mock_resp.text = "<TwilioResponse><SMSMessage><Sid>SM-XML-888</Sid></SMSMessage></TwilioResponse>"
            result_xml = send_sms("+919876543210", "Sentrix dispatch OTP: 123456")
            self.assertEqual(result_xml["status"], "sent")
            self.assertEqual(result_xml["providerMessageId"], "SM-XML-888")

    @patch("backend.app.services.notifications.exotel.requests.post")
    def test_connect_timeout_raises_without_mock_and_succeeds_with_mock(self, mock_post: MagicMock) -> None:
        mock_post.side_effect = requests.exceptions.ConnectTimeout("Handshake timeout")
        env = {
            "EXOTEL_API_KEY": "key",
            "EXOTEL_API_TOKEN": "token",
            "EXOTEL_ACCOUNT_SID": "sid",
            "EXOTEL_SENDER_ID": "SENTRX",
        }
        with patch.dict("os.environ", env):
            # Without mock fallback -> raises ExotelTimeoutError
            with self.assertRaises(ExotelTimeoutError):
                send_sms("+919876543210", "Alert body", allow_mock_fallback=False)

            # With mock fallback -> returns mock_delivered
            fallback = send_sms("+919876543210", "Alert body", allow_mock_fallback=True)
            self.assertEqual(fallback["status"], "mock_delivered")
            self.assertTrue(fallback["mock"])
            self.assertIn("MOCK-CONNECTTIMEOUT-", fallback["providerMessageId"])

    @patch("backend.app.services.notifications.exotel.requests.post")
    def test_read_timeout_and_ssl_error_fallbacks(self, mock_post: MagicMock) -> None:
        env = {
            "EXOTEL_API_KEY": "key",
            "EXOTEL_API_TOKEN": "token",
            "EXOTEL_ACCOUNT_SID": "sid",
            "EXOTEL_SENDER_ID": "SENTRX",
        }
        with patch.dict("os.environ", env):
            mock_post.side_effect = requests.exceptions.ReadTimeout("Server didn't respond")
            fallback_read = send_sms("+919876543210", "Alert", allow_mock_fallback=True)
            self.assertEqual(fallback_read["status"], "mock_delivered")
            self.assertIn("MOCK-READTIMEOUT-", fallback_read["providerMessageId"])

            mock_post.side_effect = requests.exceptions.SSLError("Certificate invalid")
            fallback_ssl = send_sms("+919876543210", "Alert", allow_mock_fallback=True)
            self.assertEqual(fallback_ssl["status"], "mock_delivered")
            self.assertIn("MOCK-SSLERROR-", fallback_ssl["providerMessageId"])

    @patch("backend.app.services.notifications.exotel.requests.post")
    def test_http_rejection_error_handling(self, mock_post: MagicMock) -> None:
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.text = "Account suspended"
        mock_post.return_value = mock_resp
        mock_post.side_effect = None

        env = {
            "EXOTEL_API_KEY": "key",
            "EXOTEL_API_TOKEN": "token",
            "EXOTEL_ACCOUNT_SID": "sid",
            "EXOTEL_SENDER_ID": "SENTRX",
        }
        with patch.dict("os.environ", env):
            with self.assertRaises(ExotelDeliveryError):
                send_sms("+919876543210", "Alert", allow_mock_fallback=False)

            fallback = send_sms("+919876543210", "Alert", allow_mock_fallback=True)
            self.assertEqual(fallback["status"], "mock_delivered")
            self.assertTrue(fallback["mock"])
            self.assertIn("MOCK-HTTP_403-", fallback["providerMessageId"])
