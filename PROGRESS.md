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
recorded — bytes saved to `data/history/`, indexed in `apply_history` SQLite table. Originally
shipped as a per-item "History" tab, then **pivoted the same session** to a single **global**
feed instead (`/history` in the sidebar, `HistoryPage.tsx`) — every apply across the whole
server, newest first, with **Revert** — because a global "what did I just do" view is more
useful than having to remember which title to check. `apply_history` gained an `item_title`
column (denormalized — the frontend already has the title in hand at apply time, so the global
feed doesn't need a media-server round trip per row) via a real `db._migrate()` ALTER TABLE
since the table already existed on disk. **Then refined again same session**: the global feed
first shipped as a flat row-per-entry list (so the same title could appear many times in a row),
then changed to a grouped grid — one poster tile per (item, target), showing the current image
with a count badge, click to open a modal listing every version with Revert. Verified live:
grouping 4 entries for one real item ("3:10 to Yuma") correctly showed a single tile with a "4"
badge; clicking it opened a modal with all 4 thumbnails + 1 "Current" tag + 3 Revert buttons
(confirmed via computed styles, not the screenshot tool — see gotcha below); reverting from
inside the modal closed it and created a fresh entry as expected.

**Retention (added right after, same session)**: the original per-(item,target) cap of 5 was
replaced with one **global hard cap of 50 rows** (oldest pruned first, DB row + file both),
plus an optional **user-configurable auto-purge age in days** (0 = disabled, swept on every
apply) and a manual **Purge now** button — both live at the top of the History page, backed by
`GET/PUT /api/history/settings` and `POST /api/history/purge?days=`. Verified live: settings
save/load round-trip, a no-op purge (large day threshold, correctly purged 0), and a full purge
(days=0) that correctly emptied both the DB table *and* deleted every file on disk (`du` showed
`/data/history` back to 4K). Real disk usage checked live too: ~15MB across 7 entries at the
time, all full-resolution (2-5MB each) — the 50-cap now bounds worst case to roughly 100-250MB
rather than unbounded growth.

Along the way, verified the original apply/revert round trip twice more (re-apply true original
→ apply a different poster → revert → byte-for-byte match against the real Emby item 84973,
"3:10 to Yuma") and **hit two real things while testing, both expected behavior of the
prune/cap mechanics, not bugs**: (1) clicking the first "Revert" button in the DOM isn't
necessarily the *original* entry if 3+ rows exist for that item — briefly left the real item on
the wrong image before being caught by comparing bytes and fixed; (2) aggressive re-testing on
the same title eventually prunes old rows (including their files) past whatever cap is active,
so a reference entry created early in a test session can silently disappear later.

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
  functionally (verified they load correctly), and now bounded by the 50-entry global cap
  (~100-250MB worst case) rather than unbounded, but still means multi-MB images per row on the
  History page. No image-resizing library (e.g. Pillow) is a dependency yet; would need one to
  fix properly. Noted as a possible follow-up, not fixed.

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
