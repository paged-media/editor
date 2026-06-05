// SDK Phase 5 / panel-gallery pass — Attributes panel.
//
// Gallery check-row shape. LIVE: the Nonprinting pill (excludes
// the frame from print/export passes; canvas still renders it) —
// the `selectionProperty:frameNonprinting` binding. HONEST SEAMS:
// Visible / Locked (per-frame flags are layer-level today),
// the OVERPRINT pair and the gap colour well — no engine paths
// yet (stroke-detail + attributes roadmap).

import { useBindings } from "@paged-media/shell";
import type { Value } from "@paged-media/client";

const NONPRINTING_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameNonprinting" as const,
  },
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function CheckRow({
  label,
  checked,
  seam,
  testId,
  onToggle,
}: {
  label: string;
  checked: boolean;
  seam?: boolean;
  testId?: string;
  onToggle?: (next: boolean) => void;
}) {
  const inert = seam || onToggle == null;
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={inert}
        data-check-row={testId ?? label}
        data-on={checked ? "true" : "false"}
        data-seam={inert ? "true" : undefined}
        className="relative w-[30px] h-[17px] rounded-full border-0 shrink-0 disabled:cursor-default cursor-pointer"
        style={{
          background: checked ? "var(--pg-primary)" : "var(--chrome-divider)",
          opacity: inert ? 0.55 : 1,
        }}
        onClick={() => onToggle?.(!checked)}
      >
        <span
          className="absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow transition-[left]"
          style={{ left: checked ? 15 : 2 }}
        />
      </button>
    </div>
  );
}

export function AttributesPanel() {
  const resolved = useBindings(NONPRINTING_BINDING);
  const np = resolved.value;
  const checked = unwrapBool(np.value);
  const indeterminate = checked === null;

  return (
    <div className="p-3 flex flex-col gap-2" data-attributes-panel="ready">
      {/* Per-frame visible/locked flags are layer-level today. */}
      <CheckRow label="Visible" checked seam testId="visible" />
      <CheckRow label="Locked" checked={false} seam testId="locked" />
      {indeterminate ? (
        <div className="grid grid-cols-[92px_1fr] items-center gap-2">
          <span className="text-xs text-muted-foreground">Nonprinting</span>
          <span className="text-xs text-muted-foreground" data-mixed>
            —
          </span>
        </div>
      ) : (
        <CheckRow
          label="Nonprinting"
          checked={checked ?? false}
          testId="nonprinting"
          onToggle={(next) => {
            np.onCommit?.({ type: "bool", value: next } as Value);
          }}
        />
      )}
      <div className="pg-label pt-2 border-t border-input">Overprint</div>
      <CheckRow
        label="Overprint fill"
        checked={false}
        seam
        testId="overprint-fill"
      />
      <CheckRow
        label="Overprint stroke"
        checked={false}
        seam
        testId="overprint-stroke"
      />
      <div className="grid grid-cols-[92px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Gap color</span>
        <span
          data-seam
          title="Gap colour — awaiting engine support"
          className="inline-flex items-center gap-2 opacity-55"
        >
          <span className="w-[20px] h-[20px] rounded-[5px] border border-input bg-transparent" />
          <span className="text-xs text-muted-foreground">[None]</span>
        </span>
      </div>
    </div>
  );
}
