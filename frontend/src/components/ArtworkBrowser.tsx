// Browses one API-based provider's artwork (Fanart.tv / TheTVDB / AniList) for
// the current item, grouped into Posters / Backgrounds / Banners / Logos.
// Poster, background, and logo are applyable; banners are shown (view-only) —
// no media server we support has a banner-upload endpoint.
//
// A small id/search box lets you override the auto-detected lookup. It's
// pre-filled from the item's external_ids when one's known (from the media
// server's own API) — so it auto-populates and searches on its own when an
// id is available, and only falls back to requiring a manual id/search term
// when none is.

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, ExternalLink, ImageOff, Search } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../lib/toast";
import CustomTargetButton from "./CustomTargetButton";
import type { ArtworkItem, ArtworkType, ImageTarget, ItemDetail } from "../types";

const TYPE_ORDER: ArtworkType[] = ["poster", "background", "banner", "logo"];
const TYPE_LABEL: Record<ArtworkType, string> = {
  poster: "Posters",
  background: "Backgrounds",
  banner: "Banners",
  logo: "Logos",
};

function defaultIdFor(provider: string, item: ItemDetail): string {
  if (provider === "fanart") {
    return (item.type === "movie" ? item.external_ids.tmdb ?? item.external_ids.imdb : item.external_ids.tvdb) ?? "";
  }
  if (provider === "tvdb") return item.external_ids.tvdb ?? "";
  if (provider === "anilist") return item.external_ids.anilist ?? "";
  return "";
}

function idPlaceholder(provider: string, item: ItemDetail): string {
  if (provider === "fanart") return item.type === "movie" ? "TMDB or IMDb id…" : "TVDB id…";
  if (provider === "tvdb") return "TVDB id…";
  if (provider === "anilist") return "AniList id or title…";
  return "id…";
}

export default function ArtworkBrowser({
  provider,
  serverId,
  item,
}: {
  provider: string;
  serverId: number;
  item: ItemDetail;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState<ArtworkType | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // The id/search box: pre-filled with whatever id is already known (from the
  // server's own API); typing + submitting sets an explicit override that
  // replaces auto-detection for this lookup.
  const [idInput, setIdInput] = useState(() => defaultIdFor(provider, item));
  const [override, setOverride] = useState<string | undefined>(undefined);
  useEffect(() => {
    setIdInput(defaultIdFor(provider, item));
    setOverride(undefined);
  }, [provider, item.id]);

  const q = useQuery({
    queryKey: ["artwork", provider, serverId, item.id, override],
    queryFn: () => api.getArtwork(provider, serverId, item.id, override),
    staleTime: 5 * 60_000,
  });

  const submitId = (e: FormEvent) => {
    e.preventDefault();
    setOverride(idInput.trim() || undefined);
  };

  const byType = useMemo(() => {
    const map = new Map<ArtworkType, ArtworkItem[]>();
    for (const a of q.data?.items ?? []) {
      const arr = map.get(a.type) ?? [];
      arr.push(a);
      map.set(a.type, arr);
    }
    return map;
  }, [q.data]);

  const types = TYPE_ORDER.filter((t) => (byType.get(t)?.length ?? 0) > 0);
  const active = activeType && types.includes(activeType) ? activeType : types[0] ?? null;
  const seasonByNumber = (n?: number | null) =>
    n == null ? undefined : item.seasons.find((s) => s.index === n);

  async function apply(art: ArtworkItem, target: ImageTarget, targetId: string, key: string) {
    setBusyKey(key);
    try {
      const res = await api.applyPoster({
        server_id: serverId,
        item_id: targetId,
        target,
        provider: art.provider,
        download_url: art.download_url,
      });
      toast.push(res.ok ? "success" : "error", res.message);
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["item-detail", serverId, item.id] });
        await queryClient.invalidateQueries({ queryKey: ["items", serverId] });
      }
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  // The search/id box always renders (even on error/empty) — that's exactly
  // when a manual id is most useful.
  const searchBar = (
    <form onSubmit={submitId} className="relative mb-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        value={idInput}
        onChange={(e) => setIdInput(e.target.value)}
        placeholder={idPlaceholder(provider, item)}
        className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
      />
    </form>
  );

  let body: ReactNode;
  if (q.isLoading) {
    body = (
      <div className="flex items-center gap-2 py-8 text-sm text-faint">
        <Loader2 className="size-4 animate-spin" /> Loading artwork…
      </div>
    );
  } else if (q.isError) {
    body = <p className="py-6 text-sm text-danger">{(q.error as Error).message}</p>;
  } else if (q.data?.message) {
    // Provider returned a friendly message (missing id / key / nothing found).
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <AlertCircle className="size-8 text-amber-400" />
        <p className="text-sm text-muted">{q.data.message}</p>
      </div>
    );
  } else if (types.length === 0 || !active) {
    body = (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-faint">
        <ImageOff className="size-8" />
        <p className="text-sm">No artwork found for this title on {providerLabel(provider)}.</p>
      </div>
    );
  } else {
    const items = byType.get(active) ?? [];
    const cols = active === "poster" ? "grid-cols-2" : "grid-cols-1";
    body = (
      <>
        {/* type tabs */}
        <div className="mb-3 flex flex-wrap gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active === t ? "bg-accent text-black" : "bg-surface-2 text-muted hover:text-white"
              }`}
            >
              {TYPE_LABEL[t]}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  active === t ? "bg-black/20" : "bg-black/30 text-faint"
                }`}
              >
                {byType.get(t)?.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className={`grid gap-3 ${cols}`}>
          {items.map((art) => {
            const season = seasonByNumber(art.season_number);
            return (
              <div key={art.id} className="rounded-lg border border-border bg-surface-2 p-2">
                <ArtImg art={art} />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-faint">
                    {[art.lang, art.likes != null ? `♥ ${art.likes}` : null].filter(Boolean).join(" · ") || " "}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {art.applyable && art.type === "poster" && season ? (
                      <ApplyBtn
                        label={`→ S${art.season_number}`}
                        busy={busyKey === `s-${art.id}`}
                        onClick={() => apply(art, "poster", season.id, `s-${art.id}`)}
                      />
                    ) : art.applyable && art.type === "poster" ? (
                      <ApplyBtn
                        label="Poster"
                        busy={busyKey === `p-${art.id}`}
                        onClick={() => apply(art, "poster", item.id, `p-${art.id}`)}
                      />
                    ) : art.applyable && art.type === "background" ? (
                      <ApplyBtn
                        label="Background"
                        busy={busyKey === `b-${art.id}`}
                        onClick={() => apply(art, "background", item.id, `b-${art.id}`)}
                      />
                    ) : art.applyable && art.type === "logo" ? (
                      <ApplyBtn
                        label="Logo"
                        busy={busyKey === `l-${art.id}`}
                        onClick={() => apply(art, "logo", item.id, `l-${art.id}`)}
                      />
                    ) : (
                      <a
                        href={art.source_url ?? art.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-elevated px-2 py-1 text-[11px] text-muted hover:text-white"
                        title="Applying banners isn't wired up yet (no media server we support has a banner-upload endpoint) — open the source"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    )}
                    {art.applyable && (
                      <CustomTargetButton
                        item={item}
                        busy={busyKey?.includes(art.id) ?? false}
                        onPick={(target, targetId, label) =>
                          apply(art, target, targetId, `c-${art.id}-${targetId}-${target}-${label}`)
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div>
      {searchBar}
      {body}
    </div>
  );
}

function ArtImg({ art }: { art: ArtworkItem }) {
  const [failed, setFailed] = useState(false);
  const shape =
    art.type === "poster"
      ? "aspect-[2/3] object-cover"
      : art.type === "banner"
        ? "aspect-[16/5] object-cover"
        : art.type === "logo"
          ? "aspect-video object-contain p-2"
          : "aspect-video object-cover";
  if (failed) {
    return <div className={`grid w-full place-items-center rounded bg-base text-faint ${shape}`}><ImageOff className="size-6" /></div>;
  }
  return (
    <img
      src={art.thumb_url}
      alt={art.title ?? art.type}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`w-full rounded bg-base ${shape}`}
    />
  );
}

function ApplyBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1 rounded bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
    >
      {busy && <Loader2 className="size-3 animate-spin" />}
      {label}
    </button>
  );
}

function providerLabel(name: string): string {
  return { fanart: "Fanart.tv", tvdb: "TheTVDB", anilist: "AniList" }[name] ?? name;
}
