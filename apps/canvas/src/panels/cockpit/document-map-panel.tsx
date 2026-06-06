// Cockpit — Document Map (the kit's design/review-mode LEFT panel:
// ui_kits/editor/left-panels.jsx DocumentMap + Health footer).
//
// REAL: the spread tree (pages grouped by walking the `spreads`
// collection in document order — SpreadSummary carries pageCount but
// not page membership, so consumption order stands in until the
// engine exposes it), live page thumbnails, search, click→fit camera,
// and the health footer's document metrics + PDF/X-4 readiness.
//
// W2.12 — named SECTIONS are now real: the `sections` collection
// (`SectionSummary{prefix,labelStyle,startPageIndex,pageCount}`)
// renders as chips, and "Add section" fires the v28 `insertSection`
// Operation (undoable) starting a section at the document's first
// page. Per-section status chips (Approved/In Review/…) still await
// the collaboration backend.

import { useMemo, useState } from "react";

import {
  Icon,
  StatusPill,
  groupSpreads,
  useCamera,
  useCanvasClient,
  useCollection,
  useDocument,
  useDocumentMeta,
  useDocumentStats,
  type PanelProps,
  type SpreadEntry,
} from "@paged-media/shell";
import type {
  FontSummary,
  LinkSummary,
  PageId,
  PageSummary,
  SectionSummary,
  SpreadSummary,
} from "@paged-media/client";

import { documentBounds, layoutPages, fitCamera } from "../../ui/layout";
import { useAnimatedCamera } from "../../ui/useAnimatedCamera";

/** Human label for a section's number style. */
function numberingLabel(style: string): string {
  switch (style) {
    case "upperRoman":
      return "I, II, III";
    case "lowerRoman":
      return "i, ii, iii";
    case "upperAlpha":
      return "A, B, C";
    case "lowerAlpha":
      return "a, b, c";
    default:
      return "1, 2, 3";
  }
}

export function DocumentMapPanel(_props: PanelProps) {
  const client = useCanvasClient();
  const { handle, snapshots } = useDocument();
  const spreads = useCollection<SpreadSummary>("spreads");
  const sections = useCollection<SectionSummary>("sections");
  const pages = useCollection<PageSummary>("pages");
  const { camera, setCamera, viewportSize } = useCamera();
  const animateCamera = useAnimatedCamera(camera, setCamera);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const entries = useMemo(
    () => (handle ? groupSpreads(handle.pageIds, spreads) : []),
    [handle, spreads],
  );
  const rects = useMemo(
    () => (handle ? layoutPages(handle.pageSizesPt) : []),
    [handle],
  );

  // Margin/column readout per page index, keyed for the spread rows.
  const pageByIndex = useMemo(() => {
    const m = new Map<number, PageSummary>();
    for (const p of pages ?? []) m.set(p.index - 1, p);
    return m;
  }, [pages]);

  const addSection = () => {
    if (!handle || handle.pageCount === 0) return;
    setAdding(true);
    void client
      .mutate({
        op: "insertSection",
        args: {
          // Start a section at the document's first page — the
          // minimal honest insert; prefix/numbering/start default.
          atPage: handle.pageIds[0],
          prefix: null,
          numberingStyle: null,
          startAt: null,
        },
      })
      .finally(() => setAdding(false));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.range.includes(q),
    );
  }, [entries, query]);

  const jumpToIndices = (pageIndices: number[]) => {
    const spreadRects = pageIndices
      .map((i) => rects[i])
      .filter((r) => r != null);
    if (spreadRects.length === 0) return;
    const union = documentBounds(spreadRects);
    animateCamera(fitCamera(viewportSize[0], viewportSize[1], union));
  };

  const jumpTo = (entry: SpreadEntry) => {
    setSelected(entry.key);
    jumpToIndices(entry.pageIndices);
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
          <>
            {sections && sections.length > 0 && (
              <div data-section-chips style={{ padding: "2px 4px 6px" }}>
                <div className="pg-label" style={{ marginBottom: 5 }}>
                  Sections
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {sections.map((s) => {
                    const start =
                      s.startPageIndex != null ? s.startPageIndex + 1 : null;
                    const range =
                      start != null
                        ? s.pageCount > 1
                          ? `${start}–${start + s.pageCount - 1}`
                          : `${start}`
                        : "—";
                    return (
                      <button
                        key={s.selfId}
                        type="button"
                        data-section-chip={s.selfId}
                        title={`${s.prefix || "(no prefix)"} · ${numberingLabel(
                          s.labelStyle,
                        )} · pages ${range}`}
                        onClick={() => {
                          if (s.startPageIndex != null)
                            jumpToIndices([s.startPageIndex]);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          height: 24,
                          padding: "0 8px",
                          borderRadius: 999,
                          border: "1px solid var(--pg-border)",
                          background: "var(--pg-muted)",
                          color: "var(--pg-fg)",
                          cursor: "pointer",
                          fontSize: 11.5,
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {s.prefix || "§"}
                        </span>
                        <span className="pg-mono-meta">{range}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {visible.map((entry) => (
              <SpreadRow
                key={entry.key}
                entry={entry}
                selected={selected === entry.key}
                pageIds={handle.pageIds}
                snapshots={snapshots}
                pageByIndex={pageByIndex}
                onClick={() => jumpTo(entry)}
              />
            ))}
          </>
        )}
        {handle && handle.pageCount > 0 && (
          <button
            type="button"
            data-add-section
            disabled={adding}
            onClick={addSection}
            title="Start a section at the first page (insertSection)"
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
              color: "var(--pg-fg)",
              cursor: adding ? "default" : "pointer",
              opacity: adding ? 0.6 : 1,
              fontSize: 12.5,
              fontFamily: "var(--font-sans)",
            }}
          >
            <Icon name="ui-plus" size={14} />{" "}
            {adding ? "Adding…" : "Add section"}
          </button>
        )}
      </div>

      <HealthFooter />
    </div>
  );
}

/** Compact margin/column readout for a page — only the non-default
 *  bits ("M 36pt", "2 col") so the row stays terse. */
function pageMetaLabel(p: PageSummary | undefined): string | null {
  if (!p) return null;
  const parts: string[] = [];
  const margins = [
    p.marginTopPt ?? 0,
    p.marginLeftPt ?? 0,
    p.marginBottomPt ?? 0,
    p.marginRightPt ?? 0,
  ];
  const uniform = margins.every((m) => m === margins[0]);
  if (margins.some((m) => m > 0)) {
    parts.push(
      uniform
        ? `M ${Math.round(margins[0])}pt`
        : `M ${margins.map((m) => Math.round(m)).join("/")}`,
    );
  }
  if ((p.columnCount ?? 1) > 1) parts.push(`${p.columnCount} col`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function SpreadRow({
  entry,
  selected,
  pageIds,
  snapshots,
  pageByIndex,
  onClick,
}: {
  entry: SpreadEntry;
  selected: boolean;
  pageIds: ReadonlyArray<PageId>;
  snapshots: ReadonlyMap<PageId, string>;
  pageByIndex: ReadonlyMap<number, PageSummary>;
  onClick: () => void;
}) {
  const metaLabel = pageMetaLabel(pageByIndex.get(entry.pageIndices[0]));
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
        <div className="pg-mono-meta" data-spread-meta={entry.key}>
          {entry.range}
          {metaLabel ? ` · ${metaLabel}` : ""}
        </div>
      </div>
      {/* Per-section status chips await the collaboration backend. */}
    </div>
  );
}

/** Kit Health footer — real document metrics + PDF/X-4 readiness +
 *  the live risk counts (overset stories, missing links, missing
 *  fonts) from the W0.6 wire summaries. Low-res / preflight findings
 *  live in the fuller Publication-health panel. */
function HealthFooter() {
  const meta = useDocumentMeta();
  const stats = useDocumentStats();
  const links = useCollection<LinkSummary>("links");
  const fonts = useCollection<FontSummary>("fonts");
  const loaded = meta != null && meta.pageCount > 0;

  const rows: Array<[string, string]> = loaded
    ? [
        [String(meta.pageCount), "Pages"],
        [stats ? String(stats.stories) : "—", "Stories"],
        [stats ? String(stats.frames) : "—", "Frames"],
        [links ? String(links.length) : "—", "Placed links"],
      ]
    : [];

  const overset =
    stats && stats.overset_stories != null ? stats.overset_stories : null;
  const missingLinks = links
    ? links.filter((l) => l.status === "missing").length
    : null;
  const missingFonts = fonts ? fonts.filter((f) => f.isMissing).length : null;
  const riskRows: Array<[string, number | null]> = [
    ["Overset stories", overset],
    ["Missing links", missingLinks],
    ["Missing fonts", missingFonts],
  ];

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
          <div
            style={{
              height: 1,
              background: "var(--pg-border)",
              margin: "7px 0",
            }}
          />
          {riskRows.map(([label, count]) => (
            <div
              key={label}
              data-health-risk={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "2px 0",
              }}
            >
              <span
                className="pg-value"
                style={{
                  fontSize: 11,
                  minWidth: 16,
                  textAlign: "right",
                  color: (count ?? 0) > 0 ? "var(--status-error)" : undefined,
                }}
              >
                {count == null ? "—" : count}
              </span>
              <span className="pg-ui-xs" style={{ whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
          ))}
        </>
      ) : (
        <span className="pg-ui-xs">Open a document to see its health.</span>
      )}
    </div>
  );
}
