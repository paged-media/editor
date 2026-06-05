// Cockpit — the bottom page-thumbnail filmstrip (kit canvas.jsx
// ThumbnailRail). REAL: live page snapshots grouped into spreads,
// labels are page ranges, click navigates (the app supplies the
// camera-fit via `onNavigate` — the layout math lives app-side).

import { useMemo, useState } from "react";

import { Icon } from "../../icons";
import { useDocument } from "../../state/document-context";
import { useCollection } from "../../catalog/use-collection";
import type { SpreadSummary } from "@paged-media/client";
import { groupSpreads } from "../spread-grouping";
import { navigateToPages } from "../cockpit-navigation";

export function ThumbnailRail() {
  const { handle, snapshots } = useDocument();
  const spreads = useCollection<SpreadSummary>("spreads");
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(
    () => (handle ? groupSpreads(handle.pageIds, spreads) : []),
    [handle, spreads],
  );

  const scrollBy = (dir: -1 | 1) => {
    const el = document.querySelector<HTMLElement>("[data-thumbnail-strip]");
    el?.scrollBy({ left: dir * 260, behavior: "smooth" });
  };

  return (
    <div
      data-thumbnail-rail
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 104,
        padding: "0 14px",
        background: "var(--chrome-panel-bg)",
        borderTop: "1px solid var(--chrome-border)",
        flexShrink: 0,
      }}
    >
      <RailArrow name="ui-chevron-left" onClick={() => scrollBy(-1)} />
      <div
        data-thumbnail-strip
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 14,
          overflowX: "auto",
          height: "100%",
          paddingTop: 12,
          scrollbarWidth: "none",
        }}
      >
        {entries.length === 0 ? (
          <span className="pg-ui-xs" style={{ opacity: 0.6 }}>
            Open a document to navigate its spreads.
          </span>
        ) : (
          entries.map((e) => {
            const sel = selected === e.key;
            return (
              <button
                key={e.key}
                type="button"
                data-thumbnail-spread={e.key}
                data-selected={sel || undefined}
                onClick={() => {
                  setSelected(e.key);
                  navigateToPages(e.pageIndices);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    gap: 1,
                    padding: sel ? 1 : 0,
                    border: sel
                      ? "2px solid var(--pg-primary)"
                      : "1px solid var(--pg-border)",
                    borderRadius: 2,
                    background: "var(--pg-bg)",
                  }}
                >
                  {e.pageIndices.slice(0, 2).map((i) => {
                    const url = handle
                      ? snapshots.get(handle.pageIds[i])
                      : undefined;
                    return url ? (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        draggable={false}
                        style={{
                          width: 33,
                          height: 48,
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <span
                        key={i}
                        style={{
                          width: 33,
                          height: 48,
                          background: "var(--pg-muted)",
                          display: "block",
                        }}
                      />
                    );
                  })}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 10.5,
                    color: sel ? "var(--pg-primary)" : "var(--pg-muted-fg)",
                    fontWeight: sel ? 600 : 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.name === "Cover" ? "Cover" : e.range}
                </span>
              </button>
            );
          })
        )}
      </div>
      <RailArrow name="ui-chevron-right" onClick={() => scrollBy(1)} />
    </div>
  );
}

function RailArrow({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "1px solid var(--pg-border)",
        background: "var(--pg-bg)",
        color: "var(--chrome-icon)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={name} size={15} />
    </button>
  );
}
