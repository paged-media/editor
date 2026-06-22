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

// SDK Phase 5 (v1 sweep) — Align panel.
//
// Six-button alignment palette: align-left / -center-h / -right
// + align-top / -center-v / -bottom. Reads the current element
// selection + each frame's bounds, computes the target
// coordinate per kind (selection AABB edges or center), and
// dispatches a sequence of SetElementProperty(FrameBounds)
// mutations through the existing wire. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 3 + §10 audit
// register: declares `writes: ["geometry"]` since the commit set
// is a multi-target rewrite of frame bounds.
//
// v1 limitation: each frame is its own mutation entry on the
// undo stack (the wire-level Mutation doesn't expose Batch), so
// "Align Left" on 4 frames takes 4 Cmd-Z presses to revert. A
// follow-up wire-level Mutation::Batch coalesces this.

import { Icon, useCanvasClient, useSelection } from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";
import type { ElementId } from "@paged-media/client";

type AlignKind =
  | "left"
  | "centerH"
  | "right"
  | "top"
  | "centerV"
  | "bottom"
  | "distributeH"
  | "distributeV";

// Glyphs per the deep1 card (icon clusters with a divider —
// ui-rows/ui-cols-2/ui-rows are the kit's vertical stand-ins).
const ALIGN_H: Array<{ kind: AlignKind; icon: string; hint: string }> = [
  { kind: "left", icon: "ui-align-left", hint: "Align left" },
  { kind: "centerH", icon: "ui-align-center", hint: "Center horizontally" },
  { kind: "right", icon: "ui-align-right", hint: "Align right" },
];
const ALIGN_V: Array<{ kind: AlignKind; icon: string; hint: string }> = [
  { kind: "top", icon: "ui-rows", hint: "Align top" },
  { kind: "centerV", icon: "ui-cols-2", hint: "Center vertically" },
  { kind: "bottom", icon: "ui-rows", hint: "Align bottom" },
];

const DISTRIBUTE_BUTTONS: Array<{
  kind: AlignKind;
  icon: string;
  hint: string;
}> = [
  { kind: "distributeH", icon: "ui-cols-2", hint: "Distribute horizontally" },
  { kind: "distributeV", icon: "ui-rows", hint: "Distribute vertically" },
];

export function AlignPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function align(kind: AlignKind) {
    if (elementSelection.length < 2) return;
    // 1. Snapshot each selected frame's bounds.
    const entries: Array<{
      id: ElementId;
      bounds: [number, number, number, number];
    }> = [];
    for (const id of elementSelection) {
      const props = await client.elementProperties(id);
      const bounds = props?.entries.find(
        (e) => e.path === "frameBounds",
      )?.value;
      if (
        bounds &&
        bounds.type === "bounds" &&
        Array.isArray(bounds.value) &&
        bounds.value.length === 4
      ) {
        entries.push({
          id,
          bounds: bounds.value as [number, number, number, number],
        });
      }
    }
    if (entries.length < 2) return;

    // 2. Compute the selection AABB.
    let minTop = Number.POSITIVE_INFINITY;
    let minLeft = Number.POSITIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    for (const { bounds } of entries) {
      const [top, left, bottom, right] = bounds;
      if (top < minTop) minTop = top;
      if (left < minLeft) minLeft = left;
      if (bottom > maxBottom) maxBottom = bottom;
      if (right > maxRight) maxRight = right;
    }

    // 3. Compute per-frame target bounds; collect into one batch.
    const children: Array<{
      op: "setElementProperty";
      args: {
        elementId: ElementId;
        path: "frameBounds";
        value: { type: "bounds"; value: [number, number, number, number] };
      };
    }> = [];

    // Distribute paths have their own routine (sort + interleave).
    // The alignment kinds compute per-frame independently.
    if (kind === "distributeH" || kind === "distributeV") {
      // Need ≥3 frames to distribute meaningfully (2 frames already
      // sit at the extremes).
      if (entries.length < 3) return;
      // Sort by center on the relevant axis.
      const axis = kind === "distributeH" ? "h" : "v";
      const center = (b: [number, number, number, number]) =>
        axis === "h" ? (b[1] + b[3]) / 2 : (b[0] + b[2]) / 2;
      const sorted = entries
        .slice()
        .sort((a, b) => center(a.bounds) - center(b.bounds));
      const firstC = center(sorted[0].bounds);
      const lastC = center(sorted[sorted.length - 1].bounds);
      const step = (lastC - firstC) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        const { id, bounds } = sorted[i];
        const [top, left, bottom, right] = bounds;
        const w = right - left;
        const h = bottom - top;
        const targetCenter = firstC + step * i;
        let nTop = top;
        let nLeft = left;
        if (axis === "h") {
          nLeft = targetCenter - w / 2;
        } else {
          nTop = targetCenter - h / 2;
        }
        if (Math.abs(nTop - top) < 1e-3 && Math.abs(nLeft - left) < 1e-3) {
          continue;
        }
        children.push({
          op: "setElementProperty",
          args: {
            elementId: id,
            path: "frameBounds",
            value: {
              type: "bounds",
              value: [nTop, nLeft, nTop + h, nLeft + w],
            },
          },
        });
      }
    } else {
      for (const { id, bounds } of entries) {
        const [top, left, bottom, right] = bounds;
        const w = right - left;
        const h = bottom - top;
        let nTop = top;
        let nLeft = left;
        switch (kind) {
          case "left":
            nLeft = minLeft;
            break;
          case "right":
            nLeft = maxRight - w;
            break;
          case "centerH":
            nLeft = (minLeft + maxRight - w) / 2;
            break;
          case "top":
            nTop = minTop;
            break;
          case "bottom":
            nTop = maxBottom - h;
            break;
          case "centerV":
            nTop = (minTop + maxBottom - h) / 2;
            break;
        }
        const nBottom = nTop + h;
        const nRight = nLeft + w;
        if (Math.abs(nTop - top) < 1e-3 && Math.abs(nLeft - left) < 1e-3) {
          continue;
        }
        children.push({
          op: "setElementProperty",
          args: {
            elementId: id,
            path: "frameBounds",
            value: {
              type: "bounds",
              value: [nTop, nLeft, nBottom, nRight],
            },
          },
        });
      }
    }
    if (children.length === 0) return;
    // 4. Dispatch as a single Mutation::Batch — one undo entry
    //    coalesces the whole multi-target rewrite.
    await client.mutate({
      op: "batch",
      args: { ops: children },
    });
  }

  const distributeEnabled = elementSelection.length >= 3;

  const iconBtn = (
    btn: { kind: AlignKind; icon: string; hint: string },
    on: boolean,
  ) => (
    <button
      type="button"
      key={btn.kind}
      data-align-kind={btn.kind}
      disabled={!on}
      title={btn.hint}
      className="flex h-[30px] w-[32px] items-center justify-center rounded-[6px] border border-input bg-background hover:bg-muted/60 disabled:opacity-50"
      style={{ color: "var(--chrome-icon)" }}
      onClick={() => {
        void align(btn.kind);
      }}
    >
      <Icon name={btn.icon} size={15} />
    </button>
  );

  return (
    <div className="p-3 flex flex-col gap-2" data-align-panel="ready">
      {/* Align-to scope — Selection is the live behaviour; Page /
          Margins / Spread wait on page-membership reads (gap 7). */}
      <div className="mb-px">
        <div
          className="text-[11.5px] mb-[5px]"
          style={{ color: "var(--pg-muted-fg)" }}
        >
          Align to
        </div>
        <KitSelect value="selection" onChange={() => {}} data-align-scope>
          <option value="selection">Selection</option>
          <option value="page" disabled>
            Page — awaiting engine support
          </option>
          <option value="margins" disabled>
            Margins — awaiting engine support
          </option>
          <option value="spread" disabled>
            Spread — awaiting engine support
          </option>
        </KitSelect>
      </div>
      <div className="pg-label pt-1">Align objects</div>
      <div className="flex gap-2" role="group" aria-label="Align">
        <div className="flex gap-1">
          {ALIGN_H.map((b) => iconBtn(b, enabled))}
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: "var(--pg-border)" }}
        />
        <div className="flex gap-1">
          {ALIGN_V.map((b) => iconBtn(b, enabled))}
        </div>
      </div>
      <div className="pg-label pt-2">Distribute</div>
      <div className="flex gap-1" role="group" aria-label="Distribute">
        {DISTRIBUTE_BUTTONS.map((b) => iconBtn(b, distributeEnabled))}
      </div>
      {/* Equal-spacing distribute — honest seam until the panel
          grows the spacing input's commit path. */}
      <div className="-mx-3 mt-1 flex items-center gap-2 border-t border-input px-3 pt-[10px]">
        <span data-seam className="contents">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            disabled
            data-use-spacing
            className="relative w-[30px] h-[17px] shrink-0 rounded-full border-0 opacity-55"
            style={{ background: "var(--chrome-divider)" }}
          >
            <span className="absolute top-[2px] left-[2px] w-[13px] h-[13px] rounded-full bg-white shadow" />
          </button>
          <span className="flex-1 text-xs" style={{ color: "var(--pg-fg)" }}>
            Use spacing
          </span>
          <span
            className="pg-value text-xs"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            — mm
          </span>
        </span>
      </div>
      {enabled ? null : (
        <div className="text-xs text-muted-foreground" data-align-hint>
          Select 2 or more frames to align.
        </div>
      )}
      {!distributeEnabled && enabled ? (
        <div className="text-xs text-muted-foreground" data-distribute-hint>
          Select 3 or more frames to distribute.
        </div>
      ) : null}
    </div>
  );
}
