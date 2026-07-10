// Small shared presentational helpers.

import type { ReactNode } from "react";
import { Loader2, Clapperboard } from "lucide-react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Loader2 className="size-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="text-faint">{icon ?? <Clapperboard className="size-10" />}</div>
      <h3 className="text-lg font-medium text-muted">{title}</h3>
      {children && <div className="max-w-md text-sm text-faint">{children}</div>}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-md bg-accent text-black">
        <Clapperboard className="size-4" />
      </span>
      <span className="text-lg">
        Post<span className="text-emerald-400">arr</span>
      </span>
    </div>
  );
}

export function ServerTypeBadge({ type }: { type: string }) {
  return <span className="text-xs text-faint capitalize">{type}</span>;
}
