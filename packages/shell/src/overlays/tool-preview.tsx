import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useOptionalOverlaySignals } from "../state/overlay-signals-context";

/**
 * Concept 1 — the active tool handler's in-progress preview (the
 * Rectangle rubber-band today; a future Pen path / Line preview reuses
 * the same signal). Solid stroke — visually distinct from the dashed
 * selection marquee. The writer is the gesture handler via
 * `paged.overlaySignals.setToolPreview`.
 */
function ToolPreviewRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  if (!signals?.toolPreview) return null;
  const p = signals.toolPreview;
  const pr = props.pageRects.get(p.pageId);
  if (!pr) return null;
  const [top, left, bottom, right] = p.rect;
  return (
    <rect
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="none"
      stroke="#0f766e"
      strokeWidth={1.25}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

export const toolPreviewContribution: OverlayContribution = {
  id: "paged.tool-preview",
  render: ToolPreviewRender,
  z: 420,
};
