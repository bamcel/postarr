# Postarr

**Postarr** is a self-hosted, open-source tool for browsing your Plex / Jellyfin / Emby
libraries and swapping in artwork from [ThePosterDB](https://theposterdb.com). Search a
title, pull its poster set, and replace the show/movie poster, season posters, or background
with a click — or auto-apply a whole set onto a series and its seasons at once.

![Postarr](docs/screenshot.png)

> ⚠️ ThePosterDB has no public API. Postarr scrapes it while signed in with **your own
> account**, the same way the established community tools do. Use it for your own libraries
> and be considerate of their service. The scraping selectors live in one file
> (`backend/app/posterdb/client.py`) so they're easy to adjust if the site changes.

---

## Architecture

A small FastAPI backend serves a React single-page app and brokers all calls to your media
servers and ThePosterDB:

```
frontend/  React + Vite + TypeScript + Tailwind v4   (the UI)
backend/   FastAPI + SQLite                            (API, scraping, server clients)
           app/media/      Plex / Jellyfin / Emby clients behind one interface
           app/posterdb/   ThePosterDB login + scraping
           app/routers/    REST endpoints
           data/           SQLite db + encryption key (git-ignored)
```

- **Credentials are encrypted at rest** (Fernet) and never echoed back to the browser.
- **Images are proxied** through the backend, so origin tokens stay server-side and there's
  no CORS to fight.
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

## Using it

1. Pick a server (sidebar) and a **library** (tabs).
2. **Double-click** a poster to open the title.
3. In the **ThePosterDB panel** on the right, search the title (or paste a set/poster URL).
4. Apply any poster as the **Poster** or **BG**, send season posters to the matching season,
   or hit **Auto-apply set** to do the whole set at once.

## API

Interactive docs are available at `/docs` when the backend is running. Key endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE` | `/api/servers…` | manage media servers |
| `POST` | `/api/servers/{id}/test` | test a saved connection |
| `GET` | `/api/servers/{id}/libraries` | list libraries |
| `GET` | `/api/servers/{id}/libraries/{lib}/items` | list titles |
| `GET` | `/api/servers/{id}/items/{item}` | item detail + seasons |
| `GET` | `/api/servers/{id}/image?ref=…` | auth'd image proxy |
| `PUT` | `/api/posterdb/credentials` | save ThePosterDB login |
| `GET` | `/api/posterdb/search?term=` | search ThePosterDB |
| `GET` | `/api/posterdb/set?url=` | scrape a set/poster |
| `POST` | `/api/posterdb/apply` | download + apply to a server |

## License

MIT — see [LICENSE](LICENSE).
