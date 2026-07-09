// App chrome: a left sidebar (logo, nav, active-server picker) + routed content.

import { NavLink, Outlet } from "react-router-dom";
import { LibraryBig, History, Settings, Server as ServerIcon } from "lucide-react";
import { useServers } from "../lib/serverContext";
import { Logo, ServerTypeBadge } from "./ui";

const navItems = [
  { to: "/", label: "Libraries", icon: LibraryBig, end: true },
  { to: "/history", label: "History", icon: History, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export default function Layout() {
  const { servers, selectedId, setSelectedId } = useServers();

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/90 p-4 backdrop-blur-xl">
        <div className="px-2 py-3">
          <Logo />
        </div>

        <nav className="mt-4 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-elevated text-white"
                    : "text-muted hover:bg-surface-2 hover:text-white"
                }`
              }
            >
              <Icon className="size-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          <label className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">
            <ServerIcon className="size-3.5" /> Active server
          </label>
          {servers.length === 0 ? (
            <NavLink
              to="/settings"
              className="block rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted hover:border-accent hover:text-white"
            >
              Add a server →
            </NavLink>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedId != null &&
                (() => {
                  const s = servers.find((x) => x.id === selectedId);
                  return s ? (
                    <div className="flex items-center justify-between px-1">
                      <ServerTypeBadge type={s.type} />
                      <span className="truncate text-[11px] text-faint">{s.base_url}</span>
                    </div>
                  ) : null;
                })()}
            </div>
          )}
        </div>
      </aside>

      <main className="h-full flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
