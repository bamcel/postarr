// Item detail: a cinematic hero (blurred backdrop, large poster, metadata) with
// a seasons row, and the ThePosterDB panel docked on the right for swapping art.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api, imageUrl } from "../api/client";
import PosterCard from "../components/PosterCard";
import ArtworkPanel from "../components/ArtworkPanel";
import { Spinner, EmptyState } from "../components/ui";

export default function ItemDetailPage() {
  const navigate = useNavigate();
  const { serverId: serverIdParam, itemId } = useParams();
  const serverId = Number(serverIdParam);
  const [prefill, setPrefill] = useState<{ term: string; nonce: number }>();

  const detailQ = useQuery({
    queryKey: ["item-detail", serverId, itemId],
    queryFn: () => api.getItemDetail(serverId, itemId!),
    enabled: Number.isFinite(serverId) && !!itemId,
  });

  const item = detailQ.data;
  const backdrop = imageUrl(serverId, item?.background);
  const poster = imageUrl(serverId, item?.poster);

  // Auto-run the artwork search for this title when it loads (once per item).
  useEffect(() => {
    if (item?.title) setPrefill({ term: item.title, nonce: Date.now() });
  }, [item?.id, item?.title]);

  return (
    <div className="flex h-full">
      {/* Left: hero + seasons */}
      <div className="relative h-full flex-1 overflow-y-auto">
        {/* Blurred backdrop */}
        <div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden">
          {backdrop && (
            <img src={backdrop} alt="" className="h-full w-full scale-105 object-cover blur-sm" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-base/40 via-base/70 to-base" />
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-5 top-5 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/70"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="relative z-[1] px-8 pb-10 pt-16">
          {detailQ.isLoading && <Spinner label="Loading…" />}
          {detailQ.isError && (
            <EmptyState title="Couldn't load this title">
              {(detailQ.error as Error).message}
            </EmptyState>
          )}

          {item && (
            <>
              <div className="flex flex-col gap-6 sm:flex-row">
                {/* Poster */}
                <div className="w-44 shrink-0 sm:w-56">
                  <div className="aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 shadow-2xl shadow-black/50 ring-1 ring-white/10">
                    {poster ? (
                      <img src={poster} alt={item.title} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </div>

                {/* Metadata */}
                <div className="min-w-0 flex-1 pt-2">
                  <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{item.title}</h1>
                  <p className="mt-2 text-sm text-muted">
                    {item.type === "show"
                      ? `${item.season_count ?? item.seasons.length} Season${
                          (item.season_count ?? item.seasons.length) === 1 ? "" : "s"
                        }`
                      : item.year}
                  </p>

                  <div className="mt-5 flex items-center gap-3">
                    <button
                      onClick={() => detailQ.refetch()}
                      className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-white/40 hover:text-white"
                      title="Refresh from server"
                    >
                      <RefreshCw className={`size-4 ${detailQ.isFetching ? "animate-spin" : ""}`} /> Refresh
                    </button>
                  </div>

                  {item.summary && (
                    <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
                      {item.summary}
                    </p>
                  )}
                </div>
              </div>

              {/* Seasons */}
              {item.seasons.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-4 text-lg font-semibold">Seasons</h2>
                  <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                    {item.seasons.map((s) => (
                      <PosterCard
                        key={s.id}
                        image={imageUrl(serverId, s.poster)}
                        title={s.title}
                        subtitle={s.index != null ? `Season ${s.index}` : undefined}
                        kind="show"
                        badge={s.episode_count ?? undefined}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: artwork module (docked on md+; narrower on smaller screens) */}
      <div className="hidden h-full w-80 shrink-0 md:block xl:w-[380px]">
        {item && <ArtworkPanel serverId={serverId} item={item} prefill={prefill} />}
      </div>
    </div>
  );
}
