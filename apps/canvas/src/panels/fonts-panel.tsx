// SDK Phase 5 / panel-gallery pass — Fonts panel.
//
// Gallery shape: All / In use / Missing filter tabs over the
// fonts-in-use registry. The parse layer doesn't carry a font
// registry — fonts are referenced from runs + style defaults and the
// accessor dedups — so "All" ≡ "In use" today.
//
// W2.12 — "Missing" is now REAL: it filters on `FontSummary.isMissing`
// (true when the worker's font registry couldn't resolve the family
// to face bytes and the renderer substituted a fallback). Each row
// carries a status dot — green when resolved, red when missing — and
// the Replace action stays a seam until a substitute-font Operation
// ships.

import { useState } from "react";

import { ListRows, useCollection, type ListRowSpec } from "@paged-media/shell";
import type { FontSummary } from "@paged-media/client";

type FontFilter = "All" | "In use" | "Missing";

export function FontsPanel() {
  const items = useCollection<FontSummary>("fonts");
  const [filter, setFilter] = useState<FontFilter>("All");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-fonts-panel="loading"
      >
        Loading fonts…
      </div>
    );
  }

  const missingCount = items.filter((f) => f.isMissing).length;
  const filtered =
    filter === "Missing" ? items.filter((f) => f.isMissing) : items;

  const rows: ListRowSpec[] = filtered.map((f) => ({
    key: f.family,
    // The leading dot reads the resolution outcome: green = at least
    // one style resolved to face bytes, red = substituted fallback.
    // ("ready" maps to --status-approved in the kit's tone table.)
    dot: f.isMissing ? "error" : "ready",
    icon: "panel-fonts",
    primary: f.family,
    secondary: `${f.referenceCount} ref${f.referenceCount === 1 ? "" : "s"}${
      f.isMissing ? " · substituted" : ""
    }`,
    badge: f.isMissing ? { label: "missing", tone: "error" } : undefined,
  }));

  return (
    <div data-fonts-panel="ready">
      <div className="flex gap-1 px-3 pt-3">
        {(["All", "In use", "Missing"] as FontFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            data-font-filter={f}
            data-active={filter === f ? "true" : "false"}
            onClick={() => setFilter(f)}
            className="text-xs px-2 h-[24px] rounded-[6px] border inline-flex items-center gap-1"
            style={{
              borderColor:
                filter === f ? "var(--pg-primary)" : "var(--pg-border)",
              background:
                filter === f ? "var(--pg-primary-soft)" : "var(--pg-bg)",
              color: filter === f ? "var(--pg-primary)" : "var(--pg-muted-fg)",
            }}
          >
            {f}
            {f === "Missing" && missingCount > 0 && (
              <span
                data-missing-count
                className="text-[9.5px] font-semibold"
                style={{ color: "var(--status-error)" }}
              >
                {missingCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-fonts>
          No fonts in use.
        </div>
      ) : filter === "Missing" && missingCount === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground italic"
          data-fonts-missing-empty
        >
          No missing fonts — every referenced family resolved.
        </div>
      ) : (
        <div data-font-list>
          <ListRows rows={rows} />
        </div>
      )}
    </div>
  );
}
