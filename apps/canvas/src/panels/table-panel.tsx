// W3.A2 — the LIVE Table panel.
//
// Brings the panel-gallery Table concept live against the v30 table
// surface (6 table ops + the cell PropertyPaths). Drives the SELECTED
// table cell (the `TableSelectionContext`, set by the canvas hit
// handler off `HitResult.tableContext`):
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
// All cell + applied-style values READ BACK via
// elementProperties(cell|table) and re-fetch on every Operation push,
// so the inputs reflect engine truth. Row/column COUNTS are NOT on the
// wire (elementProperties(table) carries only appliedTableStyle, no
// dimensions) and a cell's row HEIGHT / column WIDTH are write-forward
// (no read entry) — both are surfaced honestly as the selected cell's
// (row, col) address + an engine-gap note. CELL TEXT editing is not
// possible in engine v1 (note in the panel).

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

interface CellReadback {
  fillColor: string | null;
  insetTop: number;
  insetLeft: number;
  insetBottom: number;
  insetRight: number;
  verticalJustification: string;
  appliedCellStyle: string;
}

interface TableReadback {
  appliedTableStyle: string;
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
            },
            table: {
              appliedTableStyle: ats && ats.type === "text" ? ats.value : "",
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
        {/* Row / column COUNTS are not on the wire (the Table NodeId
            read carries only appliedTableStyle); honest seam. */}
        <div
          className="pg-ui-xs"
          style={{ color: "var(--pg-muted-fg)", marginTop: 4 }}
        >
          Row / column totals aren’t exposed by the engine yet.
        </div>
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
        Cell text editing isn’t available yet (engine v1) — edit cell
        structure, fills, insets, and styles here.
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
