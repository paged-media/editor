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
import type { ElementId, PathfinderKind } from "@paged-media/client";

interface ButtonDef {
  kind: PathfinderKind;
  label: string;
  hint: string;
}

const BUTTONS: ButtonDef[] = [
  { kind: "union", label: "Union", hint: "Combine paths (Union)" },
  { kind: "intersect", label: "Intersect", hint: "Keep overlap (Intersect)" },
  { kind: "subtract", label: "Subtract", hint: "Top minus rest (Subtract)" },
  { kind: "exclude", label: "Exclude", hint: "Symmetric difference (Exclude)" },
];

const SEAM_BUTTONS = [
  { label: "Minus back", hint: "Minus Back — awaiting engine support" },
  { label: "Divide", hint: "Divide — awaiting engine support" },
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
        className="grid grid-cols-2 gap-[7px]"
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
            className="text-xs px-2 py-2 border border-input rounded-[8px] bg-background hover:bg-muted/60 disabled:opacity-50"
            onClick={() => {
              void run(btn.kind);
            }}
          >
            {btn.label}
          </button>
        ))}
        {SEAM_BUTTONS.map((btn) => (
          <button
            type="button"
            key={btn.label}
            disabled
            data-seam
            title={btn.hint}
            className="text-xs px-2 py-2 border border-input rounded-[8px] bg-background text-muted-foreground opacity-55"
          >
            {btn.label}
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
      <div className="grid grid-cols-[92px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Corner</span>
        <select
          className="w-full text-xs h-[30px] px-2 rounded-[6px] border border-input bg-background text-muted-foreground"
          value=""
          disabled
          data-seam
        >
          <option value="">Rounded · 4 pt</option>
        </select>
      </div>
    </div>
  );
}
