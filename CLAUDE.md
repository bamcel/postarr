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
- `backend/app/history.py` — apply history (revert-to-previous-image). Every
  successful `set_image` call, from any of the two apply endpoints
  (`/posterdb/apply`, `/artwork/upload`), also calls `history.record(...)`,
  which writes the bytes to `data/history/` and indexes them in the
  `apply_history` SQLite table. Two independent, **user-configurable** caps:
  a global entry-count ceiling (`history_max_entries` setting, default 50,
  always enforced on insert — oldest rows + files pruned first, not
  per-item, a single shared budget; lowering it in Settings also prunes
  immediately via `history.enforce_max_entries()`, not just on the next
  apply) and an optional max age in days (`history_purge_days` setting, 0 =
  disabled — only entries *older than* the threshold are ever touched,
  swept opportunistically on every `record()` call, no scheduler needed).
  Revert re-applies those same bytes and records that as a new entry —
  reverting never deletes the entry it reverted to, so history stays a true
  timeline, not a stack. The UI is a single **global** feed
  (`frontend/src/pages/HistoryPage.tsx`, linked from the sidebar) rather
  than a per-item tab, grouped client-side into one tile per (item, target)
  — the newest entry in each group is the tile's image; clicking it opens a
  modal listing every version in that group with Revert — `GET /api/history`
  returns that global feed when
  called without `item_id`; `POST /api/history/purge` triggers an immediate
  manual purge. `item_title` is denormalized onto each row (sent by the
  frontend at apply time, since it's already in hand there) specifically so
  the global feed doesn't need an extra media-server round trip per row
  just to render.
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
- **SQLite's `datetime('now')`** (used for `apply_history.applied_at`) is
  `"YYYY-MM-DD HH:MM:SS"` UTC with **no timezone marker and a space, not a
  `T`** — `Date.parse()` on the frontend needs
  `str.replace(" ", "T") + "Z"` first or it's ambiguous/wrong depending on
  the browser. Jellyfin/Emby's `DateCreated` and Plex's normalized
  `added_at` are proper ISO 8601 and don't need this.
- **Plex's collection-grouping (`_collapse_collections`) and the rest of the
  Plex collections code are unverified** — there's no Plex server in this
  dev environment. It mirrors Jellyfin's `_collapse_boxsets` pattern closely
  (fetch the section's own collections, fetch each one's children via
  `/library/collections/{id}/children` in parallel, substitute), but the
  first real Plex test is the thing most likely to need a tweak.
- **`db.SCHEMA`'s `CREATE TABLE IF NOT EXISTS` doesn't retroactively add new
  columns** to a table that already exists on disk (e.g. adding `item_title`
  to `apply_history` after the table was already created) — needs an
  explicit `ALTER TABLE ... ADD COLUMN` in `db._migrate()`, gated on a
  `PRAGMA table_info` check, run from `init_db()` on every startup.
- **`apply_history` prunes to the last 50 rows *globally*** (not per item)
  — deletes both the DB row and the file on disk, on every `record()` call.
  Originally per-(server,item,target) capped at 5; changed to one shared
  global budget per user request. If a specific history entry you were
  expecting seems to have vanished mid-testing, check whether repeated
  applies (to *any* title) pushed it out of that window before assuming
  something's broken (bit us once while testing revert).

## Conventions

- Applying artwork always flows through `POST /api/posterdb/apply`
  (`provider` field decides how the bytes are fetched) or
  `POST /api/artwork/upload` for user files — then `MediaClient.set_image`,
  then `history.record(...)`. Any new apply path must call all three, in
  that order — history is written from the bytes that were actually
  uploaded, not re-fetched from the source afterward.
- Banners are display-only everywhere: no supported media server has a
  banner-upload endpoint.
- git checkpoints are tagged (`checkpoint-N`); the user asks for commits
  explicitly. The repo is pushed to `https://github.com/bamcel/postarr`.
