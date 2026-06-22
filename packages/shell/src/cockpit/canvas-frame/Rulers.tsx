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

// Cockpit — the canvas rulers (kit canvas.jsx HRuler + the sticky
// left strip). REAL: marks are document-space coordinates mapped
// through the live camera (scale + translate), so they track zoom
// and pan like a DTP ruler must.
//
// W2.8 — each ruler strip is also a GUIDE hit zone: a pointer-down
// anywhere on the strip drags a new guide out onto the canvas (GD-01).
// HRuler → horizontal guides, VRulerStrip → vertical, matching
// InDesign. Works with ANY active tool (no tool switch) — the strip
// captures the pointer-down before it reaches the viewport / tool
// spine. The controller (GuideDragController) tracks the rest of the
// drag and commits on release; here we only START it.

import { useCamera } from "../../state/camera-context";
import { useOptionalGuideDrag } from "../../state/guide-drag-context";

/** Pick a "nice" doc-space step so marks sit 60–140 px apart. */
function rulerStep(scale: number): number {
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  for (const s of steps) {
    if (s * scale >= 60) return s;
  }
  return steps[steps.length - 1];
}

export function HRuler() {
  const { camera, viewportSize } = useCamera();
  const guideDrag = useOptionalGuideDrag();
  const width = viewportSize[0] || 0;
  const step = rulerStep(camera.scale);
  const marks: Array<{ px: number; label: number }> = [];
  if (width > 0 && camera.scale > 0) {
    const docStart = (0 - camera.tx) / camera.scale;
    const first = Math.floor(docStart / step) * step;
    for (let d = first; d * camera.scale + camera.tx < width; d += step) {
      marks.push({ px: d * camera.scale + camera.tx, label: d });
    }
  }
  return (
    <div
      data-h-ruler
      onPointerDown={
        guideDrag
          ? (e) => {
              // GD-01 — drag a HORIZONTAL guide out of the top ruler.
              if (e.button !== 0) return;
              e.preventDefault();
              guideDrag.beginCreate("horizontal");
            }
          : undefined
      }
      style={{
        height: 22,
        position: "relative",
        background: "var(--chrome-panel-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        overflow: "hidden",
        flexShrink: 0,
        marginLeft: 22,
        cursor: guideDrag ? "ns-resize" : undefined,
      }}
    >
      {marks.map((m) => (
        <div
          key={m.label}
          style={{
            position: "absolute",
            left: m.px,
            top: 0,
            bottom: 0,
            borderLeft: "1px solid var(--chrome-divider)",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 3,
              top: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--pg-muted-fg)",
              whiteSpace: "nowrap",
            }}
          >
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The 22px vertical strip down the canvas's left edge (kit keeps it
 *  plain — a quiet ruler track). */
export function VRulerStrip() {
  const { camera, viewportSize } = useCamera();
  const guideDrag = useOptionalGuideDrag();
  const height = viewportSize[1] || 0;
  const step = rulerStep(camera.scale);
  const marks: Array<{ px: number; label: number }> = [];
  if (height > 0 && camera.scale > 0) {
    const docStart = (0 - camera.ty) / camera.scale;
    const first = Math.floor(docStart / step) * step;
    for (let d = first; d * camera.scale + camera.ty < height; d += step) {
      marks.push({ px: d * camera.scale + camera.ty, label: d });
    }
  }
  return (
    <div
      data-v-ruler
      onPointerDown={
        guideDrag
          ? (e) => {
              // GD-01 — drag a VERTICAL guide out of the left ruler.
              if (e.button !== 0) return;
              e.preventDefault();
              guideDrag.beginCreate("vertical");
            }
          : undefined
      }
      style={{
        width: 22,
        position: "relative",
        background: "var(--chrome-panel-bg)",
        borderRight: "1px solid var(--chrome-border)",
        overflow: "hidden",
        flexShrink: 0,
        cursor: guideDrag ? "ew-resize" : undefined,
      }}
    >
      {marks.map((m) => (
        <div
          key={m.label}
          style={{
            position: "absolute",
            top: m.px,
            left: 0,
            right: 0,
            borderTop: "1px solid var(--chrome-divider)",
          }}
        />
      ))}
    </div>
  );
}
