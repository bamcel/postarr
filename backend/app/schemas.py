"""Pydantic models describing the HTTP API contract.

The ``Normalized*`` models are the server-agnostic shapes the frontend
consumes; each media-client implementation maps Plex/Jellyfin/Emby responses
into them so the UI never has to branch on server type.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ServerType = Literal["plex", "jellyfin", "emby"]
ImageTarget = Literal["poster", "background"]


# ---------------------------------------------------------------------------
# Media servers
# ---------------------------------------------------------------------------

class ServerCreate(BaseModel):
    name: str
    type: ServerType
    base_url: str = Field(..., description="e.g. http://192.168.1.10:32400")
    token: str = Field(..., description="Plex token, or Jellyfin/Emby API key")
    is_default: bool = False


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[ServerType] = None
    base_url: Optional[str] = None
    # Empty string = keep the stored token untouched.
    token: Optional[str] = None
    is_default: Optional[bool] = None


class ServerOut(BaseModel):
    id: int
    name: str
    type: ServerType
    base_url: str
    is_default: bool
    has_token: bool
    created_at: str
    updated_at: str


class ConnectionTest(BaseModel):
    ok: bool
    message: str
    server_name: Optional[str] = None
    version: Optional[str] = None


# ---------------------------------------------------------------------------
# Normalized media shapes
# ---------------------------------------------------------------------------

class NormalizedLibrary(BaseModel):
    id: str
    title: str
    type: Literal["movie", "show", "other"]
    thumb: Optional[str] = None  # image proxy ref


class NormalizedItem(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    type: Literal["movie", "show"]
    poster: Optional[str] = None      # image proxy ref
    background: Optional[str] = None  # image proxy ref


class NormalizedSeason(BaseModel):
    id: str
    title: str
    index: Optional[int] = None
    poster: Optional[str] = None
    episode_count: Optional[int] = None


class ItemDetail(NormalizedItem):
    summary: Optional[str] = None
    season_count: Optional[int] = None
    seasons: list[NormalizedSeason] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# ThePosterDB
# ---------------------------------------------------------------------------

class PosterDBCredentials(BaseModel):
    email: str = ""
    # Write-only; never echoed back to the client.
    password: str = ""


class PosterDBStatus(BaseModel):
    configured: bool
    email: str = ""
    logged_in: bool = False
    message: str = ""


PosterKind = Literal["show", "movie", "season", "collection", "titlecard", "background", "unknown"]


class PosterAsset(BaseModel):
    id: str
    title: str
    kind: PosterKind = "unknown"
    season_number: Optional[int] = None
    thumb_url: str           # full-res / preview URL on ThePosterDB
    download_url: str        # URL the backend uses to fetch the bytes
    source_url: Optional[str] = None  # the poster/set page it came from


class PosterSet(BaseModel):
    set_url: str
    title: Optional[str] = None
    author: Optional[str] = None
    posters: list[PosterAsset] = Field(default_factory=list)


class PosterTitleResult(BaseModel):
    """A single title (movie/show/collection) matched by a search."""
    title: str
    url: str        # the TPDb title page (/posters/{id}) to open
    media_id: str


class PosterCategory(BaseModel):
    name: str       # "Movies" | "Shows" | "Collections"
    count: int
    results: list[PosterTitleResult] = Field(default_factory=list)


class PosterSearchResults(BaseModel):
    term: str
    categories: list[PosterCategory] = Field(default_factory=list)


class VerifyTitlesRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

class ApplyRequest(BaseModel):
    server_id: int
    item_id: str
    target: ImageTarget = "poster"
    # Provide exactly one source:
    download_url: Optional[str] = None  # a ThePosterDB asset download URL
    asset_id: Optional[str] = None      # a ThePosterDB asset id (resolved to a URL)


class ApplyResult(BaseModel):
    ok: bool
    message: str
