# Postarr — handoff

**Read this first, on any device, in any new conversation.** This file is the single source of
truth for "what's the current state and what's left hanging." For dev commands, architecture,
and hard-won gotchas see [CLAUDE.md](CLAUDE.md); for the user-facing feature list and setup
steps see [README.md](README.md). Keep this file current — update it as you go, don't let it
go stale, and don't duplicate what's already in CLAUDE.md/README.md.

## Right now

- Repo: **`https://github.com/bamcel/postarr`**, branch `main`. Pull before starting work on a
  new device — this file is only accurate as of its last commit.
- Container `postarr` is normally **up and healthy** on `http://localhost:7979`
  (`docker compose ps` to confirm on whichever machine you're on — it may be stopped).
- **Standing instruction**: rebuild the container (`docker compose up -d --build`) after every
  completed change, automatically, without being asked. Commit + push when the user says so
  (they ask explicitly; don't assume).
- No open pending diff as of the last commit to this file — `git status` should be clean.
- **`checkpoint-1` through `checkpoint-6` git tags exist only on the original dev machine** —
  never pushed to GitHub (confirmed: `git ls-remote --tags origin` returns nothing). A fresh
  clone on another device won't have them. Don't push them unilaterally; the user has twice been
  asked and twice said to leave them local-only.
- **The SQLite database (`/data` in the container — server configs, encrypted credentials, apply
  history + images) is gitignored and lives in the `postarr-data` Docker volume, not in git —
  and this is intentional, not a gap.** Every install (a new dev machine, an end user's Docker/
  Unraid deployment) is expected to configure its own media server(s) and API keys from scratch
  via Settings. **Don't build or suggest volume-migration tooling** — a fresh install having zero
  configured servers is the correct, expected first-run state, not something to fix.

## What the app can do (all verified live against the user's real Emby unless noted)

**Five artwork sources** behind one panel per item: ThePosterDB (scraped, categorized search,
title→set drill-down, empty-result filtering, set-size counts), Fanart.tv, TheTVDB, AniList, and
MediUX (scraped, no API/login needed — see CLAUDE.md for its quirks). Apply to poster/background/
logo, with a **Custom** target picker (any season, Season 0/Specials, or — on a collection's
page — any member movie/show) and a **Manual** upload tab (file or URL). Every provider's
search/id box has a link-out icon to open that item directly on the source site.

**Collections**: a virtual **Collections** library lists every collection on the server; each
collection's detail page shows its members with drill-through to their own full pages. A
**Group Collections** toggle on regular library views replaces a collection's member movies/
shows with one tile — built for Emby/Jellyfin *and* Plex, but **only live-verified on
Emby/Jellyfin**; there's no Plex server in this dev environment, so `PlexClient` code
(collections, grouping, everything Plex) is written to mirror the Jellyfin pattern but has never
actually been run. Treat anything Plex-specific as unverified until a real Plex server tests it.

**Apply history + revert**: every successful apply (any provider, or manual upload) is recorded
— bytes saved to `data/history/`, indexed in SQLite. A global **History** page (sidebar) groups
entries into one tile per title+target (current image + a count badge); click a tile to open a
modal listing every version with one-click **Revert**. Retention is fully user-configurable from
that page: how many entries to keep (`history_max_entries`, default 50 — lowering it prunes
immediately) and an optional auto-purge age in days (`history_purge_days`, 0 = disabled — only
touches entries *older than* the threshold, count is irrelevant to it), plus a manual **Purge
now** button. The whole apply→history→revert→purge chain has been round-tripped against the
real Emby multiple times, byte-for-byte verified.

**New-item detection**: each library remembers when you last visited it and flags titles added
since then that still have no poster — a banner plus a "NEW" badge, so growing libraries don't
quietly accumulate gaps.

Settings is tabbed (Server Setup / Database Connection); the sidebar and artwork panel use a
frosted-glass look (blurred backdrop bleeding behind them, matching Emby's own UI, darkened to
match a reference screenshot).

Deployment: a GitHub Action publishes the Docker image to GHCR (`ghcr.io/bamcel/postarr:latest`)
on every push to `main`; an Unraid Docker template (`postarr.xml`) points at it.

Full endpoint list, setup steps, and feature descriptions are in README.md — this section is a
summary, not the source of truth.

## Known gotchas worth knowing before you start (see CLAUDE.md for the full, precise list)

- **The user's real Emby (`http://192.168.1.79:8096`) goes offline/unreachable intermittently**
  — not a Postarr bug. Check `/api/servers/{id}/test` before assuming code broke.
- **No Plex server exists in this dev environment.** Everything Plex-specific in the code is
  unverified — written carefully to mirror the Jellyfin/Emby pattern, but never actually run.
- **Preview screenshots in this environment are flaky** (frequent timeouts/UnknownVizError, no
  console errors) — verify via `preview_eval` DOM queries / computed styles / canvas pixel
  sampling instead of fighting the screenshot tool. This has bitten every session so far.
- **Git Bash on Windows mangles `docker exec`/`docker cp` paths** starting with `/` — wrap
  remote commands in `sh -c '...'` or set `MSYS_NO_PATHCONV=1`.
- **Unraid (bind-mount) deployments now work** — fixed a `PermissionError` on `/data/secret.key`
  that only showed up on a bind mount (never on docker-compose's named volume). The container
  now starts as root, `docker-entrypoint.sh` chowns `/data` at runtime, then drops to uid 10001
  via `setpriv` before running the app. See CLAUDE.md's gotchas for the full explanation.
- History thumbnails serve full-resolution images, not resized — bounded by the entry cap now,
  but still no image-resizing dependency (e.g. Pillow) if that's ever worth fixing properly.

## Ideas floated but not built (suggested, not requested — confirm before building)

- A "missing artwork" report/dashboard covering a whole library at once (new-item detection only
  flags what's changed since your last visit, not a full audit).
- Backend caching for the collection-membership lookup (`_collapse_boxsets`/`_collapse_collections`
  re-fetch every BoxSet/collection + its children on every grouped library listing — offered,
  user said it's fine for now since their collection count is small).
- Resize History thumbnails server-side instead of serving full-res.

## To resume on a new device

1. `git clone https://github.com/bamcel/postarr.git` (or `git pull` if already cloned), then
   `cd postarr`.
2. Read this file fully, then skim CLAUDE.md for anything code-specific to what you're about to
   touch.
3. `docker compose up -d --build` to get a local instance running (or `docker compose ps` first
   if one might already be up).
4. On a genuinely new machine, Settings will be empty (by design — see above) until the user
   adds their media server + ThePosterDB login there. That's expected, not a problem to solve.
5. Ask the user what's next — don't assume the "ideas not yet built" list above is a to-do list;
   it's just context.
