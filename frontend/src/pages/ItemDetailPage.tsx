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
  const logo = imageUrl(serverId, item?.logo);

  // Auto-run the artwork search for this title when it loads (once per item).
  useEffect(() => {
    if (item?.title) setPrefill({ term: item.title, nonce: Date.now() });
  }, [item?.id, item?.title]);

  return (
    <div className="flex h-full">
      {/* Raw backdrop image only: fixed to the viewport (not just the hero
          column) so it extends behind the sidebar and artwork panel too, like
          Emby's own detail page — those panels are translucent + backdrop-
          blur, so it shows through them blurred. -z-10 keeps it behind all
          normal-flow content without needing z-index bumps elsewhere. Kept
          separate from the darkening gradients below: those are tuned to fade
          in from the hero column's own left edge (behind the poster/title),
          so if they lived in this viewport-wide layer they'd paint solid dark
          under the actual sidebar instead — defeating the blur-through. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {backdrop && <img src={backdrop} alt="" className="h-full w-full object-cover" />}
      </div>

      {/* Left: hero + seasons */}
      <div className="h-full flex-1 overflow-y-auto">
        {/* min-h-full lets this wrapper be at least a viewport tall but grow to
            the full scrolled content height. The darkening layer below is
            absolute inset-0 against THIS wrapper, so it covers every season row
            — not just the first viewport. (An absolute inset-0 sized against the
            scroll container itself only spans one visible viewport and scrolls
            away, leaving multi-season shows showing the raw, undarkened backdrop
            at the bottom.) */}
        <div className="relative min-h-full">
          {/* Darkening gradients: scoped to just the hero column (not the fixed
              image above) for text contrast — a uniform dark wash, with extra
              darkening on the left (behind the poster/title/logo) and at the
              bottom (behind the seasons row). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 bg-gradient-to-r from-base/95 via-base/60 via-50% to-transparent to-90%" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-50% to-base/85" />
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

                {/* Metadata — a text-shadow (not just the gradient) keeps this
                    legible over a vivid/bright backdrop image, since the exact
                    gradient fade point can't account for every image. */}
                <div className="min-w-0 flex-1 pt-2 [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">
                  {logo ? (
                    <img
                      src={logo}
                      alt={item.title}
                      className="max-h-24 max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:max-h-28"
                    />
                  ) : (
                    <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{item.title}</h1>
                  )}
                  <p className="mt-2 text-sm text-white/70">
                    {item.type === "show"
                      ? `${item.season_count ?? item.seasons.length} Season${
                          (item.season_count ?? item.seasons.length) === 1 ? "" : "s"
                        }`
                      : item.type === "collection"
                        ? "Collection"
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
                    <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/80">
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

              {/* Collection members — each is a full library item with its own
                  detail page/artwork panel, so cards navigate there rather than
                  editing inline (unlike seasons, which have no page of their own). */}
              {item.members.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-4 text-lg font-semibold">Titles in this collection</h2>
                  <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                    {item.members.map((m) => (
                      <PosterCard
                        key={m.id}
                        image={imageUrl(serverId, m.poster)}
                        title={m.title}
                        subtitle={m.year ? String(m.year) : undefined}
                        kind={m.type}
                        onOpen={() => navigate(`/server/${serverId}/item/${m.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {/* Right: artwork module (docked on md+; narrower on smaller screens) */}
      <div className="hidden h-full w-80 shrink-0 md:block xl:w-[380px]">
        {item && <ArtworkPanel serverId={serverId} item={item} prefill={prefill} />}
      </div>
    </div>
  );
}
