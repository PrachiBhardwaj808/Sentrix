from __future__ import annotations

import os
import re
import urllib.parse
from typing import Any, Mapping
import requests

from .connection import is_private_or_local_ip


class CameraRelayError(RuntimeError):
    """Raised when camera stream URL construction or relay registration fails."""


def get_relay_config() -> dict[str, Any]:
    """Load media relay configuration from environment."""
    base_url = os.getenv("MEDIA_RELAY_BASE_URL", "http://127.0.0.1:8888").rstrip("/")
    webrtc_url = os.getenv("MEDIA_RELAY_WEBRTC_URL", "http://127.0.0.1:8889").rstrip("/")
    api_url = os.getenv("MEDIA_RELAY_API_URL", "http://127.0.0.1:9997").rstrip("/")
    enabled = os.getenv("MEDIA_RELAY_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
    return {
        "enabled": enabled,
        "base_url": base_url,
        "webrtc_url": webrtc_url,
        "api_url": api_url,
    }


def sanitize_path_name(camera_id: str) -> str:
    """Normalize a camera ID into a valid MediaMTX path name."""
    clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(camera_id or "").strip())
    return clean or "camera_default"


def build_rtsp_url(camera: Mapping[str, Any]) -> str:
    """Build a valid RTSP URL from camera record fields, validating private IP."""
    # 1. Check if an explicit rtspUrl is already provided
    explicit_url = str(camera.get("rtspUrl") or "").strip()
    if explicit_url.startswith("rtsp://") or explicit_url.startswith("rtsps://"):
        # Parse to validate host and escape credentials if needed
        parsed = urllib.parse.urlparse(explicit_url)
        host = parsed.hostname or ""
        if not is_private_or_local_ip(host):
            raise CameraRelayError(f"Camera host '{host}' is not a permitted private or local network address.")

        username = parsed.username or ""
        password = parsed.password or ""
        port = parsed.port or 554
        path = parsed.path or ""
        if parsed.query:
            path = f"{path}?{parsed.query}"

        auth_part = ""
        if username:
            quoted_user = urllib.parse.quote(username, safe="")
            quoted_pass = urllib.parse.quote(password, safe="") if password else ""
            auth_part = f"{quoted_user}:{quoted_pass}@" if quoted_pass else f"{quoted_user}@"

        scheme = parsed.scheme or "rtsp"
        return f"{scheme}://{auth_part}{host}:{port}{path}"

    # 2. Build from structured connection fields
    host = str(camera.get("ipAddress") or camera.get("hostname") or "").strip()
    if not host:
        raise CameraRelayError("Camera requires an ipAddress or hostname to stream.")

    if not is_private_or_local_ip(host):
        raise CameraRelayError(f"Camera host '{host}' is not a permitted private or local network address.")

    username = str(camera.get("rtspUsername") or "").strip()
    password = str(camera.get("rtspPassword") or "")
    port = int(camera.get("rtspPort") or 554)
    channel = str(camera.get("rtspChannel") or "1").strip()
    profile = str(camera.get("streamProfile") or "0").strip()

    auth_part = ""
    if username:
        quoted_user = urllib.parse.quote(username, safe="")
        quoted_pass = urllib.parse.quote(password, safe="") if password else ""
        auth_part = f"{quoted_user}:{quoted_pass}@" if quoted_pass else f"{quoted_user}@"

    # Construct standard camera path
    if profile.startswith("/"):
        path = profile
    elif "channel=" in profile:
        path = f"/cam/realmonitor?{profile}"
    else:
        # Default Dahua/CP Plus/Hikvision realmonitor path
        path = f"/cam/realmonitor?channel={channel}&subtype={profile}"

    return f"rtsp://{auth_part}{host}:{port}{path}"


def register_camera_relay(camera: Mapping[str, Any]) -> dict[str, Any]:
    """Register or update a camera's RTSP stream path in the MediaMTX relay."""
    config = get_relay_config()
    camera_id = str(camera.get("id") or "camera")
    path_name = sanitize_path_name(camera_id)

    if not config["enabled"]:
        return {
            "cameraId": camera_id,
            "pathName": path_name,
            "relayAvailable": False,
            "message": "Media relay service is disabled by configuration.",
        }

    rtsp_url = build_rtsp_url(camera)
    api_url = config["api_url"]
    path_payload = {
        "source": rtsp_url,
        "sourceOnDemand": True,
        "sourceProtocol": "tcp",
    }

    try:
        # Try adding the path first
        add_url = f"{api_url}/v3/config/paths/add/{path_name}"
        resp = requests.post(add_url, json=path_payload, timeout=3.0)
        if resp.status_code == 400 and "already exists" in resp.text.lower():
            # If path already exists, update it via patch
            patch_url = f"{api_url}/v3/config/paths/patch/{path_name}"
            patch_resp = requests.patch(patch_url, json=path_payload, timeout=3.0)
            patch_resp.raise_for_status()
        elif not resp.ok:
            resp.raise_for_status()
    except requests.RequestException as exc:
        return {
            "cameraId": camera_id,
            "pathName": path_name,
            "relayAvailable": False,
            "error": f"Could not reach MediaMTX API at {api_url}: {exc}",
            "hlsUrl": f"{config['base_url']}/{path_name}/index.m3u8?cookieCheck=1",
            "webrtcUrl": f"{config['webrtc_url']}/{path_name}/whep",
        }

    return {
        "cameraId": camera_id,
        "pathName": path_name,
        "relayAvailable": True,
        "hlsUrl": f"{config['base_url']}/{path_name}/index.m3u8?cookieCheck=1",
        "webrtcUrl": f"{config['webrtc_url']}/{path_name}/whep",
    }


def remove_camera_relay(camera_id: str) -> bool:
    """Remove a camera path from the MediaMTX relay."""
    config = get_relay_config()
    if not config["enabled"]:
        return False
    path_name = sanitize_path_name(camera_id)
    try:
        delete_url = f"{config['api_url']}/v3/config/paths/delete/{path_name}"
        resp = requests.delete(delete_url, timeout=2.0)
        return resp.ok
    except Exception:
        return False