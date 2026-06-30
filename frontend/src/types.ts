// Shapes mirror the backend Pydantic models in backend/app/schemas.py.

export type ServerType = "plex" | "jellyfin" | "emby";
export type ImageTarget = "poster" | "background";

export interface Server {
  id: number;
  name: string;
  type: ServerType;
  base_url: string;
  is_default: boolean;
  has_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectionTest {
  ok: boolean;
  message: string;
  server_name?: string | null;
  version?: string | null;
}

export interface Library {
  id: string;
  title: string;
  type: "movie" | "show" | "other";
  thumb?: string | null;
}

export interface MediaItem {
  id: string;
  title: string;
  year?: number | null;
  type: "movie" | "show";
  poster?: string | null;
  background?: string | null;
}

export interface Season {
  id: string;
  title: string;
  index?: number | null;
  poster?: string | null;
  episode_count?: number | null;
}

export interface ItemDetail extends MediaItem {
  summary?: string | null;
  season_count?: number | null;
  seasons: Season[];
}

export type PosterKind =
  | "show"
  | "movie"
  | "season"
  | "collection"
  | "titlecard"
  | "background"
  | "unknown";

export interface PosterAsset {
  id: string;
  title: string;
  kind: PosterKind;
  season_number?: number | null;
  thumb_url: string;
  download_url: string;
  source_url?: string | null;
}

export interface PosterSet {
  set_url: string;
  title?: string | null;
  author?: string | null;
  posters: PosterAsset[];
}

export interface PosterTitleResult {
  title: string;
  url: string;
  media_id: string;
}

export interface PosterCategory {
  name: string;
  count: number;
  results: PosterTitleResult[];
}

export interface PosterSearchResults {
  term: string;
  categories: PosterCategory[];
}

export interface PosterDBStatus {
  configured: boolean;
  email: string;
  logged_in: boolean;
  message: string;
}

export interface ApplyResult {
  ok: boolean;
  message: string;
}
