# Postarr — session handoff

**Read this first in a new conversation.** For dev commands/architecture/gotchas see
[CLAUDE.md](CLAUDE.md); for the user-facing feature list see [README.md](README.md). This file
is just "what's the current state and what's left hanging" — update it as you go, don't let it
go stale.

## Right now

- Branch `main`, container `postarr` is **up and healthy** on `http://localhost:8000`
  (`docker compose ps` to confirm — it may have been stopped since).
- **Uncommitted changes in the working tree** (two bundled pieces of work, both verified working,
  neither committed yet):
  1. **Optimization pass** — removed dead fields (`PosterSet.author`, `PosterAsset.source_url`,
     `NormalizedLibrary.thumb`, `ApplyRequest.asset_id`, unused `"titlecard"` kind), library-item
     LIST endpoints no longer compute a per-item background ref (detail still does), a real bug
     fix (applying a logo said "Updated poster successfully"), `db.update_server` refactored,
     README rewritten to match current features, `CLAUDE.md` created (new, untracked).
  2. **Settings UI merge** — "ThePosterDB account" and "Artwork sources" are now one card
     (`ArtworkSourcesSection` in `frontend/src/pages/SettingsPage.tsx`, with `PosterDBFields` and
     `FanartTvdbFields` as sub-groups separated by a divider). Same two Save buttons/endpoints,
     just grouped visually.
  - **Action needed:** run `git status`/`git diff` to confirm this is still the pending diff, then
    commit it (the user tags checkpoints — ask if this should be `checkpoint-7` or just a plain
    commit; they've done both).

## Pending user request: push to GitHub

The user asked to commit and push to `https://github.com/bamcel/Postarr` (they typed it once with
a capital P, once lowercase — same repo, GitHub repo paths aren't case-sensitive). **Blocked on
auth**: `gh auth status` reports not logged in, and `git remote -v` is empty (no remote configured
yet). Next steps once picking this back up:
1. `gh auth login` (interactive — the user needs to do this themselves, or provide a token).
2. `git remote add origin https://github.com/bamcel/Postarr.git`
3. Commit pending work (see above), then `git push -u origin main`, and push tags if wanted
   (`git push --tags`).
Do **not** push without re-confirming with the user in the moment — pushing is a shared-state
action requiring fresh explicit go-ahead per the safety rules, even though they asked before.

## Checkpoint tag note

`checkpoint-6` was **reverted** earlier this session (`git reset --hard checkpoint-5` on `main`,
per user request) and is no longer an ancestor of `main` — it's a dangling, diverged tag. It still
exists (nothing was deleted) in case that theming/glass-panel/vivid-backdrop work is ever wanted
back, but don't assume it's part of current history. `checkpoint-1` through `checkpoint-5` are all
real ancestors of the current `main`.

## What the app can do (verified live against the user's real Emby)

Four artwork sources behind one panel per item: **ThePosterDB** (scraped, categorized search,
title→set drill-down, empty-result filtering, set-size counts), **Fanart.tv**, **TheTVDB**, and
**AniList** (looked up by the item's external ids, with a manual id/search override box). Apply
to poster/background/logo on Plex/Jellyfin/Emby, including a **Custom** target picker (any season,
Season 0/Specials included) and a **Manual** upload tab. Item detail shows the server's own clear-logo
art over a full-bleed backdrop. Full endpoint list and setup steps are in README.md — don't
duplicate that here, just note that all of it is live-verified, not just built.

## Known live gotchas (still true, see CLAUDE.md for the full list)

- The user's real Emby (`http://192.168.1.79:8096`) **goes offline/unreachable intermittently** —
  not a Postarr bug. If something "stops loading," check `/api/servers/{id}/test` before assuming
  code broke.
- Preview screenshots in this environment have been **flaky all session** (frequent timeouts with
  no console errors) — when that happens, verify via `preview_eval` DOM queries instead of fighting
  the screenshot tool.
- Git Bash on Windows mangles `docker exec`/`docker cp` paths starting with `/` — wrap remote
  commands in `sh -c '...'` or set `MSYS_NO_PATHCONV=1`.

## To resume

1. `cd C:\Users\bamcel\Documents\AppDesign\Postarr`
2. `git status` — confirm the diff described above is still there (or has been committed since).
3. `docker compose ps` — confirm the container is up; if not, `docker compose up -d --build`.
4. Ask the user what's next — likely: commit the pending diff, then the GitHub push above.
