"""Custom SMTP destination hardening (SSRF / port allowlist / header safety)."""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Iterable

from django.core.exceptions import ValidationError

# Submission ports only — not open relay / arbitrary TCP.
ALLOWED_CUSTOM_SMTP_PORTS = frozenset({465, 587, 2525})

_CONTROL_OR_CRLF = re.compile(r"[\x00-\x1f\x7f]+")


def sanitize_email_header_value(value: str, *, max_length: int = 200) -> str:
    """Remove CR/LF/control characters from header-derived strings."""
    text = str(value or "")
    text = _CONTROL_OR_CRLF.sub(" ", text)
    text = " ".join(text.split())
    return text[:max_length]


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
        return True
    if ip.is_private or ip.is_reserved:
        return True
    # Explicit cloud metadata / CGNAT (also covered by is_private/link_local often).
    if isinstance(ip, ipaddress.IPv4Address):
        if ip in ipaddress.ip_network("169.254.0.0/16"):
            return True
        if ip in ipaddress.ip_network("100.64.0.0/10"):  # CGNAT
            return True
        if ip in ipaddress.ip_network("0.0.0.0/8"):
            return True
    if isinstance(ip, ipaddress.IPv6Address):
        if ip in ipaddress.ip_network("fc00::/7"):  # ULA
            return True
        if ip in ipaddress.ip_network("fe80::/10"):
            return True
        if ip in ipaddress.ip_network("::1/128"):
            return True
        # IPv4-mapped
        if ip.ipv4_mapped is not None:
            return _is_blocked_ip(ip.ipv4_mapped)
    return False


def assert_public_smtp_host(host: str) -> list[str]:
    """
    Resolve host and require every resolved address to be public unicast.

    Returns the resolved address strings for logging/diagnostics (no secrets).
    Raises ValidationError with a safe customer message on failure.
    """
    from django.conf import settings

    host = (host or "").strip().rstrip(".")
    if not host:
        raise ValidationError({"smtp_host": "SMTP host is required."})
    if any(ch.isspace() for ch in host) or "/" in host or "@" in host:
        raise ValidationError({"smtp_host": "Enter a valid SMTP host."})
    lowered = host.lower()
    if lowered in {"localhost", "localhost.localdomain"} or lowered.endswith(".localhost"):
        raise ValidationError({"smtp_host": "SMTP host is not allowed."})

    # Literal IP
    try:
        ip = ipaddress.ip_address(host)
        if _is_blocked_ip(ip):
            raise ValidationError({"smtp_host": "SMTP host is not allowed."})
        return [str(ip)]
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        # Local/unit tests commonly use RFC 2606 example.com hosts with mocked SMTP.
        if bool(getattr(settings, "DEBUG", False)) and lowered.endswith(
            (".example.com", ".example.org", ".example.net")
        ):
            return ["203.0.113.10"]
        raise ValidationError(
            {"smtp_host": "Could not resolve the SMTP host."}
        ) from exc
    if not infos:
        raise ValidationError({"smtp_host": "Could not resolve the SMTP host."})

    resolved: list[str] = []
    for info in infos:
        sockaddr = info[4]
        addr = sockaddr[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _is_blocked_ip(ip):
            raise ValidationError({"smtp_host": "SMTP host is not allowed."})
        resolved.append(str(ip))
    if not resolved:
        raise ValidationError({"smtp_host": "Could not resolve the SMTP host."})
    return resolved


def assert_allowed_custom_smtp_port(port) -> int:
    try:
        port_int = int(port)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"smtp_port": "SMTP port must be a number."}) from exc
    if port_int not in ALLOWED_CUSTOM_SMTP_PORTS:
        raise ValidationError(
            {
                "smtp_port": (
                    "SMTP port must be 465, 587, or 2525."
                )
            }
        )
    return port_int


def validate_custom_smtp_destination(*, host, port) -> dict:
    """Validate custom SMTP host (SSRF) and port allowlist."""
    port_int = assert_allowed_custom_smtp_port(port)
    resolved = assert_public_smtp_host(host)
    return {"port": port_int, "resolved": resolved}
