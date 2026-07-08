# Postarr — development notes

Self-hosted artwork manager for Plex/Jellyfin/Emby. FastAPI + SQLite backend,
React/Vite/TS/Tailwind v4 frontend, shipped as one Docker image. See README.md
for the user-facing overview; this file is for working on the code.

## Commands

```bash
# backend (from backend/, venv in backend/.venv)
python run.py                          # dev server on :8000 (POSTARR_RELOAD=1 for reload)
.venv/Scripts/python -m ruff check app # lint

# frontend (from frontend/)
npm run dev                            # Vite on :5173, proxies /api -> :8000
npm run build                          # tsc typecheck + production bundle -> dist/

# deploy the running container (rebuilds frontend + backend into the image)
docker compose up -d --build           # serves SPA + API on :8000
```

There is no test suite; verification is done against a live media server.
`/api/servers/{id}/test` checks connectivity, `/api/health` checks the app.

## Architecture

- `backend/app/media/` — one `MediaClient` ABC (base.py), implemented by
  `plex.py` and `jellyfin.py` (`emby.py` subclasses Jellyfin — same API).
  Everything is normalized to the `Normalized*` / `ItemDetail` schemas so
  routers and the UI never branch on server type.
- `backend/app/posterdb/client.py` — ALL ThePosterDB logic: Laravel CSRF
  login, HTML scraping, thumbnail proxy/cache. Module-level singleton
  (`posterdb`) holds the authenticated session across requests.
- `backend/app/artwork/` — API-based providers (Fanart.tv, TheTVDB, AniList,
  MediUX) behind an `ArtworkProvider` ABC, looked up by the item's
  `external_ids`. MediUX has no public API yet, so it scrapes mediux.pro's
  own server-rendered pages the same way ThePosterDB does, just without
  needing a login.
- `frontend/src/components/ArtworkPanel.tsx` — provider selector wrapping
  `PosterDBBody` (ThePosterDB drill-down), `ArtworkBrowser` (API providers),
  and `ManualUpload`. Apply targets are built once in `lib/targets.ts`.
- Secrets (server tokens, TPDb password, API keys) are Fernet-encrypted in
  SQLite (`db.SECRET_SETTINGS`); the key lives in `data/secret.key`. Neither
  is ever sent to the browser.
- All images the browser shows are proxied through the backend
  (`/api/servers/{id}/image`, `/api/posterdb/image`) so credentials/sessions
  stay server-side and CORS never applies.

## Gotchas (learned the hard way)

- **Jellyfin/Emby image upload** wants the request body **base64-encoded**
  with `Content-Type` set to the real image mime. Raw bytes fail.
- **Emby backdrops are a list** — `POST /Items/{id}/Images/Backdrop` appends;
  it does not replace the displayed image. `set_image` deletes existing
  backdrops first so the new one becomes index 0.
- **Emby item ids change on library rescan.** Never cache them across
  sessions; always re-list.
- **Plex logo upload** uses `POST /library/metadata/{id}/clearLogos` (same
  raw-bytes pattern as `posters`/`arts`).
- **ThePosterDB is behind Cloudflare** but a logged-in httpx session with
  browser-like headers gets through. A 429 is rate-limiting, NOT a dead
  session — do not re-login on it (re-login used to tear down the shared
  client and kill every in-flight request). Grid thumbnails must use the
  small optimized webp from each card's `<picture><source srcset>` (~70 KB),
  never the full-res `/api/assets/{id}` (2–5 MB), or big sets rate-limit.
- **ThePosterDB search results come from TMDB**, so most matched titles have
  zero uploaded posters. `/api/posterdb/verify` counts posters per title and
  the UI hides the empty ones.
- **The user's Emby goes offline intermittently.** If "nothing loads", hit
  `/api/servers/{id}/test` before suspecting Postarr; restarting the
  container does not fix an unreachable media server.
- **Git Bash on Windows mangles container paths** (`/tmp/...` becomes
  `C:/...`) in `docker exec`/`docker cp` args — wrap the remote command in
  `sh -c '...'` or set `MSYS_NO_PATHCONV=1`.
- **Emby's `/Items?Ids=` lookup silently returns nothing for a BoxSet**
  unless `IncludeItemTypes` explicitly allow-lists it alongside the regular
  types (`Movie,Series,BoxSet`) — no error, just an empty result, which reads
  as "item not found."
- **Emby's `CollapseBoxSetItems` query param doesn't reliably group a
  library's movies into their collections** — tested live: it silently drops
  the extra member items instead of replacing them with a collection tile.
  Grouping is done by hand instead (`JellyfinClient._collapse_boxsets`):
  list every BoxSet, fetch each one's children via `ParentId` in parallel,
  then substitute.
- **MediUX needs no login**, unlike ThePosterDB — a plain browser-header GET
  reaches `mediux.pro/{movies,shows,collections}/{tmdbId}` fine. But its
  Next.js image proxy (used for thumbnails) 403s without a same-origin
  `Referer` header and 400s on a non-whitelisted `w=` value (only specific
  sizes like 256 are allowed) — see `backend/app/artwork/mediux.py`.

## Conventions

- Applying artwork always flows through `POST /api/posterdb/apply`
  (`provider` field decides how the bytes are fetched) or
  `POST /api/artwork/upload` for user files — then `MediaClient.set_image`.
- Banners are display-only everywhere: no supported media server has a
  banner-upload endpoint.
- git checkpoints are tagged (`checkpoint-N`); the user asks for commits
  explicitly. The repo is pushed to `https://github.com/bamcel/postarr`.
