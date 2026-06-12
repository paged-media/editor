// Canvas panel — the center viewport of the shell.
//
// Owns the gesture/hit orchestration callbacks that previously
// lived as inline closures in CanvasApp. Reads from the five
// state contexts + the instrumentation context; the only
// panel-local state is the legacy `hitSelection` (used by the
// overlay to highlight the most recent hit) and the container
// `<div>` ref for ResizeObserver bookkeeping.

import { useCallback, useEffect, useRef } from "react";

import {
  useCanvasClient,
  useCamera,
  useContentSelection,
  useDocument,
  useInstrumentation,
  useOverlaySignals,
  useSelection,
  useOptionalEditContextStack,
  useOptionalTableSelection,
  tableCellElementId,
  type PanelProps,
  type SelectionState,
  type TableCellSelection,
} from "@paged-media/shell";

import type {
  ElementId,
  SelectionMode,
  TextCellAddr,
} from "@paged-media/client";
import { ViewportCanvas } from "../ui/ViewportCanvas";
import { useGestureSpine } from "../ui/useGestureSpine";

export function CanvasPanel(_props: PanelProps) {
  // Phase 2 — the gesture spine. `toolGesture` is non-null only while
  // the effective tool carries a handler (Rectangle, …); select/text
  // keep `null` and run ViewportCanvas's proven legacy pointer path.
  // Hand/Zoom (incl. Space / Cmd+Space spring-loads) reuse the legacy
  // pan machinery + a click-zoom rather than gesture handlers.
  const { toolGesture, cursor: toolCursor, effectiveTool } = useGestureSpine();
  const forcePan = effectiveTool === "paged.tool.hand";
  const zoomClick = effectiveTool === "paged.tool.zoom";
  const client = useCanvasClient();
  const { camera, setCamera, setViewportSize } = useCamera();
  const { handle, resolution } = useDocument();
  const {
    elementSelection,
    setElementSelection,
    setElementGeometry,
    elementGeometry,
    activeTool,
    activeGroup,
    setActiveGroup,
  } = useSelection();
  const { setContentSelection } = useContentSelection();
  const tableSelection = useOptionalTableSelection();
  const { fps, gpuActive, layoutCacheStats } = useInstrumentation();
  const { hitSelection, setHitSelection } = useOverlaySignals();

  // W3.A2 — resolve a table cell selection from a hit's tableContext.
  // The hit carries `{tableId,row,col}` + the owning `storyId` + the
  // page-local frame AABB; try to refine the outline to the precise
  // per-cell rect via elementGeometry(cellElementId), falling back to
  // the frame AABB. A non-table hit clears any prior cell selection.
  const resolveTableCell = useCallback(
    (s: SelectionState | null) => {
      if (!tableSelection) return;
      const tc = s?.hit.tableContext ?? null;
      const storyId = s?.hit.storyId ?? null;
      if (!s || !tc || !storyId) {
        tableSelection.clearCell();
        return;
      }
      const base: TableCellSelection = {
        storyId,
        tableId: tc.tableId,
        row: tc.row,
        col: tc.col,
        pageId: s.pageId,
        frameBounds: s.hit.frameBounds
          ? [
              s.hit.frameBounds.top,
              s.hit.frameBounds.left,
              s.hit.frameBounds.bottom,
              s.hit.frameBounds.right,
            ]
          : null,
        cellRect: null,
      };
      // Optimistically select with the frame-AABB outline, then refine
      // to a precise cell rect when the engine resolves geometry for
      // the TableCell ElementId (page-space AABB via item transform).
      tableSelection.selectCell(base);
      const cellId: ElementId = tableCellElementId(base);
      void client
        .elementGeometry([cellId])
        .then((items) => {
          const item = items[0];
          if (!item) return;
          const [top, left, bottom, right] = item.bounds;
          const t = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
          const corners: Array<[number, number]> = [
            [left, top],
            [right, top],
            [left, bottom],
            [right, bottom],
          ].map(([x, y]) => [
            t[0] * x + t[2] * y + t[4],
            t[1] * x + t[3] * y + t[5],
          ]);
          const xs = corners.map((p) => p[0]);
          const ys = corners.map((p) => p[1]);
          tableSelection.selectCell({
            ...base,
            cellRect: [
              Math.min(...ys),
              Math.min(...xs),
              Math.max(...ys),
              Math.max(...xs),
            ],
          });
        })
        .catch(() => {
          /* engine can't resolve per-cell geometry yet — frame AABB
             outline stays. */
        });
    },
    [client, tableSelection],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track the panel's container size so the camera context's
  // viewportSize stays in sync. Previously the shell observed its
  // own mainStyle wrapper; after the dockview swap each panel
  // observes its own container.
  //
  // The ref only exists once a document is loaded (the empty state
  // renders without it), so the observer must re-attach when the
  // handle arrives — otherwise viewportSize wedges at [0,0] and
  // every context-driven camera fit collapses to the minimum zoom.
  const loaded = handle != null && handle.pageCount > 0;
  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    const el = containerRef.current;
    // Seed immediately — ResizeObserver deliveries ride the rendering
    // steps, which a hidden/occluded tab suspends entirely.
    const r0 = el.getBoundingClientRect();
    if (r0.width > 0 && r0.height > 0) setViewportSize([r0.width, r0.height]);
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewportSize([r.width, r.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, setViewportSize]);

  // Track L — Escape exits the active group (matches InDesign's
  // group-escape UX). Skips when an editable element has focus so
  // typing in the command palette / inspector doesn't accidentally
  // pop the group.
  useEffect(() => {
    if (activeGroup === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      e.preventDefault();
      setActiveGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGroup, setActiveGroup]);

  const onHit = useCallback(
    (
      s: SelectionState | null,
      modifiers?: { shift?: boolean; cmd?: boolean },
    ) => {
      setHitSelection(s);
      // W3.A2 — track table cell selection off the hit's tableContext
      // (independent of tool: a select click on a cell outlines it, a
      // text click into a cell keeps it addressed for the Table panel).
      resolveTableCell(s);
      if (activeTool === "select") {
        const mode: SelectionMode = modifiers?.shift
          ? "add"
          : modifiers?.cmd
            ? "toggle"
            : "replace";
        if (s && s.hit.element) {
          // Track L — selection target depends on `activeGroup`:
          //   activeGroup === null
          //       → click selects the OUTERMOST containing group
          //         (groupChain[0]) so transforms apply to the
          //         whole group. Falls back to the hit element
          //         when the click isn't inside any group.
          //   activeGroup === <gid>
          //       → click stays scoped to leaves whose chain
          //         includes <gid>. Hits OUTSIDE the active
          //         group exit it and select that element
          //         (matches InDesign's "group escape" UX).
          const chain = s.hit.groupChain ?? [];
          let target = s.hit.element;
          let nextActive = activeGroup;
          if (activeGroup === null) {
            if (chain.length > 0) {
              target = { kind: "group" as const, id: chain[0] };
            }
          } else if (!chain.includes(activeGroup)) {
            // Hit fell outside the active group — exit and
            // select what the user actually clicked. If the
            // outside element is itself in a different group,
            // select that group (mirrors the no-activeGroup
            // branch above).
            nextActive = null;
            if (chain.length > 0) {
              target = { kind: "group" as const, id: chain[0] };
            }
          }
          if (nextActive !== activeGroup) setActiveGroup(nextActive);
          void client
            .setElementSelection([target], mode)
            .then((ids) => {
              setElementSelection(ids);
              return client.elementGeometry(ids);
            })
            .then(setElementGeometry)
            .catch(() => {
              /* worker reload / disconnect — fine */
            });
        } else if (!modifiers?.shift && !modifiers?.cmd) {
          // Empty hit → clear selection AND exit any active
          // group (clicking on the pasteboard escapes everything).
          if (activeGroup !== null) setActiveGroup(null);
          void client
            .setElementSelection([], "replace")
            .then(() => {
              setElementSelection([]);
              setElementGeometry([]);
            })
            .catch(() => {});
        }
        setContentSelection(null);
        return;
      }
      // Text tool — click on text → caret at offset.
      if (
        s &&
        s.hit.storyId &&
        s.hit.offsetWithinStory !== null &&
        s.hit.offsetWithinStory !== undefined
      ) {
        // W2.11 (tables v2) — a Type-tool click that lands inside a
        // table cell carries the hit's `tableContext`; the engine
        // already reports `offsetWithinStory` CELL-LOCAL for an in-cell
        // hit (proven by the cell-text probe), so we ride the v35 `cell`
        // qualifier on the selection. The round-tripping setter posts it
        // to the worker (caret + selection geometry resolve IN the cell)
        // and `useTextEditing` forwards it onto every insert/delete, so
        // typing edits the cell's stream. A non-table hit leaves `cell`
        // undefined — body addressing, byte-identical to before.
        const tc = s.hit.tableContext ?? null;
        const cell: TextCellAddr | undefined = tc
          ? { tableId: tc.tableId, row: tc.row, col: tc.col }
          : undefined;
        setContentSelection({
          storyId: s.hit.storyId,
          start: s.hit.offsetWithinStory,
          end: s.hit.offsetWithinStory,
          affinity: false,
          cell,
        });
      } else {
        setContentSelection(null);
      }
    },
    [
      activeTool,
      client,
      resolveTableCell,
      setContentSelection,
      setElementGeometry,
      setElementSelection,
    ],
  );

  const onMarquee = useCallback(
    (
      pageId: import("@paged-media/client").PageId,
      rect: [number, number, number, number],
      modifiers?: { shift?: boolean; cmd?: boolean },
    ) => {
      const mode: SelectionMode = modifiers?.shift
        ? "add"
        : modifiers?.cmd
          ? "toggle"
          : "replace";
      void client
        .marqueeHits(pageId, rect)
        .then((ids) => client.setElementSelection(ids, mode))
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setElementGeometry, setElementSelection],
  );

  const onGestureCommitted = useCallback(() => {
    if (elementSelection.length === 0) return;
    void client
      .elementGeometry(elementSelection)
      .then(setElementGeometry)
      .catch(() => {});
  }, [client, elementSelection, setElementGeometry]);

  // K-1 — refresh the ACTIVE edit context's frame geometry on entry. The
  // cached `elementGeometry` only updates on the click/marquee/gesture
  // selection paths, so a context entered after a programmatic selection
  // (a panel's lower-to-frame) or after a mutation that moved the frame
  // (rotate via script/panel) would hand the content-pointer dispatch a
  // stale or absent transform — and the FIRST in-frame click would fall
  // into the commit-exit branch instead of selecting a cell (found by
  // the sheet-modal-session e2e).
  const editContextStack = useOptionalEditContextStack();
  const activeScopeRoot = editContextStack?.active?.scopeRoot ?? null;
  useEffect(() => {
    if (!activeScopeRoot) return;
    void client
      .elementGeometry([activeScopeRoot])
      .then((items) => {
        if (items.length > 0) setElementGeometry(items);
      })
      .catch(() => {});
  }, [activeScopeRoot, client, setElementGeometry]);

  const onDoubleClickGroup = useCallback(
    (
      groupId: string,
      hitElement: import("@paged-media/client").ElementId | null,
    ) => {
      // Track L — double-click enters the group: set
      // `activeGroup` AND select the leaf the user clicked.
      // Subsequent single-clicks stay scoped to that group's
      // members via `onHit`'s activeGroup branch; Escape (and
      // empty-pasteboard clicks) exit.
      setActiveGroup(groupId);
      const target = hitElement;
      if (!target) return;
      void client
        .setElementSelection([target], "replace")
        .then((ids) => {
          setElementSelection(ids);
          return client.elementGeometry(ids);
        })
        .then(setElementGeometry)
        .catch(() => {});
    },
    [client, setActiveGroup, setElementGeometry, setElementSelection],
  );

  if (!handle || handle.pageCount === 0) {
    return (
      <div style={emptyStyle}>
        <p style={{ fontSize: 14, color: "var(--pg-muted-fg)" }}>
          Drop an IDML file here, or use File ▸ Open IDML…
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <ViewportCanvas
        client={client}
        pageIds={handle.pageIds}
        pageSizesPt={handle.pageSizesPt}
        camera={camera}
        onCameraChange={setCamera}
        activeTool={activeTool}
        toolGesture={toolGesture}
        cursor={toolCursor}
        forcePan={forcePan}
        zoomClick={zoomClick}
        elementSelection={elementSelection}
        elementGeometry={elementGeometry}
        onHit={onHit}
        onMarquee={onMarquee}
        onGestureCommitted={onGestureCommitted}
        onDoubleClickGroup={onDoubleClickGroup}
        selection={hitSelection}
        fps={fps}
        gpuActive={gpuActive}
        resolution={resolution}
        layoutCacheStats={layoutCacheStats}
      />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const emptyStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--canvas-surround)",
};
