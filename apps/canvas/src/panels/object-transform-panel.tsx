// SDK Phase 3 / panel-gallery pass — Object/Transform panel,
// shaped to the gallery card. Bespoke (not a composition): the
// gallery's X/Y + W/H rows are DERIVED views over the one
// `frameBounds` value — a projection the composition ceiling
// (§11.5: no expressions) deliberately can't express, so the
// panel derives and recomposes the bounds itself.
//
// LIVE: X/Y (translate, preserving size), W/H (resize, anchored
// top-left), opacity. HONEST SEAMS: reference-point grid,
// rotation + scale dials, Flip H/V — they await the engine's
// rotation/scale decompose primitive on frameTransform (roadmap
// gap; the gallery Target row).

import { ReferencePointGrid, useBindings } from "@paged-media/shell";
import { LengthInput, NumberInput } from "@paged-media/ui";
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

function MixedDash() {
  return (
    <span className="text-xs text-muted-foreground" data-mixed>
      —
    </span>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ObjectTransformPanel() {
  const resolved = useBindings(BINDINGS);
  const bounds = unwrapBounds(resolved.bounds.value);
  const opacity = unwrapLength(resolved.opacity.value);

  // Derived projection: IDML bounds are [top, left, bottom, right].
  const x = bounds ? bounds[1] : 0;
  const y = bounds ? bounds[0] : 0;
  const w = bounds ? bounds[3] - bounds[1] : 0;
  const h = bounds ? bounds[2] - bounds[0] : 0;

  const commitBounds = (next: [number, number, number, number]) => {
    resolved.bounds.onCommit?.({ type: "bounds", value: next } as Value);
  };

  return (
    <div
      className="p-3 flex flex-col gap-2"
      data-object-transform-panel="ready"
    >
      <div className="flex flex-col gap-2" data-section="Object">
        <FieldRow label="Reference point">
          {/* Inert until the engine grows a reference-point
              convention (transforms anchor top-left today). */}
          <ReferencePointGrid value={0} disabled />
        </FieldRow>
        <FieldRow label="X + Y">
          {bounds ? (
            <div className="grid grid-cols-2 gap-1" data-position-cells>
              <LengthInput
                label="X"
                unitPicker={false}
                valuePt={x}
                onChangePt={() => {}}
                onCommitPt={(nx) => commitBounds([y, nx, y + h, nx + w])}
                aria-label="x"
              />
              <LengthInput
                label="Y"
                unitPicker={false}
                valuePt={y}
                onChangePt={() => {}}
                onCommitPt={(ny) => commitBounds([ny, x, ny + h, x + w])}
                aria-label="y"
              />
            </div>
          ) : (
            <MixedDash />
          )}
        </FieldRow>
        <FieldRow label="W + H">
          {bounds ? (
            <div className="grid grid-cols-2 gap-1" data-size-cells>
              <LengthInput
                label="W"
                unitPicker={false}
                valuePt={w}
                min={0}
                onChangePt={() => {}}
                onCommitPt={(nw) => commitBounds([y, x, y + h, x + nw])}
                aria-label="width"
              />
              <LengthInput
                label="H"
                unitPicker={false}
                valuePt={h}
                min={0}
                onChangePt={() => {}}
                onCommitPt={(nh) => commitBounds([y, x, y + nh, x + w])}
                aria-label="height"
              />
            </div>
          ) : (
            <MixedDash />
          )}
        </FieldRow>
        <FieldRow label="Opacity">
          {opacity === null ? (
            <MixedDash />
          ) : (
            <NumberInput
              icon="ui-size"
              value={opacity}
              min={0}
              max={100}
              precision={0}
              onChange={() => {}}
              onCommit={(next) => {
                resolved.opacity.onCommit?.({
                  type: "length",
                  value: next,
                } as Value);
              }}
              aria-label="opacity"
            />
          )}
        </FieldRow>
        {/* Rotate & scale — awaiting the rotation/scale decompose
            primitive on frameTransform (engine roadmap). */}
        <fieldset
          className="border-t border-input pt-2"
          data-section="Rotate & scale"
          data-seam
        >
          <legend className="pg-label px-1">Rotate &amp; scale</legend>
          <div className="flex flex-col gap-2 pt-1">
            <FieldRow label="Rotation">
              <NumberInput
                label="°"
                value={0}
                disabled
                onChange={() => {}}
                aria-label="rotation"
              />
            </FieldRow>
            <FieldRow label="Scale X + Y">
              <div className="grid grid-cols-2 gap-1">
                <NumberInput
                  label="X"
                  value={100}
                  disabled
                  onChange={() => {}}
                  aria-label="scale x"
                />
                <NumberInput
                  label="Y"
                  value={100}
                  disabled
                  onChange={() => {}}
                  aria-label="scale y"
                />
              </div>
            </FieldRow>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled
                data-flip-h
                title="Flip horizontal — awaiting engine support"
                className="text-xs h-[28px] rounded-[6px] border border-input bg-background text-muted-foreground opacity-55"
              >
                Flip H
              </button>
              <button
                type="button"
                disabled
                data-flip-v
                title="Flip vertical — awaiting engine support"
                className="text-xs h-[28px] rounded-[6px] border border-input bg-background text-muted-foreground opacity-55"
              >
                Flip V
              </button>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
