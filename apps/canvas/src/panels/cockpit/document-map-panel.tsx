// Cockpit — Document Map (the kit's design/review-mode LEFT panel:
// ui_kits/editor/left-panels.jsx DocumentMap + Health footer).
//
// REAL: the spread tree (pages grouped by walking the `spreads`
// collection in document order — SpreadSummary carries pageCount but
// not page membership, so consumption order stands in until the
// engine exposes it), live page thumbnails, search, click→fit
// camera, and the health footer's document metrics + PDF/X-4
// readiness. SEAMS: named sections, per-section status chips and
// "Add section" await the engine's sections collection + the
// collaboration backend.

import { useMemo, useState } from "react";

import {
  Icon,
  StatusPill,
  useCamera,
  useCollection,
  useDocument,
  useDocumentMeta,
  useDocumentStats,
  type PanelProps,
} from "@paged-media/shell";
import type { LinkSummary, PageId, SpreadSummary } from "@paged-media/client";

import { documentBounds, layoutPages, fitCamera } from "../../ui/layout";
import { useAnimatedCamera } from "../../ui/useAnimatedCamera";

interface SpreadEntry {
  key: string;
  /** "Cover" for a 1-page first spread, else the spread label. */
  name: string;
  /** En-dash page range — `2–3`, `1`. */
  range: string;
  pageIndices: number[];
}

/** Group page indices by walking the spreads collection in document
 *  order (each spread consumes `pageCount` pages). Falls back to
 *  one-page-per-entry when the collection isn't available yet. */
function groupSpreads(
  pageIds: ReadonlyArray<PageId>,
  spreads: ReadonlyArray<SpreadSummary> | null,
): SpreadEntry[] {
  const entries: SpreadEntry[] = [];
  let cursor = 0;
  if (spreads && spreads.length > 0) {
    for (const s of spreads) {
      const count = Math.max(1, s.pageCount);
      const pageIndices: number[] = [];
      for (let i = 0; i < count && cursor < pageIds.length; i++) {
        pageIndices.push(cursor++);
      }
      if (pageIndices.length === 0) break;
      const first = pageIndices[0] + 1;
      const last = pageIndices[pageIndices.length - 1] + 1;
      const range = first === last ? String(first) : `${first}–${last}`;
      entries.push({
        key: s.selfId,
        name:
          entries.length === 0 && pageIndices.length === 1
            ? "Cover"
            : s.label || `Spread ${range}`,
        range,
        pageIndices,
      });
    }
  }
  // Any pages the spreads didn't cover (or no spreads at all).
  while (cursor < pageIds.length) {
    const n = cursor + 1;
    entries.push({
      key: `page-${pageIds[cursor]}`,
      name: cursor === 0 ? "Cover" : `Page ${n}`,
      range: String(n),
      pageIndices: [cursor],
    });
    cursor++;
  }
  return entries;
}

export function DocumentMapPanel(_props: PanelProps) {
  const { handle, snapshots } = useDocument();
  const spreads = useCollection<SpreadSummary>("spreads");
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(
    () => (handle ? groupSpreads(handle.pageIds, spreads) : []),
    [handle, spreads],
  );
  const rects = useMemo(
    () => (handle ? layoutPages(handle.pageSizesPt) : []),
    [handle],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.range.includes(q),
    );
  }, [entries, query]);

  const jumpTo = (entry: SpreadEntry) => {
    setSelected(entry.key);
    const spreadRects = entry.pageIndices
      .map((i) => rects[i])
      .filter((r) => r != null);
    if (spreadRects.length === 0) return;
    const union = documentBounds(spreadRects);
    animateCamera(fitCamera(viewportSize[0], viewportSize[1], union));
  };

  return (
    <div
      data-document-map-panel
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 12px 8px",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
          Document Map
        </span>
      </div>
      <div style={{ padding: "0 12px 8px" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 10px",
            borderRadius: "var(--radius-md)",
            background: "var(--pg-muted)",
            color: "var(--pg-muted-fg)",
          }}
        >
          <Icon name="ui-search" size={15} />
          <input
            data-document-map-search
            placeholder="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 12.5,
              fontFamily: "var(--font-sans)",
              color: "var(--pg-fg)",
            }}
          />
        </label>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px" }}>
        {!handle || handle.pageCount === 0 ? (
          <div className="pg-ui-xs" style={{ padding: "10px 8px" }}>
            No document loaded.
          </div>
        ) : (
          visible.map((entry) => (
            <SpreadRow
              key={entry.key}
              entry={entry}
              selected={selected === entry.key}
              pageIds={handle.pageIds}
              snapshots={snapshots}
              onClick={() => jumpTo(entry)}
            />
          ))
        )}
        {handle && handle.pageCount > 0 && (
          <button
            type="button"
            disabled
            title="Named sections land with the engine's sections collection"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: "calc(100% - 8px)",
              margin: "8px 4px",
              height: 34,
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--chrome-divider)",
              background: "transparent",
              color: "var(--pg-muted-fg)",
              cursor: "default",
              opacity: 0.55,
              fontSize: 12.5,
              fontFamily: "var(--font-sans)",
            }}
          >
            <Icon name="ui-plus" size={14} /> Add section
            <span className="pg-mono-meta">soon</span>
          </button>
        )}
      </div>

      <HealthFooter />
    </div>
  );
}

function SpreadRow({
  entry,
  selected,
  pageIds,
  snapshots,
  onClick,
}: {
  entry: SpreadEntry;
  selected: boolean;
  pageIds: ReadonlyArray<PageId>;
  snapshots: ReadonlyMap<PageId, string>;
  onClick: () => void;
}) {
  return (
    <div
      data-document-map-spread={entry.key}
      data-selected={selected || undefined}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        background: selected ? "var(--selected-bg)" : "transparent",
        marginBottom: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 1.5,
          flexShrink: 0,
          padding: selected ? 1 : 0,
          border: selected
            ? "2px solid var(--pg-primary)"
            : "1px solid var(--pg-border)",
          borderRadius: 1.5,
          background: "var(--pg-bg)",
        }}
      >
        {entry.pageIndices.slice(0, 2).map((i) => {
          const url = snapshots.get(pageIds[i]);
          return url ? (
            <img
              key={i}
              src={url}
              alt=""
              draggable={false}
              style={{
                width: 16,
                height: 22,
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              key={i}
              style={{ width: 16, height: 22, background: "var(--pg-muted)" }}
            />
          );
        })}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entry.name}
        </div>
        <div className="pg-mono-meta">{entry.range}</div>
      </div>
      {/* Per-section status chips await the collaboration backend. */}
    </div>
  );
}

/** Kit Health footer — real document metrics + PDF/X-4 readiness;
 *  the risk counts (overset, missing links, low-res, fonts) await
 *  the engine's preflight accessors. */
function HealthFooter() {
  const meta = useDocumentMeta();
  const stats = useDocumentStats();
  const links = useCollection<LinkSummary>("links");
  const loaded = meta != null && meta.pageCount > 0;

  const rows: Array<[string, string]> = loaded
    ? [
        [String(meta.pageCount), "Pages"],
        [stats ? String(stats.stories) : "—", "Stories"],
        [stats ? String(stats.frames) : "—", "Frames"],
        [links ? String(links.length) : "—", "Placed links"],
      ]
    : [];

  return (
    <div
      data-publication-health-footer
      style={{
        borderTop: "1px solid var(--pg-border)",
        padding: "10px 14px",
        background: "var(--chrome-panel-bg)",
      }}
    >
      <div className="pg-label" style={{ marginBottom: 7 }}>
        Publication Health
      </div>
      {loaded ? (
        <>
          {rows.map(([n, label]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "2px 0",
              }}
            >
              <span
                className="pg-value"
                style={{ fontSize: 11, minWidth: 16, textAlign: "right" }}
              >
                {n}
              </span>
              <span className="pg-ui-xs" style={{ whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
          ))}
          <div
            style={{
              height: 1,
              background: "var(--pg-border)",
              margin: "7px 0",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "2px 0",
            }}
          >
            <span className="pg-ui-xs">PDF/X-4</span>
            <StatusPill
              tone={meta.cmykProfileActive ? "ready" : "warn"}
              testId="map-x4-readiness"
            >
              {meta.cmykProfileActive ? "Ready" : "No output intent"}
            </StatusPill>
          </div>
          <div className="pg-ui-xs" style={{ marginTop: 6, lineHeight: 1.4 }}>
            Overset, link and font risk counts land with the engine's preflight
            accessors.
          </div>
        </>
      ) : (
        <span className="pg-ui-xs">Open a document to see its health.</span>
      )}
    </div>
  );
}
