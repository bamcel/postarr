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

**Collections**: a virtual **Collections** library lists every collection on the server; each
collection's own detail page shows its members with drill-through to their own full detail
pages; a **Group Collections** toggle on regular library views replaces a collection's member
movies/shows with one tile (built by hand for both Emby/Jellyfin and Plex — Emby's own
`CollapseBoxSetItems` param doesn't work reliably, see CLAUDE.md). **Live-verified on
Emby/Jellyfin only** — `PlexClient._collapse_collections` mirrors the Jellyfin pattern closely
(fetch the section's own collections, fetch each one's children in parallel, substitute) but
there's no Plex server in this environment, so it's never actually been run. If a Plex user
reports it's off, that's the first place to look.

**Apply history + revert**: every successful apply (any provider, or a manual upload) is
recorded — bytes saved to `data/history/`, indexed in `apply_history` SQLite table, last 5 kept
per server+item+target. Originally shipped as a per-item "History" tab in the artwork panel, then
**pivoted the same session** to a single **global** feed instead (`/history` in the sidebar,
`HistoryPage.tsx`) — every apply across the whole server, newest first, with **Revert** — because
a global "what did I just do" view is more useful than having to remember which title to check.
`apply_history` gained an `item_title` column (denormalized — the frontend already has the title
in hand at apply time, sent along with `ApplyRequest`/`/artwork/upload`, so the global feed
doesn't need a media-server round trip per row) with a real `db._migrate()` ALTER TABLE since the
table already existed on disk from the per-item version. Verified live end-to-end against the
real Emby (item 84973, "3:10 to Yuma"): re-applied its true original poster bytes (zero visual
change), applied a different borrowed poster, reverted back via the real UI button, confirmed
byte-for-byte the live poster matched the true original — then re-verified again after the pivot
with `item_title` included, confirming it threads through correctly and shows in the global feed
while old (pre-migration) rows correctly fall back to displaying their raw item id. **Caught two
real things while testing, both about the 5-per-target prune, not bugs**: (1) clicking the first
"Revert" button in the DOM isn't necessarily the *original* entry if 3+ rows exist — it's
whichever is second-most-recent — briefly left the real item on the wrong image before being
caught by comparing bytes and fixed; (2) aggressive re-testing on the same title eventually prunes
old rows (including their files) past the 5-row cap, so a reference entry created early in a test
session can silently disappear later — not a bug, just something to expect when scripting repeat
applies to the same title.

Settings is tabbed (**Server Setup** / **Database Connection**); the sidebar and artwork panel
use a frosted-glass look (blurred backdrop bleeding behind them, matching Emby's own UI).

**New-item detection**: each library remembers when you last visited it (localStorage, per
server+library) and flags titles added since then that still have no poster — a summary banner
plus a "NEW" badge per card. Backend adds `added_at` (ISO 8601) to `NormalizedItem`, sourced
from Emby/Jellyfin's `DateCreated` field or Plex's `addedAt` Unix timestamp. Verified live: real
`added_at` values come back from Emby; the intersection logic (recent AND no poster) was
confirmed correct by cross-checking against the real API data (0 items currently qualify — the
user's library already has full artwork) and then proven positive by injecting a synthetic
recent+posterless item via a monkey-patched `fetch` in the browser, which correctly triggered
both the banner and the badge.

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
- History thumbnails serve the **full-resolution** stored image, not a resized version — fine
  functionally (verified they load correctly) but means up to 15 multi-MB images per History tab
  open. No image-resizing library (e.g. Pillow) is a dependency yet; would need one to fix
  properly. Noted as a possible follow-up, not fixed.

## Ideas not yet built (suggested, not requested)

- A "missing artwork" report/dashboard covering a whole library at once (new-item detection
  above only flags what's changed since your last visit, not a full audit).
- Backend caching for the collection-membership lookup (offered, declined "for now").
- Resize History tab thumbnails server-side instead of serving full-res (see gotcha above).

## To resume

1. `cd C:\Users\bamcel\Documents\AppDesign\Postarr`
2. `git status` — should be clean; if not, confirm what's pending before assuming it's from a
   prior session.
3. `docker compose ps` — confirm the container is up; if not, `docker compose up -d --build`.
4. Ask the user what's next.
