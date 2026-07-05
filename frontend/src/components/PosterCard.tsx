// A poster tile: artwork on top, title/subtitle below, optional corner badge.
// Opens on a single click (and Enter for keyboard users) when `onOpen` is set.

import { useEffect, useState, type ReactNode } from "react";
import { Film, Tv } from "lucide-react";

interface PosterCardProps {
  image?: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  kind?: "movie" | "show";
  selected?: boolean;
  onOpen?: () => void;
}

export default function PosterCard({
  image,
  title,
  subtitle,
  badge,
  kind = "movie",
  selected,
  onOpen,
}: PosterCardProps) {
  const Placeholder = kind === "show" ? Tv : Film;
  // Many libraries have artwork records whose image files are missing on the
  // server; fall back to a clean placeholder instead of a broken-image glyph.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return (
    <div
      className={`group select-none ${onOpen ? "cursor-pointer" : ""}`}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.();
      }}
      title={title}
    >
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 transition-all duration-150 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-accent ${
          selected ? "ring-2 ring-accent" : "ring-white/5"
        }`}
      >
        {image && !failed ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-faint">
            <Placeholder className="size-10" />
          </div>
        )}

        {badge != null && (
          <span className="absolute right-2 top-2 grid min-w-6 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-black shadow">
            {badge}
          </span>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <span className="m-3 rounded-md bg-white/15 px-2 py-1 text-xs font-medium backdrop-blur">
            Open
          </span>
        </div>
      </div>

      {/* Text-shadow is a no-op over a solid background (library grid) but
          keeps these legible when a card sits over the vivid backdrop image
          on the item detail page's Seasons row. */}
      <div className="mt-2 px-0.5 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
        <p className="truncate text-sm font-medium text-white/90">{title}</p>
        {subtitle && <p className="truncate text-xs text-faint">{subtitle}</p>}
      </div>
    </div>
  );
}
