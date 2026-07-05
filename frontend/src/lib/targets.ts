// Builds the list of places an image can be applied to for a given item:
// its poster, its background, and each season's poster (including Season 0 /
// Specials). Shared by ManualUpload and the "Custom" placement picker so an
// image from any source can be pointed at any target, not just its auto-
// detected one.

import type { ItemDetail } from "../types";

export interface ApplyTarget {
  label: string;
  itemId: string;
  target: "poster" | "background";
}

export function buildApplyTargets(item: ItemDetail): ApplyTarget[] {
  const base: ApplyTarget[] = [
    { label: "Poster", itemId: item.id, target: "poster" },
    { label: "Background", itemId: item.id, target: "background" },
  ];
  const seasons: ApplyTarget[] = item.seasons.map((s) => ({
    label: `${s.title || `Season ${s.index}`}${
      s.index === 0 && !/special/i.test(s.title) ? " (Specials)" : ""
    } — poster`,
    itemId: s.id,
    target: "poster",
  }));
  return [...base, ...seasons];
}
