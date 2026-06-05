// SDK Phase 3 / gallery pixel-parity — Object/Transform panel,
// composed to the deep1 card (gallery-deep1.jsx `ObjectT`). Bespoke:
// the X/Y + W/H metrics are DERIVED projections over the one
// `frameBounds` value (a projection the §11.5 composition ceiling
// can't express).
//
//   [ref grid] Reference point         seam (no engine convention)
//   [X …  | Y … ]   2-up prefixes      LIVE (translate)
//   [W …  | H … ] 🔒 2-up + lock        LIVE (resize) · lock = seam
//   Rotate & scale (open disclosure)
//     SmartDial micro Rotation          seam (decompose gap 6/16)
//     [100 % | 100 %] scale 2-up        seam
//     [Flip H][Flip V] soft buttons     seam

import { Icon, ReferencePointGrid, useBindings } from "@paged-media/shell";
import { LengthInput, NumberInput, SmartDialMicro } from "@paged-media/ui";
import { useState } from "react";
import type { Value } from "@paged-media/client";

const BINDINGS = {
  bounds: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameBounds" as const,
  },
  opacity: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameOpacity" as const,
  },
};

function unwrapBounds(
  v: Value | null,
): [number, number, number, number] | null {
  if (!v || v.type !== "bounds") return null;
  return v.value as [number, number, number, number];
}

function unwrapLength(v: Value | null): number | null {
  if (!v || v.type !== "length") return null;
  return v.value ?? 0;
}

export function ObjectTransformPanel() {
  const resolved = useBindings(BINDINGS);
  const bounds = unwrapBounds(resolved.bounds.value);
  const opacity = unwrapLength(resolved.opacity.value);
  const canWrite = resolved.bounds.onCommit != null;
  const [rsOpen, setRsOpen] = useState(true);

  // Derived projection: IDML bounds are [top, left, bottom, right].
  const x = bounds ? bounds[1] : null;
  const y = bounds ? bounds[0] : null;
  const w = bounds ? bounds[3] - bounds[1] : null;
  const h = bounds ? bounds[2] - bounds[0] : null;

  const commitBounds = (next: [number, number, number, number]) => {
    resolved.bounds.onCommit?.({ type: "bounds", value: next } as Value);
  };

  return (
    <div
      className="p-3 flex flex-col gap-[9px]"
      data-object-transform-panel="ready"
    >
      <div className="flex flex-col gap-[9px]" data-section="Object">
        {/* Reference point — inert until the engine grows a
            reference-point convention (transforms anchor top-left). */}
        <div className="mb-[3px] flex items-center gap-[14px]">
          <ReferencePointGrid value={0} disabled />
          <span
            className="text-[10.5px]"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Reference point
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" data-position-cells>
          <LengthInput
            prefix="X"
            valuePt={x}
            disabled={!canWrite}
            onChangePt={() => {}}
            onCommitPt={(nx) => {
              if (x === null || y === null || w === null || h === null) return;
              commitBounds([y, nx, y + h, nx + w]);
            }}
            aria-label="x"
          />
          <LengthInput
            prefix="Y"
            valuePt={y}
            disabled={!canWrite}
            onChangePt={() => {}}
            onCommitPt={(ny) => {
              if (x === null || y === null || w === null || h === null) return;
              commitBounds([ny, x, ny + h, x + w]);
            }}
            aria-label="y"
          />
        </div>
        <div className="flex items-center gap-2" data-size-cells>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <LengthInput
              prefix="W"
              valuePt={w}
              min={0}
              disabled={!canWrite}
              onChangePt={() => {}}
              onCommitPt={(nw) => {
                if (x === null || y === null || h === null) return;
                commitBounds([y, x, y + h, x + nw]);
              }}
              aria-label="width"
            />
            <LengthInput
              prefix="H"
              valuePt={h}
              min={0}
              disabled={!canWrite}
              onChangePt={() => {}}
              onCommitPt={(nh) => {
                if (x === null || y === null || w === null) return;
                commitBounds([y, x, y + nh, x + w]);
              }}
              aria-label="height"
            />
          </div>
          {/* Lock aspect — awaiting a constrain convention. */}
          <button
            type="button"
            disabled
            data-seam
            data-lock-aspect
            title="Lock aspect — awaiting engine support"
            className="h-[28px] w-[28px] shrink-0 rounded-[6px] border border-input bg-background opacity-55"
          >
            <Icon
              name="ui-component"
              size={14}
              className="mx-auto"
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </button>
        </div>
        <div className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
            Opacity
          </span>
          <NumberInput
            icon="ui-size"
            suffix="%"
            value={opacity}
            min={0}
            max={100}
            precision={0}
            disabled={resolved.opacity.onCommit == null}
            onChange={() => {}}
            onCommit={(next) => {
              resolved.opacity.onCommit?.({
                type: "length",
                value: next,
              } as Value);
            }}
            aria-label="opacity"
          />
        </div>
        {/* Rotate & scale — awaiting the rotation/scale decompose
            primitive on frameTransform (engine roadmap gap 6/16). */}
        <div
          className="-mx-3 border-t border-input px-3"
          data-section="Rotate & scale"
          data-seam
        >
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-[9px] text-left"
            data-section-toggle
            aria-expanded={rsOpen}
            onClick={() => setRsOpen(!rsOpen)}
          >
            <span
              className="whitespace-nowrap text-[12.5px] font-semibold"
              style={{ color: "var(--pg-fg)" }}
            >
              Rotate &amp; scale
            </span>
            <Icon
              name={rsOpen ? "ui-chevron-down" : "ui-chevron-right"}
              size={14}
              style={{ color: "var(--pg-muted-fg)" }}
            />
          </button>
          {rsOpen && (
            <div className="flex flex-col gap-[9px] pb-3">
              <SmartDialMicro
                label="Rotation"
                value={null}
                min={-180}
                max={180}
                unit="°"
                signed
                disabled
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  value={null}
                  icon="ui-size"
                  displayText="100 %"
                  disabled
                  onChange={() => {}}
                  aria-label="scale x"
                />
                <NumberInput
                  value={null}
                  icon="ui-size"
                  displayText="100 %"
                  disabled
                  onChange={() => {}}
                  aria-label="scale y"
                />
              </div>
              <div className="flex gap-[6px]">
                <button
                  type="button"
                  disabled
                  data-flip-h
                  title="Flip horizontal — awaiting engine support"
                  className="h-[28px] flex-1 rounded-[6px] border-0 text-xs font-semibold opacity-55"
                  style={{
                    background: "var(--pg-muted)",
                    color: "var(--pg-fg)",
                  }}
                >
                  Flip H
                </button>
                <button
                  type="button"
                  disabled
                  data-flip-v
                  title="Flip vertical — awaiting engine support"
                  className="h-[28px] flex-1 rounded-[6px] border-0 text-xs font-semibold opacity-55"
                  style={{
                    background: "var(--pg-muted)",
                    color: "var(--pg-fg)",
                  }}
                >
                  Flip V
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
