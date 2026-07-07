"""Plex Media Server client.

Plex returns JSON when ``Accept: application/json`` is sent. Auth is a single
``X-Plex-Token`` applied to every request (including image fetches). Poster /
background uploads accept the raw image bytes in the request body and the
newly-uploaded asset becomes the selected one automatically.
"""

from __future__ import annotations

from typing import Optional

import httpx

from ..schemas import ItemDetail, NormalizedItem, NormalizedLibrary, NormalizedSeason
from .base import MediaClient, MediaError

_LIBRARY_TYPE = {"movie": "movie", "show": "show"}


class PlexClient(MediaClient):
    def _headers(self, json: bool = True) -> dict[str, str]:
        h = {"X-Plex-Token": self.token}
        if json:
            h["Accept"] = "application/json"
        return h

    async def _get_json(self, client: httpx.AsyncClient, path: str) -> dict:
        resp = await client.get(self.base_url + path, headers=self._headers())
        if resp.status_code == 401:
            raise MediaError("Plex rejected the token (401 Unauthorized).")
        resp.raise_for_status()
        return resp.json().get("MediaContainer", {})

    async def test_connection(self) -> tuple[str, str]:
        try:
            async with self._client() as client:
                mc = await self._get_json(client, "/")
        except MediaError:
            raise
        except httpx.HTTPError as exc:
            raise MediaError(f"Could not reach Plex at {self.base_url}: {exc}") from exc
        return mc.get("friendlyName", "Plex"), str(mc.get("version", ""))

    async def get_libraries(self) -> list[NormalizedLibrary]:
        async with self._client() as client:
            mc = await self._get_json(client, "/library/sections")
        return [
            NormalizedLibrary(
                id=str(d["key"]),
                title=d.get("title", "Library"),
                type=_LIBRARY_TYPE.get(d.get("type", ""), "other"),
            )
            for d in mc.get("Directory", [])
        ]

    async def get_items(self, library_id: str) -> list[NormalizedItem]:
        async with self._client() as client:
            mc = await self._get_json(client, f"/library/sections/{library_id}/all")
        return [
            NormalizedItem(
                id=str(m["ratingKey"]),
                title=m.get("title", "Untitled"),
                year=m.get("year"),
                type="show" if m.get("type") == "show" else "movie",
                poster=self._ref(m.get("thumb")),
            )
            for m in mc.get("Metadata", [])
        ]

    async def get_item_detail(self, item_id: str) -> ItemDetail:
        async with self._client() as client:
            mc = await self._get_json(client, f"/library/metadata/{item_id}")
            meta = (mc.get("Metadata") or [{}])[0]
            kind = "show" if meta.get("type") == "show" else "movie"
            seasons: list[NormalizedSeason] = []
            if kind == "show":
                cmc = await self._get_json(client, f"/library/metadata/{item_id}/children")
                for s in cmc.get("Metadata", []):
                    if s.get("type") != "season":
                        continue
                    seasons.append(
                        NormalizedSeason(
                            id=str(s["ratingKey"]),
                            title=s.get("title", "Season"),
                            index=s.get("index"),
                            poster=self._ref(s.get("thumb")),
                            episode_count=s.get("leafCount"),
                        )
                    )
        return ItemDetail(
            id=str(meta.get("ratingKey", item_id)),
            title=meta.get("title", "Untitled"),
            year=meta.get("year"),
            type=kind,
            poster=self._ref(meta.get("thumb")),
            background=self._ref(meta.get("art")),
            summary=meta.get("summary"),
            season_count=meta.get("childCount") if kind == "show" else None,
            seasons=seasons,
            external_ids=self._external_ids(meta),
            logo=self._logo_ref(meta),
        )

    @staticmethod
    def _logo_ref(meta: dict) -> Optional[str]:
        """Plex's clear-logo art lives in the ``Image`` array as type clearLogo."""
        for img in meta.get("Image", []):
            if img.get("type") == "clearLogo" and img.get("url"):
                return img["url"].lstrip("/")
        return None

    @staticmethod
    def _external_ids(meta: dict) -> dict[str, str]:
        """Parse Plex's Guid array (e.g. ``tmdb://603``) into {scheme: id}."""
        ids: dict[str, str] = {}
        for g in meta.get("Guid", []):
            raw = g.get("id", "")
            if "://" in raw:
                scheme, _, value = raw.partition("://")
                if value:
                    ids[scheme.lower()] = value
        return ids

    async def set_image(self, item_id: str, target: str, data: bytes, content_type: str) -> None:
        # Same upload pattern for all three: posters, arts (background), and
        # clearLogos — Plex's newer (4.17+) clear-logo endpoint.
        endpoint = {"poster": "posters", "background": "arts", "logo": "clearLogos"}.get(target, "posters")
        url = f"{self.base_url}/library/metadata/{item_id}/{endpoint}"
        async with self._client() as client:
            resp = await client.post(
                url,
                content=data,
                headers={**self._headers(json=False), "Content-Type": content_type},
            )
            if resp.status_code == 401:
                raise MediaError("Plex rejected the token while uploading.")
            if resp.status_code >= 400:
                raise MediaError(f"Plex upload failed ({resp.status_code}): {resp.text[:200]}")

    async def fetch_image(self, ref: str) -> tuple[bytes, str]:
        async with self._client() as client:
            resp = await client.get(self.base_url + "/" + ref.lstrip("/"), headers=self._headers(json=False))
            resp.raise_for_status()
            return resp.content, resp.headers.get("content-type", "image/jpeg")

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _ref(path: str | None) -> str | None:
        """Plex thumb/art values are already clean relative paths.

        Kept raw (not percent-encoded) here: the frontend encodes the ref into
        the proxy query string and httpx encodes it once when fetching, so
        pre-encoding would double-escape it.
        """
        if not path:
            return None
        return path.lstrip("/")
