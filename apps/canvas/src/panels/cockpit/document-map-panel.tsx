/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

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
//
// W2.7 — per-page STATUS CHIPS on each spread row (matrix gaps 2–4).
// One chip is REAL and one is an honest seam, chosen by what the wire
// can attribute to a page:
//   - MISSING LINKS (real): `LinkSummary.status === "missing"` gives a
//     host FRAME id (`hostSelfId` + `hostKind`); `elementGeometry`
//     resolves that frame to a `pageId`, so a missing link IS
//     attributable per-page. The chip counts the page's missing links;
//     clicking it jumps the camera to that page. See
//     `useMissingLinksByPage`.
//   - OVERSET / MISSING FONTS / APPLIED MASTER (honest seams): none of
//     these can be attributed to a page over the current wire —
//     `StorySummary.overset` is per-story with no story→page map,
//     `FontSummary` carries no host attribution at all, and
//     `PageSummary` exposes no appliedMaster. When the document carries
//     a document-level signal (overset stories / missing fonts), a
//     single SEAM chip marks "somewhere in the document" honestly
//     rather than guessing a page. The missing reads are named in the
//     chip tooltips and become W2.7 core follow-ups.

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  Icon,
  StatusPill,
  groupSpreads,
  statusColor,
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
  CanvasClient,
  ElementId,
  FontSummary,
  LinkSummary,
  PageId,
  PageSummary,
  SectionSummary,
  SpreadSummary,
  StorySummary,
} from "@paged-media/client";

import { layoutPages, fitCamera } from "../../ui/layout";
import { useAnimatedCamera } from "../../ui/useAnimatedCamera";

/** Map a `LinkSummary.hostKind` (parse-side frame kind: `"Rectangle"`,
 *  `"Oval"`, `"Polygon"`, `"GraphicLine"`) to the `ElementId` the
 *  worker's `elementGeometry` resolver addresses. Returns `null` for
 *  kinds that can't host a placed image / aren't selectable frames. */
function hostElementId(hostSelfId: string, hostKind: string): ElementId | null {
  switch (hostKind) {
    case "Rectangle":
      return { kind: "rectangle", id: hostSelfId };
    case "Oval":
      return { kind: "oval", id: hostSelfId };
    case "Polygon":
      return { kind: "polygon", id: hostSelfId };
    case "GraphicLine":
      return { kind: "graphicLine", id: hostSelfId };
    default:
      return null;
  }
}

/** REAL per-page attribution of MISSING links. A missing
 *  `LinkSummary` names its host FRAME (`hostSelfId` + `hostKind`);
 *  `elementGeometry` resolves that frame to a `pageId`. We resolve all
 *  missing-link hosts in one batch and bucket the count by 0-based page
 *  index. Re-runs on every Operation push (mutation/undo/redo/load) so
 *  the chips track relocate/relink edits the moment those ops land.
 *
 *  Returns `null` until the first resolve completes (so chips don't
 *  flash absent before the geometry round-trip), then a Map of
 *  pageIndex → missing-link count (only pages WITH missing links
 *  appear). */
function useMissingLinksByPage(
  client: CanvasClient,
  links: LinkSummary[] | null,
  pageIds: ReadonlyArray<PageId>,
): Map<number, number> | null {
  const [byPage, setByPage] = useState<Map<number, number> | null>(null);

  // Identity of the missing-link host set — re-resolve only when the
  // set of missing hosts (or the page order) actually changes.
  const missingKey = useMemo(() => {
    if (!links) return null;
    return links
      .filter((l) => l.status === "missing")
      .map((l) => `${l.hostKind}:${l.hostSelfId}`)
      .sort()
      .join("|");
  }, [links]);
  const pageKey = pageIds.join("|");

  useEffect(() => {
    let cancelled = false;
    if (!links) {
      setByPage(null);
      return;
    }
    const missing = links.filter((l) => l.status === "missing");
    if (missing.length === 0) {
      setByPage(new Map());
      return;
    }
    // Build the id→hostKey index so we can bucket each resolved
    // geometry back to its page.
    const ids: ElementId[] = [];
    for (const l of missing) {
      const id = hostElementId(l.hostSelfId, l.hostKind);
      if (id) ids.push(id);
    }
    const pageIndexOf = new Map<string, number>();
    pageIds.forEach((pid, i) => pageIndexOf.set(pid, i));

    void client
      .elementGeometry(ids)
      .then((geoms) => {
        if (cancelled) return;
        const next = new Map<number, number>();
        for (const g of geoms) {
          // C-23 — a pasteboard element belongs to no page, so it is
          // not counted in a PER-PAGE map. Skipping is the honest
          // answer here; a document map is page-indexed by definition.
          if (!g.pageId) continue;
          const idx = pageIndexOf.get(g.pageId);
          if (idx == null) continue;
          next.set(idx, (next.get(idx) ?? 0) + 1);
        }
        setByPage(next);
      })
      .catch(() => {
        if (cancelled) return;
        setByPage(new Map());
      });
    return () => {
      cancelled = true;
    };
    // `missingKey`/`pageKey` capture the inputs that change the result;
    // `links`/`pageIds` themselves are stable-by-content via those keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, missingKey, pageKey]);

  return byPage;
}

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
  const links = useCollection<LinkSummary>("links");
  const fonts = useCollection<FontSummary>("fonts");
  const stories = useCollection<StorySummary>("stories");
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

  // REAL per-page missing-link counts (gap 2) — host frame resolved to
  // its page via elementGeometry.
  const missingLinksByPage = useMissingLinksByPage(
    client,
    links,
    handle?.pageIds ?? [],
  );

  // Document-level seam signals (gaps 3–4). These CAN'T be attributed
  // to a page over the current wire, so a single SEAM chip per page
  // honestly marks "this risk exists somewhere in the document" when
  // the document-level count is non-zero — it is NOT a per-page claim.
  const oversetStories = stories
    ? stories.filter((s) => s.overset).length
    : 0;
  const missingFonts = fonts ? fonts.filter((f) => f.isMissing).length : 0;

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
    // `layoutPages` stacks ALL pages vertically (spreads are not
    // side-by-side), so fitting the union rect of a multi-page spread
    // lands the camera on the inter-page GAP. Fit the spread's FIRST
    // page instead; a spread-aware `layoutPages` (pages of one spread
    // side by side) is the structural fix (follow-up).
    const first = pageIndices.map((i) => rects[i]).find((r) => r != null);
    if (!first) return;
    animateCamera(fitCamera(viewportSize[0], viewportSize[1], first));
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
                missingLinksByPage={missingLinksByPage}
                oversetStories={oversetStories}
                missingFonts={missingFonts}
                onClick={() => jumpTo(entry)}
                onChipJump={(pageIndices) => {
                  setSelected(entry.key);
                  jumpToIndices(pageIndices);
                }}
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
  missingLinksByPage,
  oversetStories,
  missingFonts,
  onClick,
  onChipJump,
}: {
  entry: SpreadEntry;
  selected: boolean;
  pageIds: ReadonlyArray<PageId>;
  snapshots: ReadonlyMap<PageId, string>;
  pageByIndex: ReadonlyMap<number, PageSummary>;
  missingLinksByPage: ReadonlyMap<number, number> | null;
  oversetStories: number;
  missingFonts: number;
  onClick: () => void;
  onChipJump: (pageIndices: number[]) => void;
}) {
  const metaLabel = pageMetaLabel(pageByIndex.get(entry.pageIndices[0]));
  // REAL — missing links attributed to any page in this spread.
  const missingLinks = entry.pageIndices.reduce(
    (sum, i) => sum + (missingLinksByPage?.get(i) ?? 0),
    0,
  );
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
        <PageChips
          spreadKey={entry.key}
          pageIndices={entry.pageIndices}
          missingLinks={missingLinks}
          oversetStories={oversetStories}
          missingFonts={missingFonts}
          onJump={onChipJump}
        />
      </div>
    </div>
  );
}

/** Per-page status chips for a spread row (gaps 2–4).
 *
 *  REAL: the MISSING-LINKS chip is shown only when this spread's pages
 *  actually host one (count from `elementGeometry` page attribution);
 *  clicking it jumps to the spread.
 *
 *  HONEST SEAMS: overset / missing-fonts can't be attributed to a page
 *  over the current wire, so a single dashed seam chip surfaces the
 *  document-level signal with a tooltip naming the missing read — it
 *  marks "somewhere in the document", not "on this page". A master
 *  applied per-page read doesn't exist either; it's noted in the
 *  missing-reads but rendered as no chip rather than a fabricated one.
 *  Seam chips render only on the FIRST page of the document so the same
 *  document-level signal isn't repeated on every row. */
function PageChips({
  spreadKey,
  pageIndices,
  missingLinks,
  oversetStories,
  missingFonts,
  onJump,
}: {
  spreadKey: string;
  pageIndices: number[];
  missingLinks: number;
  oversetStories: number;
  missingFonts: number;
  onJump: (pageIndices: number[]) => void;
}) {
  const isFirstRow = pageIndices.includes(0);
  const showOversetSeam = isFirstRow && oversetStories > 0;
  const showFontSeam = isFirstRow && missingFonts > 0;
  if (missingLinks === 0 && !showOversetSeam && !showFontSeam) return null;
  return (
    <div
      data-page-chips={spreadKey}
      style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}
    >
      {missingLinks > 0 && (
        <button
          type="button"
          data-page-chip="missing-links"
          data-page-chip-spread={spreadKey}
          title={`${missingLinks} missing link${
            missingLinks === 1 ? "" : "s"
          } on this page — go to page`}
          onClick={(e) => {
            e.stopPropagation();
            onJump(pageIndices);
          }}
          style={chipStyle(statusColor("error"), false)}
        >
          {missingLinks} missing link{missingLinks === 1 ? "" : "s"}
        </button>
      )}
      {showOversetSeam && (
        <span
          data-page-chip="overset-seam"
          title={
            "Overset can't be attributed to a page over the current wire " +
            "(StorySummary.overset is per-story with no story→page map). " +
            `${oversetStories} overset stor${
              oversetStories === 1 ? "y" : "ies"
            } in the document. Needs a per-story (or per-frame) page read.`
          }
          style={chipStyle("var(--pg-muted-fg)", true)}
        >
          overset: doc-level
        </span>
      )}
      {showFontSeam && (
        <span
          data-page-chip="fonts-seam"
          title={
            "Missing fonts can't be attributed to a page over the current " +
            "wire (FontSummary carries no host attribution). " +
            `${missingFonts} missing font${
              missingFonts === 1 ? "" : "s"
            } in the document. Needs per-page font usage on the wire.`
          }
          style={chipStyle("var(--pg-muted-fg)", true)}
        >
          fonts: doc-level
        </span>
      )}
    </div>
  );
}

/** Shared chip pill style. `seam` chips are dashed + muted to read as
 *  "awaiting a wire read", not a per-page fact. */
function chipStyle(color: string, seam: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 18,
    padding: "0 7px",
    borderRadius: 999,
    border: `1px ${seam ? "dashed" : "solid"} ${color}`,
    background: "transparent",
    color,
    cursor: seam ? "default" : "pointer",
    fontSize: 10,
    fontFamily: "var(--font-sans)",
    whiteSpace: "nowrap",
  };
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
