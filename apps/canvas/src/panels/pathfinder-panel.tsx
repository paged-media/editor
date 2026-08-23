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

// SDK Phase 5 / panel-gallery pass — Pathfinder panel.
//
// TWO LIVE ROWS since engine protocol v57 (B-22):
//
//  · SHAPE MODES — Union / Intersect / Subtract / Exclude. Curve-
//    preserving CSG in the Rust apply layer (flo_curves against the
//    actual handles); the panel packs the selection into one
//    `Mutation::PathfinderBoolean` and a single Cmd-Z reverses the whole
//    op via the inner Batch.
//  · PATHFINDERS — Divide / Trim / Merge / Crop / Outline / Minus back.
//    These resolve the planar ARRANGEMENT of the selection (the distinct
//    areas overlapping paths divide the plane into) and operate per
//    face. One mutation each, one undo step each.
//
// ORDERING (the thing Crop and Minus back turn on): the region verbs
// take `elementIds` TOP-TO-BOTTOM, index 0 frontmost. Selection order is
// CLICK order, not stacking order, so the panel reads the real z from
// the scene tree — whose leaves come back in paint order, back to front
// — and reverses it. A selection made bottom-up would otherwise invert
// Crop's cookie cutter and Minus back's survivor silently.
//
// REFUSALS ARE SHOWN. The engine caps the arrangement at 12 inputs and
// 256 faces and REFUSES past either — it never truncates. The panel puts
// the engine's own sentence in the status line rather than looking like
// nothing happened.
//
// HONEST SEAMS, still: the CONVERT SHAPE row + the corner option (no
// Operations behind them).

import { useState } from "react";

import { useCanvasClient, useSelection, Icon } from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";
import type {
  ElementId,
  Mutation,
  PathfinderKind,
  SceneTreeNode,
  WorkerToMain,
} from "@paged-media/client";

interface ButtonDef {
  kind: PathfinderKind;
  icon: string;
  label: string;
  hint: string;
}

/** The six region verbs' wire op names — the `Mutation` variants that
 *  take a bare `{ elementIds }` (protocol v57). */
type RegionVerb = Extract<
  Mutation,
  {
    op:
      | "pathfinderDivide"
      | "pathfinderTrim"
      | "pathfinderMerge"
      | "pathfinderCrop"
      | "pathfinderOutline"
      | "pathfinderMinusBack";
  }
>["op"];

interface RegionDef {
  verb: RegionVerb;
  icon: string;
  label: string;
  hint: string;
}

// Icon + 9.5px label tiles in the deep1 3×2 grid (glyph stand-ins
// from the existing registry).
const BUTTONS: ButtonDef[] = [
  {
    kind: "union",
    icon: "panel-pathfinder",
    label: "Union",
    hint: "Combine paths (Union)",
  },
  {
    kind: "intersect",
    icon: "tool-ellipse",
    label: "Intersect",
    hint: "Keep overlap (Intersect)",
  },
  {
    kind: "subtract",
    icon: "tool-erase",
    label: "Subtract",
    hint: "Top minus rest (Subtract)",
  },
  {
    kind: "exclude",
    icon: "tool-scissors",
    label: "Exclude",
    hint: "Symmetric difference (Exclude)",
  },
];

const REGION_BUTTONS: RegionDef[] = [
  {
    verb: "pathfinderDivide",
    icon: "ui-grid",
    label: "Divide",
    hint: "Every overlapping area becomes its own object (Divide)",
  },
  {
    verb: "pathfinderTrim",
    icon: "tool-scissors",
    label: "Trim",
    hint: "Clip each object to the part nothing above it covers (Trim)",
  },
  {
    verb: "pathfinderMerge",
    icon: "ui-component",
    label: "Merge",
    hint: "Trim, then combine objects that share a fill (Merge)",
  },
  {
    verb: "pathfinderCrop",
    icon: "tool-crop",
    label: "Crop",
    hint: "Keep only what falls inside the frontmost object (Crop)",
  },
  {
    verb: "pathfinderOutline",
    icon: "panel-outline",
    label: "Outline",
    hint: "Turn fills into stroked lines along every edge (Outline)",
  },
  {
    verb: "pathfinderMinusBack",
    icon: "tool-marquee-rect",
    label: "Minus back",
    hint: "The backmost object minus everything in front of it (Minus back)",
  },
];

const SHAPES = [
  { icon: "tool-rectangle", hint: "Convert to rectangle" },
  { icon: "tool-ellipse", hint: "Convert to ellipse" },
  { icon: "tool-polygon", hint: "Convert to polygon" },
  { icon: "tool-line", hint: "Convert to line" },
];

const TILE_CLASS =
  "flex flex-col items-center gap-[5px] rounded-[7px] border border-input " +
  "bg-background px-1 py-[9px] hover:bg-muted/60 disabled:opacity-50";

/** Key an element id the way the scene tree's leaves key. */
function keyOf(id: ElementId): string {
  return `${id.kind}:${String((id as { id: unknown }).id)}`;
}

/** Flatten the scene tree to its selectable leaves in PAINT order
 *  (back to front — the order `frames_in_order` records). */
function paintOrder(roots: SceneTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: SceneTreeNode[]) => {
    for (const node of nodes) {
      if (node.id) out.push(keyOf(node.id));
      if (node.children) walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/** Order the selection TOP-TO-BOTTOM (index 0 frontmost). Ids the tree
 *  does not carry keep their relative selection order at the back — a
 *  partial answer still runs rather than dropping operands. */
function topToBottom(selection: ElementId[], paint: string[]): ElementId[] {
  const rank = new Map<string, number>();
  paint.forEach((k, i) => rank.set(k, i));
  return selection
    .map((id, i) => ({ id, i, z: rank.get(keyOf(id)) ?? -1 }))
    .sort((a, b) => (a.z !== b.z ? b.z - a.z : a.i - b.i))
    .map((e) => e.id);
}

/** The engine's own sentence for a refused mutation, or null when it
 *  applied. An apply-layer refusal arrives as
 *  `mutationFailed { error: NotImplemented { what: "frame mutation
 *  failed: invalid value for FramePath on X: <reason>" } }` — the user
 *  gets the trailing clause, not the envelope. */
function refusalOf(reply: WorkerToMain): string | null {
  if (reply.kind !== "mutationFailed") return null;
  const error = reply.payload.error;
  const what =
    error.kind === "notImplemented"
      ? error.details.what
      : error.kind === "noDocument"
        ? "no document loaded"
        : `the engine refused the operation (${error.kind})`;
  const tail = /:\s*([^:]*(?:planar|face|path|value)[^:]*)$/.exec(what);
  return (tail ? tail[1] : what).trim();
}

export function PathfinderPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const [status, setStatus] = useState<string | null>(null);
  const enabled = elementSelection.length >= 2;

  async function run(kind: PathfinderKind) {
    if (!enabled) return;
    const [kept, ...others] = elementSelection as ElementId[];
    if (others.length === 0) return;
    setStatus(null);
    const reply = await client.mutate({
      op: "pathfinderBoolean",
      args: { kept, others, kind },
    });
    setStatus(refusalOf(reply));
  }

  /** One region verb over the selection, ordered by real z. */
  async function runRegion(verb: RegionVerb) {
    if (!enabled) return;
    setStatus(null);
    let ordered = [...elementSelection] as ElementId[];
    try {
      ordered = topToBottom(ordered, paintOrder(await client.sceneTree()));
    } catch {
      // An unreadable tree leaves click order in place rather than
      // aborting; Crop / Minus back may then pick the other operand.
    }
    const reply = await client.mutate({
      op: verb,
      args: { elementIds: ordered },
    } as Mutation);
    setStatus(refusalOf(reply));
  }

  return (
    <div className="p-3 flex flex-col gap-2" data-pathfinder-panel="ready">
      <div className="pg-label">Shape modes</div>
      <div
        className="grid grid-cols-4 gap-[6px]"
        role="group"
        aria-label="Shape modes"
      >
        {BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.kind}
            data-pathfinder-kind={btn.kind}
            disabled={!enabled}
            title={btn.hint}
            className={TILE_CLASS}
            onClick={() => {
              void run(btn.kind);
            }}
          >
            <Icon
              name={btn.icon}
              size={17}
              style={{ color: "var(--pg-muted-fg)" }}
            />
            <span className="text-[9.5px]" style={{ color: "var(--pg-fg)" }}>
              {btn.label}
            </span>
          </button>
        ))}
      </div>
      <div className="pg-label pt-1">Pathfinders</div>
      <div
        className="grid grid-cols-3 gap-[6px]"
        role="group"
        aria-label="Pathfinders"
      >
        {REGION_BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.verb}
            data-pathfinder-verb={btn.verb}
            disabled={!enabled}
            title={btn.hint}
            className={TILE_CLASS}
            onClick={() => {
              void runRegion(btn.verb);
            }}
          >
            <Icon
              name={btn.icon}
              size={17}
              style={{ color: "var(--pg-muted-fg)" }}
            />
            <span className="text-[9.5px]" style={{ color: "var(--pg-fg)" }}>
              {btn.label}
            </span>
          </button>
        ))}
      </div>
      {enabled ? null : (
        <div className="text-xs text-muted-foreground" data-pathfinder-hint>
          Select 2 or more frames to combine.
        </div>
      )}
      {status === null ? null : (
        <div
          className="text-xs"
          style={{ color: "var(--status-warn-fg, var(--pg-fg))" }}
          role="status"
          data-pathfinder-error
        >
          {status}
        </div>
      )}
      {/* Engine gap — no convert-shape / corner-option Operations. */}
      <div className="pg-label pt-2 border-t border-input">Convert shape</div>
      <div className="flex gap-[5px]" data-convert-shape-seam>
        {SHAPES.map((s) => (
          <button
            key={s.icon}
            type="button"
            disabled
            data-seam
            title={`${s.hint} — awaiting engine support`}
            className="w-[34px] h-[30px] rounded-[6px] border border-input bg-background text-muted-foreground opacity-55 flex items-center justify-center"
          >
            <Icon name={s.icon} size={16} />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[84px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Corner</span>
        <KitSelect value="" soft disabled data-seam>
          <option value="">Rounded · 4 pt</option>
        </KitSelect>
      </div>
    </div>
  );
}
