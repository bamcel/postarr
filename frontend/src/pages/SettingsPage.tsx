// Settings: manage media servers (add/edit/test/delete) and ThePosterDB login.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  PlugZap,
  Star,
  Loader2,
  CheckCircle2,
  XCircle,
  KeyRound,
} from "lucide-react";
import { api, type ServerInput } from "../api/client";
import { useToast } from "../lib/toast";
import { ServerTypeBadge } from "../components/ui";
import type { ConnectionTest, Server, ServerType } from "../types";

const BLANK: ServerInput = {
  name: "",
  type: "jellyfin",
  base_url: "",
  token: "",
  is_default: false,
};

const URL_PLACEHOLDER: Record<ServerType, string> = {
  plex: "http://localhost:32400",
  jellyfin: "http://localhost:8096",
  emby: "http://localhost:8096",
};

const TOKEN_LABEL: Record<ServerType, string> = {
  plex: "Plex token (X-Plex-Token)",
  jellyfin: "API key",
  emby: "API key",
};

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <ServersSection />
        <PosterDBSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media servers
// ---------------------------------------------------------------------------

function ServersSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const serversQ = useQuery({ queryKey: ["servers"], queryFn: api.listServers });

  const [form, setForm] = useState<ServerInput>(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTest | null>(null);

  const reset = () => {
    setForm(BLANK);
    setEditingId(null);
    setTestResult(null);
  };

  const startEdit = (s: Server) => {
    setEditingId(s.id);
    setForm({ name: s.name, type: s.type, base_url: s.base_url, token: "", is_default: s.is_default });
    setTestResult(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editingId == null) return api.createServer(form);
      return api.updateServer(editingId, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.push("success", editingId == null ? "Server added." : "Server updated.");
      reset();
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.push("info", "Server removed.");
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r =
        editingId != null && form.token === ""
          ? await api.testServerSaved(editingId)
          : await api.testServerAdhoc(form);
      setTestResult(r);
      toast.push(r.ok ? "success" : "error", r.message);
    } catch (e) {
      toast.push("error", (e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const canSubmit = form.name.trim() && form.base_url.trim() && (editingId != null || form.token);

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="mb-1 text-lg font-semibold">Media servers</h2>
      <p className="mb-5 text-sm text-faint">
        Connect Plex, Jellyfin, or Emby. Tokens are encrypted before they're stored.
      </p>

      {/* Existing servers */}
      <div className="mb-6 space-y-2">
        {serversQ.data?.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-faint">
            No servers yet — add one below.
          </p>
        )}
        {serversQ.data?.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{s.name}</span>
                <ServerTypeBadge type={s.type} />
                {s.is_default && (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <Star className="size-3 fill-accent" /> default
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-faint">{s.base_url}</p>
            </div>
            <IconBtn title="Edit" onClick={() => startEdit(s)}>
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn
              title="Delete"
              danger
              onClick={() => {
                if (confirm(`Remove "${s.name}"?`)) deleteMut.mutate(s.id);
              }}
            >
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
        ))}
      </div>

      {/* Add / edit form */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <h3 className="mb-3 text-sm font-semibold">
          {editingId == null ? "Add a server" : "Edit server"}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Living Room Jellyfin"
            />
          </Field>
          <Field label="Type">
            <select
              className={inputCls}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ServerType })}
            >
              <option value="jellyfin">Jellyfin</option>
              <option value="plex">Plex</option>
              <option value="emby">Emby</option>
            </select>
          </Field>
          <Field label="Server URL">
            <input
              className={inputCls}
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder={URL_PLACEHOLDER[form.type]}
            />
          </Field>
          <Field label={TOKEN_LABEL[form.type]}>
            <input
              className={inputCls}
              type="password"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder={editingId != null ? "•••••• (leave blank to keep)" : ""}
            />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            className="size-4 accent-[var(--color-accent)]"
          />
          Use as default server
        </label>

        {testResult && (
          <div
            className={`mt-3 flex items-center gap-2 text-sm ${
              testResult.ok ? "text-accent" : "text-danger"
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {testResult.ok
              ? `${testResult.server_name ?? "Connected"}${
                  testResult.version ? ` · v${testResult.version}` : ""
                }`
              : testResult.message}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!canSubmit || saveMut.isPending}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editingId == null ? "Add server" : "Save changes"}
          </button>
          <button
            onClick={test}
            disabled={testing || !form.base_url.trim()}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-white disabled:opacity-50"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            Test connection
          </button>
          {editingId != null && (
            <button onClick={reset} className="px-3 py-2 text-sm text-faint hover:text-white">
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ThePosterDB credentials
// ---------------------------------------------------------------------------

function PosterDBSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const statusQ = useQuery({ queryKey: ["posterdb-status"], queryFn: api.posterdbStatus });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (statusQ.data?.email) setEmail(statusQ.data.email);
  }, [statusQ.data?.email]);

  const saveMut = useMutation({
    mutationFn: () => api.setPosterdbCredentials(email.trim(), password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posterdb-status"] });
      setPassword("");
      toast.push("success", "ThePosterDB credentials saved.");
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const loginMut = useMutation({
    mutationFn: api.posterdbLogin,
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["posterdb-status"] });
      toast.push(s.logged_in ? "success" : "error", s.message || (s.logged_in ? "Logged in." : "Login failed."));
    },
    onError: (e: Error) => toast.push("error", e.message),
  });

  const configured = statusQ.data?.configured;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <KeyRound className="size-5 text-accent" /> ThePosterDB account
      </h2>
      <p className="mb-5 text-sm text-faint">
        Required to search and download artwork. Your password is encrypted at rest and only sent to
        theposterdb.com.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email / username">
          <input
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={configured ? "•••••• (leave blank to keep)" : ""}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !email.trim()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
        <button
          onClick={() => loginMut.mutate()}
          disabled={loginMut.isPending || !configured}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-white disabled:opacity-50"
        >
          {loginMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          Test login
        </button>
        {statusQ.data?.logged_in && (
          <span className="flex items-center gap-1 text-sm text-accent">
            <CheckCircle2 className="size-4" /> Logged in
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small form helpers
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid size-9 place-items-center rounded-lg border border-border transition-colors ${
        danger ? "text-muted hover:border-danger hover:text-danger" : "text-muted hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
