// Cockpit — the canvas rulers (kit canvas.jsx HRuler + the sticky
// left strip). REAL: marks are document-space coordinates mapped
// through the live camera (scale + translate), so they track zoom
// and pan like a DTP ruler must.

import { useCamera } from "../../state/camera-context";

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
      style={{
        height: 22,
        position: "relative",
        background: "var(--chrome-panel-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        overflow: "hidden",
        flexShrink: 0,
        marginLeft: 22,
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
      style={{
        width: 22,
        position: "relative",
        background: "var(--chrome-panel-bg)",
        borderRight: "1px solid var(--chrome-border)",
        overflow: "hidden",
        flexShrink: 0,
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
