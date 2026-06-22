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

// SDK Phase 3 / gallery pixel-parity — Object/Transform panel,
// composed to the deep1 card (gallery-deep1.jsx `ObjectT`). Bespoke:
// the X/Y + W/H metrics are DERIVED projections over the one
// `frameBounds` value (a projection the §11.5 composition ceiling
// can't express).
//
//   [ref grid] Reference point         LIVE  (W2.4, client-side anchor)
//   [X …  | Y … ]   2-up prefixes      LIVE (translate)
//   [W …  | H … ] 🔒 2-up + lock        LIVE (resize) · lock = seam
//   Rotate & scale (open disclosure)
//     SmartDial micro Rotation          LIVE  (W2.3 decompose)
//     [100 % | 100 %] scale 2-up        LIVE  (W2.3 decompose)
//     [Flip H][Flip V] soft buttons     Flip H LIVE · Flip V seam
//
// W2.3 (2026-06-06) — protocol v28 lands the transform-decompose
// primitive (engine gap 6/16). Read = decomposed components of the
// node's `item_transform`; write recomposes. `frameRotationAngle`
// (deg) / `frameScaleX` / `frameScaleY` (multiplier; 1.0 = 100%) read
// as `Value::Length`; `frameFlipH` as `Value::Bool`. NOTE Flip V:
// `frameFlipV` is WRITE-only on the v28 wire — the read-side reflects
// `frameFlipH` only — so the Flip V button stays a seam (it would
// em-dash on read). All five apply to every path kind + Group.
//
// W2.4 (2026-06-07) — the 3×3 reference-point grid is now LIVE. The
// anchor is UI state, NOT model state (InDesign keeps it as a panel
// affordance too): the chosen 9-point anchor selects which corner /
// edge / centre of the frame stays FIXED when the user edits W/H (or
// scale). The math is pure client-side over the existing `frameBounds`
// path — no new op, no new PropertyPath.

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
  rotation: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameRotationAngle" as const,
  },
  scaleX: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameScaleX" as const,
  },
  scaleY: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameScaleY" as const,
  },
  flipH: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameFlipH" as const,
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

function unwrapBool(v: Value | null): boolean | null {
  if (!v || v.type !== "bool") return null;
  return v.value === true;
}

// W2.4 — the 9-point anchor as (col, row), col/row ∈ {0,1,2}. Index 0
// = top-left, 4 = centre, 8 = bottom-right (row-major, matching
// ReferencePointGrid + the IDML 9-point vocabulary).
function anchorFractions(index: number): { fx: number; fy: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { fx: col / 2, fy: row / 2 };
}

export function ObjectTransformPanel() {
  const resolved = useBindings(BINDINGS);
  const bounds = unwrapBounds(resolved.bounds.value);
  const opacity = unwrapLength(resolved.opacity.value);
  const canWrite = resolved.bounds.onCommit != null;
  const [rsOpen, setRsOpen] = useState(true);
  // W2.4 — reference-point anchor (UI state). Default top-left (0).
  const [anchorIdx, setAnchorIdx] = useState(0);

  // W2.3 transform-decompose reads (deg / multiplier / bool).
  const rotation = unwrapLength(resolved.rotation.value);
  // Scale is a 0..1+ multiplier engine-side; the kit shows percent.
  const scaleX = unwrapLength(resolved.scaleX.value);
  const scaleY = unwrapLength(resolved.scaleY.value);
  const flipH = unwrapBool(resolved.flipH.value);
  const canRotate = resolved.rotation.onCommit != null;
  const canScaleX = resolved.scaleX.onCommit != null;
  const canScaleY = resolved.scaleY.onCommit != null;
  const canFlipH = resolved.flipH.onCommit != null;

  // Derived projection: IDML bounds are [top, left, bottom, right].
  const x = bounds ? bounds[1] : null;
  const y = bounds ? bounds[0] : null;
  const w = bounds ? bounds[3] - bounds[1] : null;
  const h = bounds ? bounds[2] - bounds[0] : null;

  const commitBounds = (next: [number, number, number, number]) => {
    resolved.bounds.onCommit?.({ type: "bounds", value: next } as Value);
  };

  // W2.4 — resize keeping the chosen anchor point fixed. `nw`/`nh` are
  // the new width / height; the anchor's absolute position (a fraction
  // of the old box) is preserved by shifting the opposite edges. With
  // anchor = top-left (default) this collapses to the legacy
  // grow-right / grow-down behaviour.
  const commitWidth = (nw: number) => {
    if (x === null || y === null || w === null || h === null) return;
    const { fx } = anchorFractions(anchorIdx);
    const anchorX = x + fx * w;
    const left = anchorX - fx * nw;
    commitBounds([y, left, y + h, left + nw]);
  };
  const commitHeight = (nh: number) => {
    if (x === null || y === null || w === null || h === null) return;
    const { fy } = anchorFractions(anchorIdx);
    const anchorY = y + fy * h;
    const top = anchorY - fy * nh;
    commitBounds([top, x, top + nh, x + w]);
  };

  return (
    <div
      className="p-3 flex flex-col gap-[9px]"
      data-object-transform-panel="ready"
    >
      <div className="flex flex-col gap-[9px]" data-section="Object">
        {/* W2.4 — reference point (UI state). Selects which 9-point
            anchor of the frame stays fixed when W/H is edited. Pure
            client-side math over frameBounds — no engine convention
            needed (InDesign also keeps this as a panel affordance). */}
        <div
          className="mb-[3px] flex items-center gap-[14px]"
          data-reference-point-anchor={anchorIdx}
        >
          <ReferencePointGrid
            value={anchorIdx}
            disabled={!canWrite}
            onChange={(i) => setAnchorIdx(i)}
          />
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
              onCommitPt={(nw) => commitWidth(nw)}
              aria-label="width"
            />
            <LengthInput
              prefix="H"
              valuePt={h}
              min={0}
              disabled={!canWrite}
              onChangePt={() => {}}
              onCommitPt={(nh) => commitHeight(nh)}
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
        {/* Rotate & scale — W2.3 transform-decompose. Read =
            decomposed components of item_transform; write recomposes.
            Flip V stays a seam: frameFlipV is write-only on the v28
            wire (the read-side reflects frameFlipH only). */}
        <div
          className="-mx-3 border-t border-input px-3"
          data-section="Rotate & scale"
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
                value={rotation}
                min={-180}
                max={180}
                unit="°"
                signed
                disabled={!canRotate}
                onChange={() => {
                  /* live updates ignored; commit on drag-end / wheel */
                }}
                onCommit={(next) => {
                  resolved.rotation.onCommit?.({
                    type: "length",
                    value: next,
                  } as Value);
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  value={scaleX == null ? null : scaleX * 100}
                  icon="ui-size"
                  suffix="%"
                  min={0}
                  precision={0}
                  disabled={!canScaleX}
                  onChange={() => {}}
                  onCommit={(next) => {
                    resolved.scaleX.onCommit?.({
                      type: "length",
                      value: next / 100,
                    } as Value);
                  }}
                  aria-label="scale x"
                />
                <NumberInput
                  value={scaleY == null ? null : scaleY * 100}
                  icon="ui-size"
                  suffix="%"
                  min={0}
                  precision={0}
                  disabled={!canScaleY}
                  onChange={() => {}}
                  onCommit={(next) => {
                    resolved.scaleY.onCommit?.({
                      type: "length",
                      value: next / 100,
                    } as Value);
                  }}
                  aria-label="scale y"
                />
              </div>
              <div className="flex gap-[6px]">
                <button
                  type="button"
                  disabled={!canFlipH}
                  data-flip-h
                  data-on={flipH === true ? "true" : "false"}
                  title="Flip horizontal"
                  className="h-[28px] flex-1 rounded-[6px] border-0 text-xs font-semibold"
                  style={{
                    background: flipH ? "var(--pg-primary)" : "var(--pg-muted)",
                    color: flipH ? "var(--pg-primary-fg)" : "var(--pg-fg)",
                    opacity: canFlipH ? 1 : 0.55,
                  }}
                  onClick={() => {
                    resolved.flipH.onCommit?.({
                      type: "bool",
                      value: !(flipH === true),
                    } as Value);
                  }}
                >
                  Flip H
                </button>
                <button
                  type="button"
                  disabled
                  data-flip-v
                  data-seam
                  title="Flip vertical — write-only on the v28 wire (no read-side reflection)"
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
