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
// Multi-target Bezier boolean ops, gallery buttons-grid shape.
// LIVE: Union / Intersect / Subtract / Exclude — curve-preserving
// CSG in the Rust apply layer (flo_curves against the actual
// handles); the TS panel packs the selection into one
// `Mutation::PathfinderBoolean` and a single Cmd-Z reverses the
// whole op via the inner Batch. HONEST SEAMS: Minus Back / Divide
// plus the CONVERT SHAPE row + corner option (no Operations yet).

import { useCanvasClient, useSelection, Icon } from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";
import type { ElementId, PathfinderKind } from "@paged-media/client";

interface ButtonDef {
  kind: PathfinderKind;
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

const SEAM_BUTTONS = [
  {
    icon: "tool-rectangle",
    label: "Minus back",
    hint: "Minus Back — awaiting engine support",
  },
  {
    icon: "panel-cell-styles",
    label: "Divide",
    hint: "Divide — awaiting engine support",
  },
];

const SHAPES = [
  { icon: "tool-rectangle", hint: "Convert to rectangle" },
  { icon: "tool-ellipse", hint: "Convert to ellipse" },
  { icon: "tool-polygon", hint: "Convert to polygon" },
  { icon: "tool-line", hint: "Convert to line" },
];

export function PathfinderPanel() {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const enabled = elementSelection.length >= 2;

  async function run(kind: PathfinderKind) {
    if (!enabled) return;
    const [kept, ...others] = elementSelection as ElementId[];
    if (others.length === 0) return;
    await client.mutate({
      op: "pathfinderBoolean",
      args: { kept, others, kind },
    });
  }

  return (
    <div className="p-3 flex flex-col gap-2" data-pathfinder-panel="ready">
      <div className="pg-label">Pathfinder</div>
      <div
        className="grid grid-cols-3 gap-[6px]"
        role="group"
        aria-label="Pathfinder"
      >
        {BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.kind}
            data-pathfinder-kind={btn.kind}
            disabled={!enabled}
            title={btn.hint}
            className="flex flex-col items-center gap-[5px] rounded-[7px] border border-input bg-background px-1 py-[9px] hover:bg-muted/60 disabled:opacity-50"
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
        {SEAM_BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.label}
            disabled
            data-seam
            title={btn.hint}
            className="flex flex-col items-center gap-[5px] rounded-[7px] border border-input bg-background px-1 py-[9px] opacity-55"
          >
            <Icon
              name={btn.icon}
              size={17}
              style={{ color: "var(--pg-muted-fg)" }}
            />
            <span
              className="text-[9.5px]"
              style={{ color: "var(--pg-muted-fg)" }}
            >
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
