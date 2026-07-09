// Shows the last few images applied to this item (per target: poster /
// background / logo) with a one-click revert. Every successful apply from
// any provider or Manual upload is recorded server-side, so this works
// regardless of where the image originally came from.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, History as HistoryIcon, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../lib/toast";
import type { ApplyHistoryEntry, ItemDetail } from "../types";

const TARGETS: { key: ApplyHistoryEntry["target"]; label: string }[] = [
  { key: "poster", label: "Poster" },
  { key: "background", label: "Background" },
  { key: "logo", label: "Logo" },
];

export default function HistoryPanel({ serverId, item }: { serverId: number; item: ItemDetail }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["apply-history", serverId, item.id],
    queryFn: () => api.getHistory(serverId, item.id),
  });

  async function revert(historyId: number) {
    setBusyId(historyId);
    try {
      const res = await api.revertHistory(historyId);
      toast.push(res.ok ? "success" : "error", res.message);
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["item-detail", serverId, item.id] }),
          queryClient.invalidateQueries({ queryKey: ["items", serverId] }),
          queryClient.invalidateQueries({ queryKey: ["apply-history", serverId, item.id] }),
        ]);
      }
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-faint">
        <Loader2 className="size-4 animate-spin" /> Loading history…
      </div>
    );
  }

  const entries = q.data ?? [];
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-faint">
        <HistoryIcon className="size-8" />
        <p className="text-sm">Nothing applied to this title yet through Postarr.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {TARGETS.map(({ key, label }) => {
        const forTarget = entries.filter((e) => e.target === key);
        if (forTarget.length === 0) return null;
        return (
          <section key={key}>
            <h3 className="mb-2 text-sm font-semibold">{label}</h3>
            <div className="grid grid-cols-3 gap-2">
              {forTarget.map((entry, i) => (
                <div key={entry.id} className="rounded-lg border border-border bg-surface-2 p-2">
                  <div
                    className={`overflow-hidden rounded bg-base ${key === "poster" ? "aspect-[2/3]" : "aspect-video"}`}
                  >
                    <img src={entry.thumb_url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-faint">{providerLabel(entry.provider)}</p>
                  <p className="truncate text-[10px] text-faint">{relativeTime(entry.applied_at)}</p>
                  {i === 0 ? (
                    <span className="mt-1 block rounded bg-accent/15 px-1.5 py-0.5 text-center text-[10px] font-medium text-accent">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={() => revert(entry.id)}
                      disabled={busyId === entry.id}
                      className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-elevated px-1.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-white disabled:opacity-60"
                    >
                      {busyId === entry.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                      Revert
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function providerLabel(name: string): string {
  return (
    {
      fanart: "Fanart.tv",
      tvdb: "TheTVDB",
      anilist: "AniList",
      mediux: "MediUX",
      posterdb: "ThePosterDB",
      manual: "Manual",
      url: "URL",
    }[name] ?? name
  );
}

// Stored as SQLite's datetime('now') — "YYYY-MM-DD HH:MM:SS", UTC, no
// timezone marker — so it needs help before Date.parse treats it as UTC.
function relativeTime(sqliteUtc: string): string {
  const then = Date.parse(sqliteUtc.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
