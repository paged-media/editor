// SDK Phase 5 / panel-gallery pass — Fonts panel.
//
// Gallery shape: All / In use / Missing filter tabs over the
// fonts-in-use registry. The parse layer doesn't carry a font
// registry — fonts are referenced from runs + style defaults and
// the accessor dedups — so "All" ≡ "In use" today and "Missing"
// is an honest seam: FontSummary has no missing/embedded flag yet
// (engine gap 4), and the Replace action waits on the same.

import { useState } from "react";

import { ListRows, useCollection } from "@paged-media/shell";
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
            className="text-xs px-2 h-[24px] rounded-[6px] border"
            style={{
              borderColor:
                filter === f ? "var(--pg-primary)" : "var(--pg-border)",
              background:
                filter === f ? "var(--pg-primary-soft)" : "var(--pg-bg)",
              color: filter === f ? "var(--pg-primary)" : "var(--pg-muted-fg)",
            }}
          >
            {f}
          </button>
        ))}
      </div>
      {filter === "Missing" ? (
        <div
          className="p-3 text-xs text-muted-foreground italic"
          data-fonts-missing-seam
        >
          Missing-font detection awaits the engine&rsquo;s font status flag;
          every listed font is referenced by the document.
        </div>
      ) : items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-fonts>
          No fonts in use.
        </div>
      ) : (
        <div data-font-list>
          <ListRows
            rows={items.map((f) => ({
              key: f.family,
              icon: "panel-fonts",
              primary: f.family,
              secondary: `${f.referenceCount} ref${
                f.referenceCount === 1 ? "" : "s"
              }`,
            }))}
          />
        </div>
      )}
    </div>
  );
}
