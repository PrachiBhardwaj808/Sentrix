"""Network-level camera URL validation and connectivity diagnostics."""


from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse


SUPPORTED_SCHEMES = {"rtsp", "rtsps", "http", "https"}


@dataclass(frozen=True)
class CameraConnectionResult:
    reachable: bool
    protocol: str
    host: str | None
    port: int | None
    code: str
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "reachable": self.reachable,
            "protocol": self.protocol,
            "host": self.host,
            "port": self.port,
            "code": self.code,
            "message": self.message,
        }


def test_camera_url(url: str, timeout_seconds: float = 3.0) -> CameraConnectionResult:
    """Test a private-LAN camera endpoint without exposing credentials in errors."""

    raw_url = str(url or "").strip()
    parsed = urlparse(raw_url)
    protocol = parsed.scheme.lower()
    if protocol not in SUPPORTED_SCHEMES:
        return CameraConnectionResult(False, protocol or "unknown", None, None, "unsupported_protocol", "Use RTSP, RTSPS, HTTP, or HTTPS.")
    if not parsed.hostname:
        return CameraConnectionResult(False, protocol, None, None, "invalid_url", "The camera URL must include a host or IP address.")
    try:
        host = parsed.hostname
        ip = ipaddress.ip_address(host)
        if not (ip.is_private or ip.is_loopback or ip.is_link_local):
            return CameraConnectionResult(False, protocol, host, None, "public_host_blocked", "Camera testing is restricted to private or local network addresses.")
    except ValueError:
        return CameraConnectionResult(False, protocol, parsed.hostname, None, "hostname_requires_dns_policy", "Use a private IP address for local camera testing.")

    try:
        port = parsed.port or (554 if protocol in {"rtsp", "rtsps"} else 80 if protocol == "http" else 443)
    except ValueError:
        return CameraConnectionResult(False, protocol, parsed.hostname, None, "invalid_port", "The camera port is invalid.")
    timeout = max(0.5, min(float(timeout_seconds), 10.0))
    try:
        with socket.create_connection((parsed.hostname, port), timeout=timeout):
            return CameraConnectionResult(True, protocol, parsed.hostname, port, "reachable", "The camera host accepted a TCP connection.")
    except socket.timeout:
        return CameraConnectionResult(False, protocol, parsed.hostname, port, "timeout", "The camera did not respond before the timeout. Check the IP, subnet, firewall, and cable.")
    except ConnectionRefusedError:
        return CameraConnectionResult(False, protocol, parsed.hostname, port, "connection_refused", "The host is reachable but this port is closed or RTSP is disabled.")
    except OSError as exc:
        message = str(exc).lower()
        code = "host_unreachable" if "unreachable" in message or "timed out" in message else "connection_failed"
        return CameraConnectionResult(False, protocol, parsed.hostname, port, code, "The camera could not be reached. Check the current IP, LAN/VLAN, and device power.")

from typing import Any, Mapping

PRIVATE_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)


def is_private_or_local_ip(host: str) -> bool:
    """Return True only if host resolves to an RFC 1918, link-local, or loopback IP."""
    raw = (host or "").strip().lower()
    if not raw:
        return False
    if raw in {"localhost", "127.0.0.1", "::1"}:
        return True

    # Try direct IP parsing first
    try:
        ip = ipaddress.ip_address(raw)
        return any(ip in net for net in PRIVATE_NETWORKS)
    except ValueError:
        pass

    # Resolve hostname
    try:
        resolved = socket.gethostbyname(raw)
        ip = ipaddress.ip_address(resolved)
        return any(ip in net for net in PRIVATE_NETWORKS)
    except Exception:
        return False


def test_camera_connection(host: str, port: int = 554, timeout: float = 3.0) -> dict[str, Any]:
    """Test TCP connectivity to a camera node, strictly verifying private IP."""
    raw_host = (host or "").strip()
    if not raw_host:
        return {
            "reachable": False,
            "code": "MISSING_HOST",
            "message": "Camera host or IP address is required.",
        }

    if not is_private_or_local_ip(raw_host):
        return {
            "reachable": False,
            "code": "PUBLIC_IP_FORBIDDEN",
            "message": f"'{raw_host}' is not a permitted private or local network address.",
        }

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((raw_host, int(port)))
        sock.close()
        if result == 0:
            return {
                "reachable": True,
                "code": "OK",
                "message": f"Successfully connected to camera at {raw_host}:{port}.",
                "host": raw_host,
                "port": port,
            }
        return {
            "reachable": False,
            "code": "PORT_UNREACHABLE",
            "message": f"Port {port} on {raw_host} is not accepting connections (code {result}).",
            "host": raw_host,
            "port": port,
        }
    except Exception as exc:
        return {
            "reachable": False,
            "code": "CONNECTION_ERROR",
            "message": f"Could not reach {raw_host}:{port}: {exc}",
            "host": raw_host,
            "port": port,
        }
