# Postarr — session handoff

**Read this first in a new conversation.** For dev commands/architecture/gotchas see
[CLAUDE.md](CLAUDE.md); for the user-facing feature list see [README.md](README.md). This file
is just "what's the current state and what's left hanging" — update it as you go, don't let it
go stale.

## Right now

- Branch `main`, container `postarr` is **up and healthy** on `http://localhost:8000`
  (`docker compose ps` to confirm — it may have been stopped since).
- Repo is pushed to **`https://github.com/bamcel/postarr`** (`origin`). No open pending diff —
  everything through the collections/MediUX/frosted-glass/Settings-polish work is committed.
- **Standing instruction**: rebuild the container (`docker compose up -d --build`) after every
  completed change, automatically, without being asked.

## What the app can do (verified live against the user's real Emby)

Five artwork sources behind one panel per item: **ThePosterDB** (scraped, categorized search,
title→set drill-down, empty-result filtering, set-size counts), **Fanart.tv**, **TheTVDB**,
**AniList**, and **MediUX** (looked up by the item's external ids; MediUX needs no
account/key — see CLAUDE.md gotchas for its scraping quirks). Apply to poster/background/logo
on Plex/Jellyfin/Emby, including a **Custom** target picker (any season, Season 0/Specials
included, or — on a collection's page — any member movie/show) and a **Manual** upload tab.

**Collections** (Emby/Jellyfin only so far): a virtual **Collections** library lists every
collection on the server; each collection's own detail page shows its members with drill-through
to their own full detail pages; a **Group Collections** toggle on regular library views replaces
a collection's member movies/shows with one tile (built by hand — Emby's own
`CollapseBoxSetItems` param doesn't work reliably, see CLAUDE.md). **Plex collections/grouping is
code-complete but never live-verified** — there's no Plex server in this environment to test
against; the Plex-side code follows the same pattern as Emby/Jellyfin but the exact field
matching (Plex uses a `Collection` tag array, not clean parent-id lookup) may need a tweak once
tested for real.

Settings is tabbed (**Server Setup** / **Database Connection**); the sidebar and artwork panel
use a frosted-glass look (blurred backdrop bleeding behind them, matching Emby's own UI).

Full endpoint list and setup steps are in README.md — don't duplicate that here.

## Known live gotchas (still true, see CLAUDE.md for the full list)

- The user's real Emby (`http://192.168.1.79:8096`) **goes offline/unreachable intermittently** —
  not a Postarr bug. If something "stops loading," check `/api/servers/{id}/test` before assuming
  code broke.
- Preview screenshots in this environment are **flaky** (frequent timeouts/UnknownVizError with
  no console errors) — when that happens, verify via `preview_eval` DOM queries / canvas pixel
  sampling instead of fighting the screenshot tool.
- Git Bash on Windows mangles `docker exec`/`docker cp` paths starting with `/` — wrap remote
  commands in `sh -c '...'` or set `MSYS_NO_PATHCONV=1`.
- No backend caching on the collection-membership lookup (`_collapse_boxsets`) — every
  `group_collections=true` library listing re-fetches all BoxSets + their children fresh from
  Emby. User was told about this and said it's fine for now (their collection count is small).

## Ideas not yet built (suggested, not requested)

- A "missing artwork" report/dashboard for a library.
- New-item detection (flag recently-added titles missing artwork).
- Backend caching for the collection-membership lookup (offered, declined "for now").

## To resume

1. `cd C:\Users\bamcel\Documents\AppDesign\Postarr`
2. `git status` — should be clean; if not, confirm what's pending before assuming it's from a
   prior session.
3. `docker compose ps` — confirm the container is up; if not, `docker compose up -d --build`.
4. Ask the user what's next.
