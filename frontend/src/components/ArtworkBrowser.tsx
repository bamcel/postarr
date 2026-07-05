// Browses one API-based provider's artwork (Fanart.tv / TheTVDB / AniList) for
// the current item, grouped into Posters / Backgrounds / Banners / Logos.
// Poster + background are applyable now; banners/logos are shown (view-only).

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, ExternalLink, ImageOff } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../lib/toast";
import CustomTargetButton from "./CustomTargetButton";
import type { ArtworkItem, ArtworkType, ItemDetail } from "../types";

const TYPE_ORDER: ArtworkType[] = ["poster", "background", "banner", "logo"];
const TYPE_LABEL: Record<ArtworkType, string> = {
  poster: "Posters",
  background: "Backgrounds",
  banner: "Banners",
  logo: "Logos",
};

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

  const q = useQuery({
    queryKey: ["artwork", provider, serverId, item.id],
    queryFn: () => api.getArtwork(provider, serverId, item.id),
    staleTime: 5 * 60_000,
  });

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

  async function apply(art: ArtworkItem, target: "poster" | "background", targetId: string, key: string) {
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

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-faint">
        <Loader2 className="size-4 animate-spin" /> Loading artwork…
      </div>
    );
  }
  if (q.isError) {
    return <p className="py-6 text-sm text-danger">{(q.error as Error).message}</p>;
  }

  // Provider returned a friendly message (missing key / id / nothing found).
  const message = q.data?.message;
  if (message) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <AlertCircle className="size-8 text-amber-400" />
        <p className="text-sm text-muted">{message}</p>
      </div>
    );
  }
  if (types.length === 0 || !active) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-faint">
        <ImageOff className="size-8" />
        <p className="text-sm">No artwork found for this title on {providerLabel(provider)}.</p>
      </div>
    );
  }

  const items = byType.get(active) ?? [];
  const cols = active === "poster" ? "grid-cols-2" : "grid-cols-1";

  return (
    <div>
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
                  ) : (
                    <a
                      href={art.source_url ?? art.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded bg-elevated px-2 py-1 text-[11px] text-muted hover:text-white"
                      title="Applying banners/logos isn't wired up yet — open the source"
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
