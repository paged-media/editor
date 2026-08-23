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

import type { ReactNode } from "react";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import {
  useOptionalOverlaySignals,
  type ToolPreviewShape,
} from "../state/overlay-signals-context";

/** Longest label the text preview renders — a readout HUD, not a
 *  paragraph; the cap also keeps the plate-width estimate sane. */
const TEXT_PREVIEW_MAX_CHARS = 160;

/** Plain text only: strip control characters (incl. newlines — SVG
 *  <text> has no line breaking) and cap the length. React escapes the
 *  text child, so no markup ever executes; this strip is the rest of
 *  the plain-text guarantee for a plugin-supplied string. */
function sanitizePreviewText(raw: string): string {
  return String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim()
    .slice(0, TEXT_PREVIEW_MAX_CHARS);
}

/**
 * Concept 1 — the active tool handler's in-progress preview (the
 * Rectangle rubber-band today; a future Pen path / Line preview reuses
 * the same signal). Solid stroke — visually distinct from the dashed
 * selection marquee. The writer is the gesture handler via
 * `paged.overlaySignals.setToolPreview`.
 *
 * K-9 — the slot may hold a LIST (`setToolPreviews`): a plugin tool
 * showing geometry AND a readout at once, or shading every collected
 * region. Each shape resolves its OWN page rect, so a list may span
 * pages; they draw in array order, first = bottom-most.
 */
function ToolPreviewRender(props: OverlayProps) {
  const signals = useOptionalOverlaySignals();
  const slot = signals?.toolPreview;
  if (!slot) return null;
  const shapes: readonly ToolPreviewShape[] = Array.isArray(slot)
    ? (slot as readonly ToolPreviewShape[])
    : [slot as ToolPreviewShape];
  if (shapes.length === 0) return null;
  // The single-shape case renders EXACTLY the node it always did — no
  // wrapper — so every existing preview keeps its DOM.
  if (shapes.length === 1) return renderPreviewShape(shapes[0], props);
  return (
    <>
      {shapes.map((shape, i) => (
        // Positional key: the list is republished wholesale on every
        // pointermove, so there is no identity to preserve across
        // renders.
        // eslint-disable-next-line react/no-array-index-key
        <g key={i}>{renderPreviewShape(shape, props)}</g>
      ))}
    </>
  );
}

/** One preview shape → its SVG node (or null when its page is off
 *  screen). Split out of the component so the single- and multi-shape
 *  paths share one renderer — the vocabulary must not fork. */
function renderPreviewShape(
  p: ToolPreviewShape,
  props: OverlayProps,
): ReactNode {
  const pr = props.pageRects.get(p.pageId);
  if (!pr) return null;
  // Editor-ops — gridify variant (W2.7): the N×M cell outlines a
  // rectangle/frame drag splits into under arrow keys. Each cell is a
  // rect in the same stroke family as the single rubber-band.
  if ("cells" in p) {
    return (
      <g fill="none" stroke="var(--overlay-snap)" strokeWidth={1.25}>
        {p.cells.map(([top, left, bottom, right], i) => (
          <rect
            // Static list (one published grid frame); index key is stable.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            x={pr.x + left}
            y={pr.y + top}
            width={Math.max(0, right - left)}
            height={Math.max(0, bottom - top)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      </g>
    );
  }
  // B-07 — path/cubic variant (in-progress pen). The signal carries
  // the true anchor/handle run, so we emit ONE real <path> of `C`
  // commands rather than a flattened polyline — exact at any zoom, no
  // per-pointermove sampling. Same snap-teal stroke as the rest of the
  // tool-preview family; `dashed` opts into the dashed vocabulary.
  if ("anchors" in p) {
    const a = p.anchors;
    if (a.length < 2) return null;
    // M to anchor 0, then a cubic per segment using the outgoing handle
    // of the start anchor (`right`) and the incoming handle of the end
    // anchor (`left`) as the two control points — IDML PathPointType
    // semantics, identical to how the engine reads the committed path.
    const seg = (
      from: (typeof a)[number],
      to: (typeof a)[number],
    ): string =>
      `C ${pr.x + from.right[0]},${pr.y + from.right[1]} ` +
      `${pr.x + to.left[0]},${pr.y + to.left[1]} ` +
      `${pr.x + to.anchor[0]},${pr.y + to.anchor[1]}`;
    let d = `M ${pr.x + a[0].anchor[0]},${pr.y + a[0].anchor[1]}`;
    for (let i = 0; i < a.length - 1; i++) d += ` ${seg(a[i], a[i + 1])}`;
    if (p.close) d += ` ${seg(a[a.length - 1], a[0])} Z`;
    return (
      <path
        d={d}
        fill="none"
        stroke="var(--overlay-snap)"
        strokeWidth={1.25}
        {...(p.dashed ? { strokeDasharray: "4 3" } : {})}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  // The overlay TEXT primitive (plugin RFI "overlay carries shapes
  // only") — an on-canvas readout (paged.draw's Measure HUD). Rendered
  // at constant SCREEN size via the page-caption idiom (translate to
  // the doc-space anchor, then scale by 1/camera so the label never
  // zooms). Colours ride the snap-teal preview family; the fill
  // attribute is the globals.css re-apply hook (SVG presentation
  // attributes can't resolve var() — the attribute IS the hook).
  // `kind` exists only on the text variant today, so the presence check
  // alone narrows BOTH branches (a compound `p.kind === "text"` check
  // would leave the rect fallback un-narrowed).
  if ("kind" in p) {
    const label = sanitizePreviewText(p.text);
    if (!label) return null;
    const size = Math.min(48, Math.max(6, p.size ?? 11));
    const anchor = p.anchor ?? "start";
    const inv = 1 / props.camera.scale;
    // Conservative plate sizing — no measurement pass for a transient
    // HUD: ~0.62em average advance + 4px pads (page-decorations' badge
    // idiom). textAnchor moves the TEXT; the plate x follows it.
    const textW = label.length * size * 0.62;
    const plateW = textW + 8;
    const plateX =
      anchor === "middle" ? -plateW / 2 : anchor === "end" ? -(textW + 4) : -4;
    return (
      <g
        transform={`translate(${pr.x + p.x}, ${pr.y + p.y}) scale(${inv})`}
        pointerEvents="none"
      >
        {p.background ? (
          <rect
            x={plateX}
            y={-(size * 0.8 + 3)}
            width={plateW}
            height={size + 6}
            rx={3}
            fill="var(--overlay-snap)"
            fillOpacity={0.92}
          />
        ) : null}
        <text
          textAnchor={anchor}
          fontSize={size}
          fontFamily="var(--font-sans)"
          // On the teal plate the label is white (the anchor-badge
          // contrast idiom); bare text is the snap-teal token itself.
          fill={p.background ? "white" : "var(--overlay-snap)"}
        >
          {label}
        </text>
      </g>
    );
  }
  // Editor-ops — polyline variant (Line drag, Pencil stroke,
  // Gradient axis). Same stroke as the rect rubber-band so every
  // tool preview reads as one visual family.
  if ("points" in p) {
    const pts = p.points
      .map(([x, y]) => `${pr.x + x},${pr.y + y}`)
      .join(" ");
    const Tag = p.close ? "polygon" : "polyline";
    return (
      <Tag
        points={pts}
        fill="none"
        stroke="var(--overlay-snap)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  }
  const [top, left, bottom, right] = p.rect;
  return (
    <rect
      x={pr.x + left}
      y={pr.y + top}
      width={Math.max(0, right - left)}
      height={Math.max(0, bottom - top)}
      fill="none"
      stroke="var(--overlay-snap)"
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
