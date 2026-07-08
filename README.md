# Postarr

**Postarr** is a self-hosted, open-source artwork manager for **Plex / Jellyfin / Emby**
libraries. Browse your servers — including **collections** (Emby/Jellyfin) — then swap in
posters, backgrounds, and logos from [ThePosterDB](https://theposterdb.com),
[Fanart.tv](https://fanart.tv), [TheTVDB](https://thetvdb.com), [AniList](https://anilist.co),
and [MediUX](https://mediux.pro) — per image, per season (including Season 0 / Specials), per
title inside a collection, or a whole ThePosterDB set onto a series and all its seasons at
once.

![Postarr](docs/screenshot.png)

> ⚠️ ThePosterDB has no public API. Postarr scrapes it while signed in with **your own
> account**, the same way the established community tools do. Use it for your own libraries
> and be considerate of their service. The scraping selectors live in one file
> (`backend/app/posterdb/client.py`) so they're easy to adjust if the site changes.

---

## Features

- **Five artwork sources** behind one panel: ThePosterDB (search → title → set drill-down,
  with per-set poster counts and empty results auto-hidden), plus Fanart.tv, TheTVDB, AniList,
  and MediUX, all looked up automatically by your items' TMDB/TVDB/IMDb/AniList ids.
- **Collections** (Emby/Jellyfin): a virtual **Collections** library lists every collection on
  the server — edit a collection's own poster/backdrop, browse the titles inside it, and jump
  straight to any member's own full detail page. A **Group Collections** toggle on the library
  view replaces a collection's member movies/shows with a single tile, like Emby's own library
  view — no more scrolling past every "John Wick" sequel individually.
- **Apply anywhere**: set any image as the poster, background, or clear logo — or use
  **Custom** to point it at any target, e.g. a movie poster onto a show's Specials season, or a
  poster from a collection's page directly onto one of its member movies without leaving the
  page.
- **Auto-apply set**: map an entire ThePosterDB set onto a show and its matching seasons in
  one click.
- **New-item detection**: a library remembers when you last visited it and flags titles added
  to the media server since then that still have no poster — a small banner plus a **NEW**
  badge on the poster card, so growing libraries don't quietly accumulate gaps.
- **Manual tab**: upload your own image file (or paste an image URL) and apply it to any
  target.
- **ID override**: each provider tab has a search box pre-filled from the item's known ids;
  type a different id (or, for AniList, a title) to fix a bad match on the spot.
- **Clear-logo detail pages**: the item view shows the server's stored logo art over a
  full-bleed backdrop, blurred behind the sidebar and artwork panel too, like a native
  media-server detail page.

## Architecture

A small FastAPI backend serves a React single-page app and brokers all calls to your media
servers and the artwork sources:

```
frontend/  React + Vite + TypeScript + Tailwind v4   (the UI)
backend/   FastAPI + SQLite                            (API, scraping, server clients)
           app/media/      Plex / Jellyfin / Emby clients behind one interface
           app/posterdb/   ThePosterDB login + scraping
           app/artwork/    Fanart.tv / TheTVDB / AniList / MediUX providers
           app/routers/    REST endpoints
           data/           SQLite db + encryption key (git-ignored)
```

- **Credentials are encrypted at rest** (Fernet) and never echoed back to the browser.
- **Images are proxied** through the backend, so origin tokens and the ThePosterDB session
  stay server-side and there's no CORS to fight.
- All three media servers are normalized to the same shapes, so the UI never branches on
  server type.

## Requirements

- **Docker** (easiest), or
- Python 3.11+ (developed on 3.14) and Node 18+ (developed on 24) for a local dev setup.

## Run with Docker (recommended)

A single multi-stage image builds the frontend and serves it together with the API. Nothing
to install but Docker.

```bash
docker compose up -d --build      # build + run, http://localhost:8000
```

Or without Compose:

```bash
docker build -t postarr .
docker run -d --name postarr -p 8000:8000 -v postarr-data:/data postarr
```

Open **http://localhost:8000**. The SQLite database and encryption key live in the
`postarr-data` volume (`/data` in the container), so your servers and settings survive
restarts and image upgrades.

**Reaching your media server from the container:**

- Media server elsewhere on your LAN → just use its normal address (e.g. `http://192.168.1.20:8096`).
- Media server running on the **same host** as Docker → use `http://host.docker.internal:32400`
  (Plex) or `:8096` (Jellyfin/Emby). The provided `docker-compose.yml` already maps
  `host.docker.internal`; with plain `docker run` add `--add-host=host.docker.internal:host-gateway`.

To update after pulling new code: `docker compose up -d --build`.

## Run on Unraid

A ready-made Docker template is at [`unraid-template.xml`](unraid-template.xml) — it points at
the pre-built image on GHCR (`ghcr.io/bamcel/postarr:latest`, published automatically by
[a GitHub Action](.github/workflows/docker-publish.yml) on every push to `main`), maps the web
UI to port `8000`, persists `/data` to `/mnt/user/appdata/postarr`, and adds the same
`host.docker.internal` mapping as the Compose file above.

1. **Docker** tab → **Add Container** → scroll to the bottom → **Template repositories** →
   paste `https://raw.githubusercontent.com/bamcel/postarr/main/unraid-template.xml` → **Save**.
2. Postarr now appears as a container to add — set the **Data** path if you don't want the
   default `/mnt/user/appdata/postarr`, then **Apply**.
3. Open the WebUI from the Docker tab once it's healthy.

(Or skip step 1 and just download the XML into
`/boot/config/plugins/dockerMan/templates-user/` yourself.)

## Quick start (development)

Two processes: the API on `:8000` and the Vite dev server on `:5173` (which proxies `/api`).

**1. Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python run.py                      # http://localhost:8000
```

**2. Frontend** (second terminal)

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Open **http://localhost:5173**.

## Production (single process)

Build the frontend; FastAPI then serves it from the same origin as the API:

```bash
cd frontend && npm run build       # outputs frontend/dist
cd ../backend && python run.py      # serves the SPA + API on http://localhost:8000
```

Override host/port/data dir with env vars: `POSTARR_HOST`, `POSTARR_PORT`,
`POSTARR_DATA_DIR`, `POSTARR_RELOAD=1`.

## First-run setup

1. Open **Settings**.
2. **Add a media server** — name, type, URL, and token:
   - **Plex token**: open Plex Web → any item → ⋯ → *Get Info* → *View XML*, copy the
     `X-Plex-Token` from the URL.
   - **Jellyfin / Emby API key**: Dashboard → *API Keys* → add one.
   - Use **Test connection** to confirm before saving.
3. **Add your ThePosterDB account** (email + password) and hit **Test login**.
4. *(Optional)* Under **Settings → Database Connection**, add a free
   [Fanart.tv personal API key](https://fanart.tv/get-an-api-key/) and/or a
   [TheTVDB v4 API key](https://thetvdb.com/dashboard/account/apikey) to enable those tabs.
   AniList and MediUX need no key or account — they're ready to use immediately.

## Using it

1. Pick a server (sidebar) and a **library** (tabs), then **click** a title to open it —
   the artwork panel searches for it automatically. On Emby/Jellyfin, a **Collections**
   library tab lists every collection on the server; use the **Group Collections** toggle
   (top-right of the library view) to switch a regular library between showing each
   collection's movies/shows individually or collapsed into one tile.
2. **ThePosterDB tab**: pick a title from the categorized results (Movies / Shows /
   Collections, with counts), hover a cover and **View set (N)** to see the full set, then
   apply single images or **Auto-apply set**.
3. **Fanart.tv / TheTVDB / AniList / MediUX tabs**: artwork loads by the item's ids, grouped
   into Posters / Backgrounds / Banners / Logos. Wrong match? Type the right id in the search
   box.
4. **Manual tab**: upload a file or paste an image URL, choose the target, apply.
5. On any image, **Custom** lets you choose exactly where it lands — poster, background,
   logo, a specific season, or — on a collection's page — any of its member movies/shows,
   without leaving the page.

## API

Interactive docs are available at `/docs` when the backend is running. Key endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE` | `/api/servers…` | manage media servers |
| `POST` | `/api/servers/{id}/test` | test a saved connection |
| `GET` | `/api/servers/{id}/libraries` | list libraries (includes a virtual `collections` one, Emby/Jellyfin) |
| `GET` | `/api/servers/{id}/libraries/{lib}/items[?group_collections=]` | list titles; toggle collection grouping (default on, Emby/Jellyfin) |
| `GET` | `/api/servers/{id}/items/{item}` | item detail: seasons, members (if a collection), logo, external ids |
| `GET` | `/api/servers/{id}/image?ref=…` | auth'd media-server image proxy |
| `PUT` | `/api/posterdb/credentials` | save ThePosterDB login |
| `GET` | `/api/posterdb/search?term=` | categorized ThePosterDB search |
| `POST` | `/api/posterdb/verify` | poster counts per title (hides empty results) |
| `GET` | `/api/posterdb/set?url=` | scrape a set / poster / title page |
| `GET` | `/api/posterdb/image?url=` | cached ThePosterDB thumbnail proxy |
| `POST` | `/api/posterdb/apply` | download an image + apply to a server |
| `GET` | `/api/artwork?provider=&server_id=&item_id=[&id_override=]` | Fanart/TVDB/AniList/MediUX artwork |
| `GET/PUT` | `/api/artwork/settings` | Fanart/TVDB API keys |
| `GET` | `/api/artwork/mediux/image?url=` | cached MediUX thumbnail proxy |
| `POST` | `/api/artwork/upload` | apply a user-uploaded image file |

## License

MIT — see [LICENSE](LICENSE).
