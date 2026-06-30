"""Plex Media Server client.

Plex returns JSON when ``Accept: application/json`` is sent. Auth is a single
``X-Plex-Token`` applied to every request (including image fetches). Poster /
background uploads accept the raw image bytes in the request body and the
newly-uploaded asset becomes the selected one automatically.
"""

from __future__ import annotations

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
        libs: list[NormalizedLibrary] = []
        for d in mc.get("Directory", []):
            libs.append(
                NormalizedLibrary(
                    id=str(d["key"]),
                    title=d.get("title", "Library"),
                    type=_LIBRARY_TYPE.get(d.get("type", ""), "other"),
                    thumb=self._ref(d.get("thumb")),
                )
            )
        return libs

    async def get_items(self, library_id: str) -> list[NormalizedItem]:
        async with self._client() as client:
            mc = await self._get_json(client, f"/library/sections/{library_id}/all")
        items: list[NormalizedItem] = []
        for m in mc.get("Metadata", []):
            kind = "show" if m.get("type") == "show" else "movie"
            items.append(
                NormalizedItem(
                    id=str(m["ratingKey"]),
                    title=m.get("title", "Untitled"),
                    year=m.get("year"),
                    type=kind,
                    poster=self._ref(m.get("thumb")),
                    background=self._ref(m.get("art")),
                )
            )
        return items

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
        )

    async def set_image(self, item_id: str, target: str, data: bytes, content_type: str) -> None:
        endpoint = "posters" if target == "poster" else "arts"
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
