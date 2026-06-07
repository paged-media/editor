// W3.A2 / W2.11 — the LIVE Table panel (v35 surface).
//
// Brings the panel-gallery Table concept live against the table surface
// (table ops + the cell PropertyPaths). Drives the SELECTED table cell
// (the `TableSelectionContext`, set by the canvas hit handler off
// `HitResult.tableContext`):
//
//   - cell fill colour      → setElementProperty(cellFillColor)
//   - cell insets ×4        → setElementProperty(cellInset{Top,Left,
//                             Bottom,Right})
//   - cell vert. justify    → setElementProperty(cellVerticalJustification)
//   - applied cell style    → setElementProperty(appliedCellStyle)
//   - applied table style   → setElementProperty(appliedTableStyle) on
//                             the containing Table NodeId
//   - row height / col width→ setRowHeight / setColumnWidth at the
//                             selected row / col
//   - insert / delete row   → insertTableRow / deleteTableRow at row
//   - insert / delete column→ insertTableColumn / deleteTableColumn at col
//
// W2.11 (tables v2) adds, all against the freshly published protocol-v35
// surface:
//   - cell SPANS            → setCellSpan {rowSpan, columnSpan} (merge);
//                             span 1×1 splits back to single cells.
//                             Span has NO read-back path on the cell
//                             properties surface (probed empirically), so
//                             the inputs are write-forward — they seed
//                             from 1×1 on each fresh cell selection and
//                             reflect the last applied span. Undo restores
//                             the prior geometry over the wire.
//   - header / footer rows  → insertHeaderRow / removeHeaderRow /
//                             insertFooterRow / removeFooterRow. Header /
//                             footer rows count toward `tableRowCount`
//                             (probed: insertHeaderRow bumps it), and the
//                             engine exposes NO separate header/footer
//                             count read, so the panel shows the live
//                             `tableRowCount` total and tracks the panel-
//                             applied header/footer deltas as an honest
//                             write-forward count (a true count read is
//                             the documented seam).
//   - per-cell edge strokes → cell{Top,Bottom,Left,Right}EdgeStroke{Color,
//                             Weight,Tint} PropertyPaths, with full read-
//                             back (these paths DO read on the cell
//                             properties surface — probed).
//
// All cell + applied-style + edge-stroke values READ BACK via
// elementProperties(cell|table) and re-fetch on every Operation push, so
// the inputs reflect engine truth. The Table ElementId carries
// tableRowCount / tableColumnCount (integer-as-Length convention), so the
// panel shows the table's real row/column TOTALS alongside the selected
// cell's (row, col) address. A cell's row HEIGHT / column WIDTH are still
// write-forward (no read entry).
//
// CELL TEXT editing is live (v35 cell qualifier): with the Type tool, a
// click into a cell enters in-cell editing — the caret renders in the
// cell and typing inserts into the cell's stream — routed through the
// SAME caret/typing path body text uses (canvas-panel onHit →
// ContentSelection.cell → useTextEditing). This panel edits cell
// STRUCTURE; the in-canvas caret edits cell TEXT.

import { useCallback, useEffect, useState } from "react";

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitRow,
  CockpitSection,
  Icon,
  displayName,
  useCanvasClient,
  useCollection,
  useOptionalTableSelection,
  tableCellElementId,
  type TableCellSelection,
} from "@paged-media/shell";
import type {
  CanvasClient,
  CellStyleSummary,
  ElementId,
  PropertyEntry,
  SwatchSummary,
  TableStyleSummary,
  Value,
} from "@paged-media/client";

/** IDML `<Cell VerticalJustification>` values (same enum as the text
 *  frame preference). */
const VJUSTIFY: Array<{ value: string; label: string }> = [
  { value: "TopAlign", label: "Top" },
  { value: "CenterAlign", label: "Center" },
  { value: "BottomAlign", label: "Bottom" },
  { value: "JustifyAlign", label: "Justify" },
];

/** One cell edge's stroke read-back. `color` is a swatch ref (or null
 *  ⇒ inherit/none); `weight`/`tint` are lengths (null ⇒ unset). */
interface EdgeStroke {
  color: string | null;
  weight: number | null;
  tint: number | null;
}

const EMPTY_EDGE: EdgeStroke = { color: null, weight: null, tint: null };

interface CellReadback {
  fillColor: string | null;
  insetTop: number;
  insetLeft: number;
  insetBottom: number;
  insetRight: number;
  verticalJustification: string;
  appliedCellStyle: string;
  /** Per-edge stroke read-back (v35 cell edge-stroke paths). */
  edgeTop: EdgeStroke;
  edgeBottom: EdgeStroke;
  edgeLeft: EdgeStroke;
  edgeRight: EdgeStroke;
}

interface TableReadback {
  appliedTableStyle: string;
  /** Table row / column totals — `tableRowCount` / `tableColumnCount`
   *  read entries (integer-as-Length). `null` when the engine didn't
   *  carry them. */
  rowCount: number | null;
  columnCount: number | null;
}

function entryValue(
  entries: PropertyEntry[],
  path: string,
): Value | null | undefined {
  return entries.find((e) => e.path === path)?.value;
}

/** Live cell + table property snapshot for the selected cell, refetched
 *  on every Operation push. `null` until the first read resolves. */
function useTableReadback(
  client: CanvasClient,
  cell: TableCellSelection | null,
): { cell: CellReadback | null; table: TableReadback | null } {
  const [state, setState] = useState<{
    cell: CellReadback | null;
    table: TableReadback | null;
  }>({ cell: null, table: null });

  useEffect(() => {
    if (!cell) {
      setState({ cell: null, table: null });
      return;
    }
    let cancelled = false;
    const cellId = tableCellElementId(cell);
    const tableId: ElementId = {
      kind: "table",
      id: { story_id: cell.storyId, table_id: cell.tableId },
    };
    const refetch = () => {
      void Promise.all([
        client.elementProperties(cellId),
        client.elementProperties(tableId),
      ])
        .then(([cellProps, tableProps]) => {
          if (cancelled) return;
          const ce = cellProps?.entries ?? [];
          const te = tableProps?.entries ?? [];
          const colorRef = entryValue(ce, "cellFillColor");
          const vj = entryValue(ce, "cellVerticalJustification");
          const acs = entryValue(ce, "appliedCellStyle");
          const ats = entryValue(te, "appliedTableStyle");
          const len = (p: string): number => {
            const v = entryValue(ce, p);
            return v && v.type === "length" ? (v.value ?? 0) : 0;
          };
          // Nullable length (edge weight / tint — null ⇒ unset, distinct
          // from 0). Nullable colour ref (edge colour — null ⇒ inherit).
          const lenOrNull = (p: string): number | null => {
            const v = entryValue(ce, p);
            return v && v.type === "length" ? (v.value ?? null) : null;
          };
          const colorOrNull = (p: string): string | null => {
            const v = entryValue(ce, p);
            return v && v.type === "colorRef" ? v.value : null;
          };
          const edge = (side: string): EdgeStroke => ({
            color: colorOrNull(`cell${side}EdgeStrokeColor`),
            weight: lenOrNull(`cell${side}EdgeStrokeWeight`),
            tint: lenOrNull(`cell${side}EdgeStrokeTint`),
          });
          // tableRowCount / tableColumnCount ride the integer-as-Length
          // convention on the Table NodeId; absent ⇒ null (honest gap).
          const intLen = (p: string): number | null => {
            const v = entryValue(te, p);
            return v && v.type === "length" && v.value != null
              ? Math.round(v.value)
              : null;
          };
          setState({
            cell: {
              fillColor:
                colorRef && colorRef.type === "colorRef"
                  ? colorRef.value
                  : null,
              insetTop: len("cellInsetTop"),
              insetLeft: len("cellInsetLeft"),
              insetBottom: len("cellInsetBottom"),
              insetRight: len("cellInsetRight"),
              verticalJustification:
                vj && vj.type === "text" ? vj.value : "",
              appliedCellStyle: acs && acs.type === "text" ? acs.value : "",
              edgeTop: edge("Top"),
              edgeBottom: edge("Bottom"),
              edgeLeft: edge("Left"),
              edgeRight: edge("Right"),
            },
            table: {
              appliedTableStyle: ats && ats.type === "text" ? ats.value : "",
              rowCount: intLen("tableRowCount"),
              columnCount: intLen("tableColumnCount"),
            },
          });
        })
        .catch(() => {
          if (!cancelled) setState({ cell: null, table: null });
        });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
    // Re-key on the cell address (story/table/row/col) — a new cell
    // selection re-fetches; same cell keeps the subscription.
  }, [client, cell?.storyId, cell?.tableId, cell?.row, cell?.col]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

export function TablePanel() {
  const client = useCanvasClient();
  const ts = useOptionalTableSelection();
  const cell = ts?.cell ?? null;
  const swatches = useCollection<SwatchSummary>("swatches");
  const tableStyles = useCollection<TableStyleSummary>("tableStyles");
  const cellStyles = useCollection<CellStyleSummary>("cellStyles");
  const { cell: cellRead, table: tableRead } = useTableReadback(client, cell);

  const cellId = cell ? tableCellElementId(cell) : null;

  const setCellProp = useCallback(
    (path: string, value: Value) => {
      if (!cellId) return;
      void client.mutate({
        op: "setElementProperty",
        args: { elementId: cellId, path: path as never, value },
      });
    },
    [client, cellId],
  );

  const setTableStyle = useCallback(
    (styleId: string) => {
      if (!cell) return;
      const tableId: ElementId = {
        kind: "table",
        id: { story_id: cell.storyId, table_id: cell.tableId },
      };
      void client.mutate({
        op: "setElementProperty",
        args: {
          elementId: tableId,
          path: "appliedTableStyle" as never,
          value: { type: "text", value: styleId },
        },
      });
    },
    [client, cell],
  );

  const tableLineOp = useCallback(
    (
      op:
        | "insertTableRow"
        | "deleteTableRow"
        | "insertTableColumn"
        | "deleteTableColumn",
      at: number,
    ) => {
      if (!cell) return;
      void client.mutate({
        op,
        args: { storyId: cell.storyId, tableId: cell.tableId, at },
      } as never);
    },
    [client, cell],
  );

  const setRowHeight = useCallback(
    (height: number) => {
      if (!cell) return;
      void client.mutate({
        op: "setRowHeight",
        args: {
          storyId: cell.storyId,
          tableId: cell.tableId,
          row: cell.row,
          height,
        },
      });
    },
    [client, cell],
  );

  const setColumnWidth = useCallback(
    (width: number) => {
      if (!cell) return;
      void client.mutate({
        op: "setColumnWidth",
        args: {
          storyId: cell.storyId,
          tableId: cell.tableId,
          col: cell.col,
          width,
        },
      });
    },
    [client, cell],
  );

  // ── Spans (v35 setCellSpan). No read-back path on the cell surface
  //    (probed), so the inputs are write-forward: seed 1×1 on each fresh
  //    cell selection, reflect the last applied span. Undo restores the
  //    prior geometry over the wire. ─────────────────────────────────
  const [rowSpan, setRowSpan] = useState(1);
  const [columnSpan, setColumnSpan] = useState(1);
  // Reset the span draft when the selected cell changes (a fresh cell is
  // 1×1 from the panel's perspective until the user merges it).
  useEffect(() => {
    setRowSpan(1);
    setColumnSpan(1);
  }, [cell?.storyId, cell?.tableId, cell?.row, cell?.col]);

  const applySpan = useCallback(
    (nextRowSpan: number, nextColumnSpan: number) => {
      if (!cell) return;
      const rs = Math.max(1, Math.round(nextRowSpan));
      const cs = Math.max(1, Math.round(nextColumnSpan));
      setRowSpan(rs);
      setColumnSpan(cs);
      void client.mutate({
        op: "setCellSpan",
        args: {
          storyId: cell.storyId,
          tableId: cell.tableId,
          row: cell.row,
          col: cell.col,
          rowSpan: rs,
          columnSpan: cs,
        },
      });
    },
    [client, cell],
  );

  // ── Header / footer rows (v35). Header/footer rows count toward
  //    tableRowCount (probed); no separate count read exists, so we track
  //    the panel-applied delta as an honest write-forward count. Reset on
  //    cell/table change. ────────────────────────────────────────────
  const [headerApplied, setHeaderApplied] = useState(0);
  const [footerApplied, setFooterApplied] = useState(0);
  useEffect(() => {
    setHeaderApplied(0);
    setFooterApplied(0);
  }, [cell?.tableId]);

  const headerFooterOp = useCallback(
    (
      op:
        | "insertHeaderRow"
        | "removeHeaderRow"
        | "insertFooterRow"
        | "removeFooterRow",
    ) => {
      if (!cell) return;
      void client.mutate({
        op,
        args: { storyId: cell.storyId, tableId: cell.tableId },
      } as never);
      if (op === "insertHeaderRow") setHeaderApplied((n) => n + 1);
      else if (op === "removeHeaderRow")
        setHeaderApplied((n) => Math.max(0, n - 1));
      else if (op === "insertFooterRow") setFooterApplied((n) => n + 1);
      else setFooterApplied((n) => Math.max(0, n - 1));
    },
    [client, cell],
  );

  // ── Per-cell edge strokes (v35 cell edge-stroke paths). One commit
  //    per channel; read-back drives the inputs. ────────────────────
  const setEdgeColor = useCallback(
    (side: string, swatchId: string) => {
      setCellProp(`cell${side}EdgeStrokeColor`, {
        type: "colorRef",
        value: swatchId === "" ? null : swatchId,
      });
    },
    [setCellProp],
  );
  const setEdgeWeight = useCallback(
    (side: string, weight: number) => {
      setCellProp(`cell${side}EdgeStrokeWeight`, {
        type: "length",
        value: weight,
      });
    },
    [setCellProp],
  );
  const setEdgeTint = useCallback(
    (side: string, tint: number) => {
      setCellProp(`cell${side}EdgeStrokeTint`, { type: "length", value: tint });
    },
    [setCellProp],
  );

  if (!cell) {
    return (
      <div className="p-3" data-table-panel="empty">
        <div className="pg-ui-xs" style={{ color: "var(--pg-muted-fg)" }}>
          Click into a table cell to edit its row, column, insets, fill, and
          applied styles.
        </div>
      </div>
    );
  }

  return (
    <div data-table-panel="ready" style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader
        title="Table"
        action={
          <span className="pg-mono-meta" data-table-cell-address>
            R{cell.row} · C{cell.col}
          </span>
        }
      />

      <CockpitSection title="Selected cell">
        <CockpitRow label="Row index">
          <span className="pg-mono-meta" data-cell-row>
            {cell.row}
          </span>
        </CockpitRow>
        <CockpitRow label="Column index">
          <span className="pg-mono-meta" data-cell-col>
            {cell.col}
          </span>
        </CockpitRow>
        {/* Aftercare-C: row / column totals now read back from the Table
            NodeId (tableRowCount / tableColumnCount). */}
        <CockpitRow label="Rows × columns">
          <span className="pg-mono-meta" data-table-dims>
            {tableRead?.rowCount != null && tableRead?.columnCount != null
              ? `${tableRead.rowCount} × ${tableRead.columnCount}`
              : "—"}
          </span>
        </CockpitRow>
      </CockpitSection>

      <CockpitSection title="Row & column">
        <CockpitRow label="Row height">
          <NumberCommit
            testId="row-height"
            placeholder="At least…"
            onCommit={setRowHeight}
          />
        </CockpitRow>
        <CockpitRow label="Column width">
          <NumberCommit
            testId="column-width"
            placeholder="Width…"
            onCommit={setColumnWidth}
          />
        </CockpitRow>
        <div className="flex gap-[5px] px-3 pb-1 pt-1">
          <CockpitBtn
            sm
            testId="insert-row"
            onClick={() => tableLineOp("insertTableRow", cell.row)}
          >
            + Row
          </CockpitBtn>
          <CockpitBtn
            sm
            testId="delete-row"
            onClick={() => tableLineOp("deleteTableRow", cell.row)}
          >
            − Row
          </CockpitBtn>
          <CockpitBtn
            sm
            testId="insert-column"
            onClick={() => tableLineOp("insertTableColumn", cell.col)}
          >
            + Col
          </CockpitBtn>
          <CockpitBtn
            sm
            testId="delete-column"
            onClick={() => tableLineOp("deleteTableColumn", cell.col)}
          >
            − Col
          </CockpitBtn>
        </div>
      </CockpitSection>

      <CockpitSection title="Header & footer">
        <CockpitRow label="Header rows">
          <div className="flex items-center gap-[5px]">
            <CockpitBtn
              sm
              testId="insert-header-row"
              onClick={() => headerFooterOp("insertHeaderRow")}
            >
              + Header
            </CockpitBtn>
            <CockpitBtn
              sm
              testId="remove-header-row"
              onClick={() => headerFooterOp("removeHeaderRow")}
            >
              − Header
            </CockpitBtn>
            <span className="pg-mono-meta" data-header-count>
              {headerApplied}
            </span>
          </div>
        </CockpitRow>
        <CockpitRow label="Footer rows">
          <div className="flex items-center gap-[5px]">
            <CockpitBtn
              sm
              testId="insert-footer-row"
              onClick={() => headerFooterOp("insertFooterRow")}
            >
              + Footer
            </CockpitBtn>
            <CockpitBtn
              sm
              testId="remove-footer-row"
              onClick={() => headerFooterOp("removeFooterRow")}
            >
              − Footer
            </CockpitBtn>
            <span className="pg-mono-meta" data-footer-count>
              {footerApplied}
            </span>
          </div>
        </CockpitRow>
        {/* Header / footer rows count toward the table's total row count;
            the engine exposes no separate header/footer read, so the
            count beside each control is the panel-applied delta. */}
        <CockpitRow label="Total rows">
          <span className="pg-mono-meta" data-table-total-rows>
            {tableRead?.rowCount != null ? tableRead.rowCount : "—"}
          </span>
        </CockpitRow>
      </CockpitSection>

      <CockpitSection title="Merge & split">
        <CockpitRow label="Row span">
          <NumberCommit
            testId="row-span"
            value={rowSpan}
            onCommit={(v) => applySpan(v, columnSpan)}
          />
        </CockpitRow>
        <CockpitRow label="Column span">
          <NumberCommit
            testId="column-span"
            value={columnSpan}
            onCommit={(v) => applySpan(rowSpan, v)}
          />
        </CockpitRow>
        <div className="flex gap-[5px] px-3 pb-1 pt-1">
          <CockpitBtn
            sm
            testId="merge-cells"
            onClick={() => applySpan(Math.max(2, rowSpan), Math.max(2, columnSpan))}
          >
            Merge 2×2
          </CockpitBtn>
          <CockpitBtn sm testId="split-cells" onClick={() => applySpan(1, 1)}>
            Split
          </CockpitBtn>
        </div>
        <div className="px-3">
          <span className="pg-mono-meta" data-cell-span>
            {rowSpan} × {columnSpan}
          </span>
        </div>
      </CockpitSection>

      <CockpitSection title="Cell">
        <CockpitRow label="Fill">
          <span className="relative inline-flex w-full">
            <select
              data-cell-fill-select
              value={cellRead?.fillColor ?? ""}
              onChange={(e) =>
                setCellProp("cellFillColor", {
                  type: "colorRef",
                  value: e.target.value === "" ? null : e.target.value,
                })
              }
              className="h-[28px] w-full appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12px]"
              style={{ color: "var(--pg-fg)" }}
            >
              <option value="">[None]</option>
              {(swatches ?? []).map((s) => (
                <option key={s.selfId} value={s.selfId}>
                  {displayName(s.name)}
                </option>
              ))}
            </select>
            <Icon
              name="ui-chevron-down"
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </span>
        </CockpitRow>
        <CockpitRow label="Insets (T L B R)">
          <div className="grid grid-cols-4 gap-1">
            <NumberCommit
              testId="inset-top"
              value={cellRead?.insetTop}
              onCommit={(v) =>
                setCellProp("cellInsetTop", { type: "length", value: v })
              }
            />
            <NumberCommit
              testId="inset-left"
              value={cellRead?.insetLeft}
              onCommit={(v) =>
                setCellProp("cellInsetLeft", { type: "length", value: v })
              }
            />
            <NumberCommit
              testId="inset-bottom"
              value={cellRead?.insetBottom}
              onCommit={(v) =>
                setCellProp("cellInsetBottom", { type: "length", value: v })
              }
            />
            <NumberCommit
              testId="inset-right"
              value={cellRead?.insetRight}
              onCommit={(v) =>
                setCellProp("cellInsetRight", { type: "length", value: v })
              }
            />
          </div>
        </CockpitRow>
        <CockpitRow label="Vert. justify">
          <span className="relative inline-flex w-full">
            <select
              data-cell-vjustify-select
              value={cellRead?.verticalJustification ?? ""}
              onChange={(e) =>
                setCellProp("cellVerticalJustification", {
                  type: "text",
                  value: e.target.value,
                })
              }
              className="h-[28px] w-full appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12px]"
              style={{ color: "var(--pg-fg)" }}
            >
              {VJUSTIFY.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Icon
              name="ui-chevron-down"
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </span>
        </CockpitRow>
      </CockpitSection>

      <CockpitSection title="Cell strokes">
        {/* v35 per-cell edge strokes — colour / weight / tint per edge,
            all read back from the cell properties surface. */}
        {(
          [
            ["Top", cellRead?.edgeTop ?? EMPTY_EDGE],
            ["Bottom", cellRead?.edgeBottom ?? EMPTY_EDGE],
            ["Left", cellRead?.edgeLeft ?? EMPTY_EDGE],
            ["Right", cellRead?.edgeRight ?? EMPTY_EDGE],
          ] as Array<[string, EdgeStroke]>
        ).map(([side, edge]) => (
          <CockpitRow key={side} label={side}>
            <div className="grid grid-cols-[1fr_56px_56px] gap-1">
              <span className="relative inline-flex w-full">
                <select
                  data-edge-color-select={side.toLowerCase()}
                  value={edge.color ?? ""}
                  onChange={(e) => setEdgeColor(side, e.target.value)}
                  className="h-[28px] w-full appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12px]"
                  style={{ color: "var(--pg-fg)" }}
                >
                  <option value="">[None]</option>
                  {(swatches ?? []).map((s) => (
                    <option key={s.selfId} value={s.selfId}>
                      {displayName(s.name)}
                    </option>
                  ))}
                </select>
                <Icon
                  name="ui-chevron-down"
                  size={13}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--pg-muted-fg)" }}
                />
              </span>
              <NumberCommit
                testId={`edge-weight-${side.toLowerCase()}`}
                placeholder="Wt"
                value={edge.weight ?? undefined}
                onCommit={(v) => setEdgeWeight(side, v)}
              />
              <NumberCommit
                testId={`edge-tint-${side.toLowerCase()}`}
                placeholder="Tint"
                value={edge.tint ?? undefined}
                onCommit={(v) => setEdgeTint(side, v)}
              />
            </div>
          </CockpitRow>
        ))}
      </CockpitSection>

      <CockpitSection title="Applied styles">
        <CockpitRow label="Cell style">
          <StyleSelect
            testId="apply-cell-style"
            collection="cellStyles"
            items={cellStyles ?? []}
            value={cellRead?.appliedCellStyle ?? ""}
            onApply={(id) =>
              setCellProp("appliedCellStyle", { type: "text", value: id })
            }
          />
        </CockpitRow>
        <CockpitRow label="Table style">
          <StyleSelect
            testId="apply-table-style"
            collection="tableStyles"
            items={tableStyles ?? []}
            value={tableRead?.appliedTableStyle ?? ""}
            onApply={setTableStyle}
          />
        </CockpitRow>
      </CockpitSection>

      <div
        className="pg-ui-xs"
        data-table-text-note
        style={{ padding: "4px 14px 14px", lineHeight: 1.45, color: "var(--pg-muted-fg)" }}
      >
        Cell text: pick the Type tool and click into a cell to edit its
        text in place. This panel edits cell structure, fills, strokes,
        insets, spans, and styles.
      </div>
    </div>
  );
}

/** A bare number input that commits its value on Enter / blur. Seeds
 *  from `value` when provided (read-back); placeholder-only inputs
 *  (row height / column width — no read surface) stay blank until the
 *  user types. */
function NumberCommit({
  value,
  placeholder,
  onCommit,
  testId,
}: {
  value?: number;
  placeholder?: string;
  onCommit: (v: number) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState<string>("");
  // Sync the draft to the read-back value when it changes (and the
  // field isn't mid-edit — a blank draft means "show the model").
  useEffect(() => {
    if (value != null) setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
  };
  return (
    <input
      type="number"
      data-num-input={testId}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={commit}
      className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[12px] tabular-nums"
      style={{ color: "var(--pg-fg)" }}
    />
  );
}

/** Applied-style select over a real *Styles collection. */
function StyleSelect({
  items,
  value,
  collection,
  onApply,
  testId,
}: {
  items: ReadonlyArray<{ selfId: string; name: string }>;
  value: string;
  collection: string;
  onApply: (id: string) => void;
  testId: string;
}) {
  return (
    <span className="relative inline-flex w-full">
      <select
        data-apply-select={testId}
        data-collection={collection}
        value={value}
        onChange={(e) => onApply(e.target.value)}
        className="h-[28px] w-full appearance-none rounded-[6px] border border-input bg-background pl-2.5 pr-7 text-[12px]"
        style={{ color: "var(--pg-fg)" }}
      >
        <option value="">[None]</option>
        {items.map((s) => (
          <option key={s.selfId} value={s.selfId}>
            {displayName(s.name)}
          </option>
        ))}
      </select>
      <Icon
        name="ui-chevron-down"
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
        style={{ color: "var(--pg-muted-fg)" }}
      />
    </span>
  );
}
