// Concept 2 — the gradient ramp: a pure presentational + interactive
// component over the protocol-25 stop detail. Lives in shell (no ui
// dependency — shell cannot import ui) so both the FillStrokeCluster
// chips (readOnly) and the app's gradient editor reuse it.
//
// Stops carry the swatch REF as identity (gradients reference
// swatches, never inline colours — concept C7); `resolvedRgbHex` is
// only the painted preview. Thumbs drag along the track; midpoint
// diamonds sit between adjacent stops. All positions are 0..=100
// (the wire's locationPct/midpointPct units).

import { useRef, type CSSProperties, type PointerEvent } from "react";

export interface RampStop {
  stopColorRef: string;
  resolvedRgbHex: string;
  locationPct: number;
  /** Blend midpoint toward the NEXT stop; null = 50 (linear). */
  midpointPct: number | null;
}

export interface GradientRampProps {
  stops: RampStop[];
  /** "linear" | "radial" — affects the preview painting only. */
  kind?: string;
  selectedIndex?: number | null;
  readOnly?: boolean;
  height?: number;
  onSelectStop?: (index: number) => void;
  onMoveStop?: (index: number, locationPct: number) => void;
  onMoveMidpoint?: (index: number, midpointPct: number) => void;
  /** Click on empty track — add a stop at that location. */
  onAddStop?: (locationPct: number) => void;
  onCommit?: () => void;
}

/** CSS background for a stop list (shared with the chips). */
export function rampCss(stops: RampStop[], kind?: string): string {
  if (stops.length === 0) return "#d1d5db";
  const ordered = [...stops].sort((a, b) => a.locationPct - b.locationPct);
  const parts = ordered
    .map((s) => `${s.resolvedRgbHex} ${s.locationPct}%`)
    .join(", ");
  return kind === "radial"
    ? `radial-gradient(circle, ${parts})`
    : `linear-gradient(90deg, ${parts})`;
}

export function GradientRamp(props: GradientRampProps) {
  const {
    stops,
    kind,
    selectedIndex,
    readOnly,
    onSelectStop,
    onMoveStop,
    onMoveMidpoint,
    onAddStop,
    onCommit,
  } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ type: "stop" | "mid"; index: number } | null>(null);

  const pctAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  };

  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    // A click directly on the track (not a thumb) adds a stop.
    if (e.target === trackRef.current && onAddStop) {
      onAddStop(pctAt(e.clientX));
    }
  };

  const beginDrag = (type: "stop" | "mid", index: number) => (e: PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { type, index };
    if (type === "stop") onSelectStop?.(index);
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pct = pctAt(e.clientX);
    if (drag.type === "stop") onMoveStop?.(drag.index, pct);
    else {
      // Midpoint is RELATIVE to its segment: convert the absolute
      // track pct into 0..100 between stop i and i+1.
      const ordered = [...stops].sort((a, b) => a.locationPct - b.locationPct);
      const a = ordered[drag.index]?.locationPct ?? 0;
      const b = ordered[drag.index + 1]?.locationPct ?? 100;
      const span = Math.max(1e-3, b - a);
      const rel = Math.min(95, Math.max(5, ((pct - a) / span) * 100));
      onMoveMidpoint?.(drag.index, rel);
    }
  };

  const endDrag = () => {
    if (dragRef.current) {
      dragRef.current = null;
      onCommit?.();
    }
  };

  const ordered = [...stops].sort((a, b) => a.locationPct - b.locationPct);
  const height = props.height ?? 16;

  return (
    <div
      style={{ position: "relative", padding: readOnly ? 0 : "0 0 14px 0" }}
      data-gradient-ramp={readOnly ? "chip" : "ready"}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        style={{
          height,
          borderRadius: 3,
          border: "1px solid #d4d4d8",
          background: rampCss(stops, kind),
          cursor: readOnly ? "default" : "copy",
        }}
      />
      {!readOnly &&
        ordered.map((s, i) => (
          <button
            key={`stop-${i}`}
            type="button"
            data-ramp-stop={i}
            data-selected={selectedIndex === i ? "true" : undefined}
            title={`${s.stopColorRef} @ ${s.locationPct.toFixed(0)}%`}
            onPointerDown={beginDrag("stop", i)}
            style={{
              ...thumbStyle,
              left: `calc(${s.locationPct}% - 5px)`,
              top: height + 1,
              background: s.resolvedRgbHex,
              outline: selectedIndex === i ? "2px solid #1f2937" : undefined,
            }}
          />
        ))}
      {!readOnly &&
        ordered.slice(0, -1).map((s, i) => {
          const next = ordered[i + 1];
          const mid = s.midpointPct ?? 50;
          const abs = s.locationPct + ((next.locationPct - s.locationPct) * mid) / 100;
          return (
            <button
              key={`mid-${i}`}
              type="button"
              data-ramp-midpoint={i}
              title={`midpoint ${mid.toFixed(0)}%`}
              onPointerDown={beginDrag("mid", i)}
              style={{
                ...midStyle,
                left: `calc(${abs}% - 4px)`,
                top: -5,
              }}
            />
          );
        })}
    </div>
  );
}

const thumbStyle: CSSProperties = {
  position: "absolute",
  width: 10,
  height: 10,
  borderRadius: 2,
  border: "1px solid #1f2937",
  padding: 0,
  cursor: "ew-resize",
};

const midStyle: CSSProperties = {
  position: "absolute",
  width: 8,
  height: 8,
  transform: "rotate(45deg)",
  background: "#fff",
  border: "1px solid #6b7280",
  padding: 0,
  cursor: "ew-resize",
};
