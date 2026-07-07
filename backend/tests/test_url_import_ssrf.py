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
from unittest.mock import patch

import pytest

from app.services.url_import_service import _is_safe_url, _validate_all_ips


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
