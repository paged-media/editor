// W3.A2 — selected table cell outline.
//
// Draws a single outline around the currently-selected table cell (the
// `TableSelectionContext` cell, set by the canvas hit handler from
// `HitResult.tableContext`). Uses the design-system SELECTION colour
// (magenta, `--overlay-selection`) — the DTP "this is selected" cue,
// same token the selection chrome uses, distinct from the violet guide
// cue. Camera-constant stroke (`vectorEffect=non-scaling-stroke`) so the
// outline stays a hairline at any zoom.
//
// The outline rect prefers the precise per-cell AABB
// (`cell.cellRect`, resolved via `elementGeometry(cellElementId)` at
// selection time) and falls back to the containing table-frame AABB
// (`cell.frameBounds`) when the engine couldn't resolve a per-cell rect.
// Both are page-local pt `[top, left, bottom, right]`, shifted by the
// page origin at draw time — same convention as the guide overlay.

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalScreenMode } from "../state/screen-mode-context";
import { useOptionalTableSelection } from "../state/table-selection-context";

function TableCellOverlayRender(props: OverlayProps) {
  const ts = useOptionalTableSelection();
  // Selection chrome is editing affordance — Normal mode only (matches
  // the guide / selection overlays).
  const screenMode = useOptionalScreenMode();
  if (screenMode && screenMode.screenMode !== "normal") return null;
  if (!ts || !ts.cell) return null;

  const cell = ts.cell;
  const pr = props.pageRects.get(cell.pageId);
  if (!pr) return null;

  const rect = cell.cellRect ?? cell.frameBounds;
  if (!rect) return null;
  const [top, left, bottom, right] = rect;
  const inv = 1 / (props.camera.scale || 1);

  return (
    <rect
      data-table-cell-overlay
      data-cell-row={cell.row}
      data-cell-col={cell.col}
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="none"
      stroke="var(--overlay-selection)"
      strokeWidth={1.5 * inv}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

export const tableCellOverlayContribution: OverlayContribution = {
  id: "paged.table-cell-overlay",
  render: TableCellOverlayRender,
  // Above page decorations / guides, in the selection-chrome band so
  // the cell outline reads as a selection cue (z 200+).
  z: 210,
};
