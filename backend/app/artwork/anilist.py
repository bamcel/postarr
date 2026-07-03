"""AniList provider — anime cover (poster) + banner via the free GraphQL API."""

from __future__ import annotations

import re

from ..schemas import ArtworkItem, ItemDetail
from .base import ArtworkError, ArtworkProvider

ANILIST_URL = "https://graphql.anilist.co"
_QUERY = """
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    title { romaji english }
    coverImage { extraLarge large }
    bannerImage
  }
}
"""


class AniListProvider(ArtworkProvider):
    name = "anilist"
    label = "AniList"
    needs_key = False

    def is_configured(self) -> bool:
        return True  # public API, no key

    async def fetch(self, item: ItemDetail) -> list[ArtworkItem]:
        query = re.sub(r"\s*\(\d{4}\)\s*$", "", item.title).strip()
        async with self._http() as client:
            resp = await client.post(
                ANILIST_URL, json={"query": _QUERY, "variables": {"search": query}}
            )
        if resp.status_code == 404:
            return []
        if resp.status_code >= 400:
            raise ArtworkError(f"AniList error ({resp.status_code}).")

        media = (resp.json().get("data") or {}).get("Media")
        if not media:
            return []

        kind = "movie" if item.type == "movie" else "show"
        items: list[ArtworkItem] = []
        cover = (media.get("coverImage") or {})
        cover_url = cover.get("extraLarge") or cover.get("large")
        if cover_url:
            items.append(
                ArtworkItem(
                    id=f"anilist-{media['id']}-poster",
                    provider="anilist",
                    type="poster",
                    kind=kind,
                    title=item.title,
                    thumb_url=cover_url,
                    download_url=cover_url,
                    applyable=True,
                    source_url=f"https://anilist.co/anime/{media['id']}",
                )
            )
        banner = media.get("bannerImage")
        if banner:
            items.append(
                ArtworkItem(
                    id=f"anilist-{media['id']}-banner",
                    provider="anilist",
                    type="banner",
                    kind=kind,
                    title=item.title,
                    thumb_url=banner,
                    download_url=banner,
                    applyable=False,  # banners not wired to apply yet
                    source_url=f"https://anilist.co/anime/{media['id']}",
                )
            )
        return items
