"""
Tests für den SSRF-Schutz im URL-Import-Service.

Deckt insbesondere den IPv4-mapped-IPv6-Bypass ab: ein Angreifer, der die DNS-
Zone der Import-URL kontrolliert, könnte einen AAAA-Eintrag wie
"::ffff:169.254.169.254" veröffentlichen. `ipaddress`-Netzwerk-Prüfungen über
unterschiedliche IP-Versionen liefern stillschweigend False (keine Exception),
daher würde ohne Entpacken der eingebetteten IPv4-Adresse die
Cloud-Metadata-Adresse (oder Loopback/private Netze) die reinen IPv4-Einträge
in _BLOCKED_NETWORKS umgehen.
"""

import socket
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.url_import_service import _is_safe_url, _SafeTransport, _validate_all_ips


def _fake_getaddrinfo(addresses: list[tuple[int, str]]):
    """Baut ein getaddrinfo-Ergebnis aus (family, ip)-Paaren."""

    def _impl(host, port, family=0, type=0, *args, **kwargs):
        return [
            (fam, socket.SOCK_STREAM, 6, "", (ip, 0) if fam == socket.AF_INET else (ip, 0, 0, 0))
            for fam, ip in addresses
        ]

    return _impl


class TestIpv4MappedBypass:
    @pytest.mark.asyncio
    async def test_ipv4_mapped_metadata_address_is_blocked(self):
        """::ffff:169.254.169.254 (AWS/GCP metadata) muss blockiert werden."""
        fake = _fake_getaddrinfo([(socket.AF_INET6, "::ffff:169.254.169.254")])
        with patch("socket.getaddrinfo", fake):
            with pytest.raises(ValueError, match="privates/internes Netz"):
                await _validate_all_ips("angreifer.example")

    @pytest.mark.asyncio
    async def test_ipv4_mapped_loopback_is_blocked(self):
        fake = _fake_getaddrinfo([(socket.AF_INET6, "::ffff:127.0.0.1")])
        with patch("socket.getaddrinfo", fake):
            with pytest.raises(ValueError, match="privates/internes Netz"):
                await _validate_all_ips("angreifer.example")

    @pytest.mark.asyncio
    async def test_ipv4_mapped_private_range_is_blocked(self):
        fake = _fake_getaddrinfo([(socket.AF_INET6, "::ffff:10.0.0.5")])
        with patch("socket.getaddrinfo", fake):
            with pytest.raises(ValueError, match="privates/internes Netz"):
                await _validate_all_ips("angreifer.example")

    @pytest.mark.asyncio
    async def test_public_ipv6_still_allowed(self):
        """Normale öffentliche IPv6-Adressen dürfen nicht fälschlich blockiert werden."""
        fake = _fake_getaddrinfo([(socket.AF_INET6, "2001:4860:4860::8888")])
        with patch("socket.getaddrinfo", fake):
            await _validate_all_ips("public.example")  # wirft nicht

    @pytest.mark.asyncio
    async def test_public_ipv4_still_allowed(self):
        fake = _fake_getaddrinfo([(socket.AF_INET, "8.8.8.8")])
        with patch("socket.getaddrinfo", fake):
            await _validate_all_ips("public.example")  # wirft nicht

    @pytest.mark.asyncio
    async def test_is_safe_url_rejects_ipv4_mapped_metadata_host(self):
        fake = _fake_getaddrinfo([(socket.AF_INET6, "::ffff:169.254.169.254")])
        with patch("socket.getaddrinfo", fake):
            assert await _is_safe_url("http://angreifer.example/recipe") is False


class TestSafeTransportPinning:
    """
    _SafeTransport must connect to the address it validated, not merely
    validate-then-delegate. Delegating to httpx's default connect path lets
    httpcore perform its own, independent DNS resolution for the real TCP
    connection -- a second lookup a DNS-rebinding attacker (TTL=0, answers
    the validation lookup with a public IP and the connect lookup with an
    internal one) can answer differently from the first. Pinning the
    connection to the already-validated address closes that window.
    """

    @pytest.mark.asyncio
    async def test_connects_to_validated_ip_not_hostname(self):
        fake = _fake_getaddrinfo([(socket.AF_INET, "93.184.216.34")])  # public, arbitrary
        captured: dict = {}

        async def fake_super_handle(self, request):
            captured["request"] = request
            return httpx.Response(200, request=request)

        with (
            patch("socket.getaddrinfo", fake),
            patch(
                "httpx.AsyncHTTPTransport.handle_async_request",
                new=fake_super_handle,
            ),
        ):
            transport = _SafeTransport()
            request = httpx.Request("GET", "https://angreifer.example/recipe")
            await transport.handle_async_request(request)

        pinned_request = captured["request"]
        # The connection target must be the validated IP, not the original
        # hostname -- otherwise httpcore would re-resolve it independently.
        assert pinned_request.url.host == "93.184.216.34"
        # SNI / certificate verification must still target the original
        # hostname so TLS validation and virtual hosting are unaffected.
        assert pinned_request.extensions.get("sni_hostname") == "angreifer.example"
        # The original Host header (set when the request was built) must be
        # preserved unchanged.
        assert pinned_request.headers.get("host") == "angreifer.example"

    @pytest.mark.asyncio
    async def test_still_blocks_private_address_before_connecting(self):
        fake = _fake_getaddrinfo([(socket.AF_INET, "169.254.169.254")])
        connect_attempted = AsyncMock()

        with (
            patch("socket.getaddrinfo", fake),
            patch(
                "httpx.AsyncHTTPTransport.handle_async_request",
                new=connect_attempted,
            ),
        ):
            transport = _SafeTransport()
            request = httpx.Request("GET", "https://angreifer.example/recipe")
            with pytest.raises(httpx.ConnectError):
                await transport.handle_async_request(request)

        connect_attempted.assert_not_called()
