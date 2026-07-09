// Global apply history: every image applied to the active server, newest
// first, across every title — not just the one you happen to have open.
// The first (most recent) entry for a given item+target is "Current"; any
// earlier one can be reverted back to in one click.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History as HistoryIcon, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { useServers } from "../lib/serverContext";
import { useToast } from "../lib/toast";
import { EmptyState, Spinner } from "../components/ui";

const TARGET_LABEL: Record<string, string> = {
  poster: "Poster",
  background: "Background",
  logo: "Logo",
};

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

export default function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { selectedServer, isLoading: serversLoading } = useServers();
  const serverId = selectedServer?.id ?? null;
  const [busyId, setBusyId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["apply-history-global", serverId],
    queryFn: () => api.getHistory({ serverId: serverId!, limit: 100 }),
    enabled: serverId != null,
  });

  // Retention: a global 50-entry cap always applies server-side; this is the
  // optional extra day-based cutoff on top of it.
  const settingsQ = useQuery({ queryKey: ["history-settings"], queryFn: api.getHistorySettings });
  const [purgeDaysInput, setPurgeDaysInput] = useState("");
  useEffect(() => {
    if (settingsQ.data) setPurgeDaysInput(settingsQ.data.purge_days ? String(settingsQ.data.purge_days) : "");
  }, [settingsQ.data]);

  const saveSettingsMut = useMutation({
    mutationFn: () => api.setHistorySettings(Number(purgeDaysInput) || 0),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history-settings"] });
      toast.push("success", "Retention setting saved.");
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const [purging, setPurging] = useState(false);
  async function purgeNow() {
    const days = Number(purgeDaysInput) || 0;
    const msg =
      days > 0
        ? `Delete every history entry older than ${days} day${days === 1 ? "" : "s"}? Reverting to them won't be possible afterward — applied artwork on your server is unaffected.`
        : "Delete ALL history entries? Reverting to them won't be possible afterward — applied artwork on your server is unaffected.";
    if (!confirm(msg)) return;
    setPurging(true);
    try {
      const res = await api.purgeHistory(days);
      toast.push("success", `Purged ${res.purged} ${res.purged === 1 ? "entry" : "entries"}.`);
      await queryClient.invalidateQueries({ queryKey: ["apply-history-global", serverId] });
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setPurging(false);
    }
  }

  const entries = q.data ?? [];
  // Pure derivation (not a during-render mutation) so it's safe under
  // StrictMode's double-render: the first entry seen per item+target is
  // "Current", every later one for that pair is revertable.
  const currentIds = useMemo(() => {
    const seen = new Set<string>();
    const current = new Set<number>();
    for (const e of entries) {
      const key = `${e.item_id}:${e.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        current.add(e.id);
      }
    }
    return current;
  }, [entries]);

  async function revert(id: number) {
    setBusyId(id);
    try {
      const res = await api.revertHistory(id);
      toast.push(res.ok ? "success" : "error", res.message);
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["apply-history-global", serverId] }),
          queryClient.invalidateQueries({ queryKey: ["item-detail", serverId] }),
          queryClient.invalidateQueries({ queryKey: ["items", serverId] }),
        ]);
      }
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (serversLoading) return <Spinner label="Loading…" />;

  if (!selectedServer) {
    return (
      <div className="grid h-full place-items-center p-8">
        <EmptyState title="No media server yet">
          Add your Plex, Jellyfin, or Emby server in Settings to start browsing your libraries.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 pb-5 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <HistoryIcon className="size-6 text-accent" /> History
            </h1>
            <p className="text-sm text-faint">
              Everything applied to {selectedServer.name}, most recent first — revert any of them
              in one click. Up to 50 entries are always kept.
            </p>
          </div>

          <div className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Auto-purge after (days, 0 = off)
              </span>
              <input
                type="number"
                min={0}
                value={purgeDaysInput}
                onChange={(e) => setPurgeDaysInput(e.target.value)}
                placeholder="0"
                className="w-32 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={() => saveSettingsMut.mutate()}
              disabled={saveSettingsMut.isPending}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {saveSettingsMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
            <button
              onClick={purgeNow}
              disabled={purging}
              title="Purge now, using the days value above (0 purges everything)"
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            >
              {purging ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Purge now
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {q.isLoading && <Spinner label="Loading history…" />}
        {q.isError && <EmptyState title="Couldn't load history">{(q.error as Error).message}</EmptyState>}
        {q.data && entries.length === 0 && (
          <EmptyState title="Nothing applied yet">
            Apply a poster, background, or logo to a title and it'll show up here.
          </EmptyState>
        )}

        {entries.length > 0 && (
          <div className="mx-auto max-w-3xl space-y-2">
            {entries.map((e) => {
              const isCurrent = currentIds.has(e.id);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2"
                >
                  <button
                    onClick={() => navigate(`/server/${e.server_id}/item/${e.item_id}`)}
                    className="shrink-0 overflow-hidden rounded bg-surface-2"
                    title="Open this title"
                  >
                    <img
                      src={e.thumb_url}
                      alt=""
                      className={`h-16 object-cover ${e.target === "poster" ? "aspect-[2/3]" : "aspect-video"}`}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{e.item_title || e.item_id}</p>
                    <p className="truncate text-xs text-faint">
                      {TARGET_LABEL[e.target] ?? e.target} · {providerLabel(e.provider)} ·{" "}
                      {relativeTime(e.applied_at)}
                    </p>
                  </div>

                  {isCurrent ? (
                    <span className="shrink-0 rounded bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={() => revert(e.id)}
                      disabled={busyId === e.id}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-white disabled:opacity-60"
                    >
                      {busyId === e.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      Revert
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
