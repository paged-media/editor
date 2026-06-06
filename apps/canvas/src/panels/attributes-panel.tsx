// SDK Phase 5 / gallery pixel-parity — Attributes panel, composed
// to the deep1 card (gallery-deep1.jsx `Attributes`):
//
//   Visible / Locked       check rows            seams (layer-level)
//   Nonprinting            check row             LIVE
//   ── OVERPRINT kicker ──
//   Overprint fill/stroke  check rows            LIVE  (W2.3)
//   Gap color               label-left swatch    seam
//
// The LIVE pills bind `selectionProperty:frame{Nonprinting,
// OverprintFill,OverprintStroke}`. W2.3 (2026-06-06) — protocol v28
// lands the overprint Bool pair. Kind coverage: OverprintStroke is on
// every stroked kind; OverprintFill is on every FILLED kind
// (TextFrame / Rectangle / Oval / Polygon — NOT GraphicLine). On a
// kind without the PropertyEntry the binding reads null → the pill
// shows the mixed (em-dash) sentinel, disabled.

import { Icon, TogglePill, useBindings } from "@paged-media/shell";
import type { Value } from "@paged-media/client";

const BINDINGS = {
  nonprinting: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameNonprinting" as const,
  },
  overprintFill: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameOverprintFill" as const,
  },
  overprintStroke: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameOverprintStroke" as const,
  },
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function CheckRow({
  label,
  on,
  mixed,
  seam,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  mixed?: boolean;
  seam?: boolean;
  disabled?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  return (
    <label
      className="flex items-center justify-between py-[6px]"
      data-check-row={label}
      data-seam={seam ? "true" : undefined}
    >
      <span className="text-xs" style={{ color: "var(--pg-fg)" }}>
        {label}
      </span>
      <TogglePill
        checked={on}
        mixed={mixed}
        disabled={seam || disabled}
        onToggle={onToggle}
      />
    </label>
  );
}

export function AttributesPanel() {
  const resolved = useBindings(BINDINGS);
  const np = resolved.nonprinting;
  const checked = unwrapBool(np.value);
  const opFill = resolved.overprintFill;
  const opFillChecked = unwrapBool(opFill.value);
  const opStroke = resolved.overprintStroke;
  const opStrokeChecked = unwrapBool(opStroke.value);

  return (
    <div className="p-3 flex flex-col" data-attributes-panel="ready">
      {/* Per-frame visible/locked flags are layer-level today. */}
      <CheckRow label="Visible" on={false} seam />
      <CheckRow label="Locked" on={false} seam />
      <CheckRow
        label="Nonprinting"
        on={checked === true}
        mixed={checked === null}
        disabled={np.onCommit == null}
        onToggle={(next) => {
          np.onCommit?.({ type: "bool", value: next } as Value);
        }}
      />
      <div className="-mx-3 mt-2 border-t border-input px-3 pt-2">
        <div className="pg-label mb-1">Overprint</div>
        <CheckRow
          label="Overprint fill"
          on={opFillChecked === true}
          mixed={opFillChecked === null}
          disabled={opFill.onCommit == null}
          onToggle={(next) => {
            opFill.onCommit?.({ type: "bool", value: next } as Value);
          }}
        />
        <CheckRow
          label="Overprint stroke"
          on={opStrokeChecked === true}
          mixed={opStrokeChecked === null}
          disabled={opStroke.onCommit == null}
          onToggle={(next) => {
            opStroke.onCommit?.({ type: "bool", value: next } as Value);
          }}
        />
      </div>
      <div className="mt-1 grid grid-cols-[84px_1fr] items-center gap-2">
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
          Gap color
        </span>
        <span
          data-seam
          title="Gap colour — awaiting engine support"
          className="flex h-[28px] w-full items-center gap-2 rounded-[6px] border border-input bg-background px-2 opacity-55"
        >
          <span className="h-4 w-4 shrink-0 rounded border border-input bg-transparent" />
          <span
            className="flex-1 text-left text-xs"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            [None]
          </span>
          <Icon
            name="ui-chevron-down"
            size={12}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </span>
      </div>
    </div>
  );
}
