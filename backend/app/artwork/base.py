"""Artwork provider base class + shared helpers."""

from __future__ import annotations

import abc

import httpx

from ..config import HTTP_TIMEOUT, USER_AGENT
from ..schemas import ArtworkItem, ItemDetail


class ArtworkError(Exception):
    """Raised for provider configuration or lookup failures."""


class ArtworkProvider(abc.ABC):
    #: stable machine name used in URLs/requests, e.g. "fanart"
    name: str = ""
    #: human label for the UI
    label: str = ""
    #: whether the provider requires an API key configured in settings
    needs_key: bool = False

    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider can be used (key present, etc.)."""

    @abc.abstractmethod
    async def fetch(self, item: ItemDetail) -> list[ArtworkItem]:
        """Return all artwork for ``item`` (posters/backgrounds/banners/logos)."""

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _http() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=HTTP_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )


async def download_public_image(url: str) -> tuple[bytes, str]:
    """Fetch a public image URL (Fanart/TVDB/AniList CDNs) for applying.

    These CDNs are public, so no per-provider auth is needed.
    """
    async with httpx.AsyncClient(
        timeout=HTTP_TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    ) as client:
        resp = await client.get(url)
        if resp.status_code >= 400:
            raise ArtworkError(f"Image download failed ({resp.status_code}).")
        ctype = resp.headers.get("content-type", "image/jpeg")
        if "image" not in ctype:
            raise ArtworkError("The artwork URL did not return an image.")
        return resp.content, ctype
