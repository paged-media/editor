// SDK Phase 5 / gallery pixel-parity — Effects panel, composed to
// the deep1 card (gallery-deep1.jsx `Effects`):
//
//   Opacity   (label-left metric "%")          LIVE
//   Blend     (label-left select)              seam
//   ── EFFECTS kicker (full-bleed border) ──
//   [pill] Drop Shadow  ⌄                      LIVE — expansion
//     │ (2px violet rail, indented fields from effects.composition)
//   [pill] Inner Shadow / Outer Glow / Inner Glow / Feather /
//          Bevel & Emboss                      seams (pills off)
//
// Pills sit LEFT of the effect name (the kit's row order); names
// read muted when off.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  TogglePill,
  useBindings,
} from "@paged-media/shell";
import { KitSelect, NumberInput } from "@paged-media/ui";
import type { Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { effectsComposition } from "./effects.composition";

const BINDINGS = {
  dropShadow: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameDropShadow" as const,
  },
  opacity: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameOpacity" as const,
  },
};

const SEAM_EFFECTS = [
  "Inner shadow",
  "Outer glow",
  "Inner glow",
  "Feather",
  "Bevel and emboss",
];

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function unwrapLength(v: Value | null): number | null {
  if (!v || v.type !== "length") return null;
  return v.value ?? 0;
}

function EffectRow({
  name,
  on,
  mixed,
  disabled,
  onToggle,
  children,
}: {
  name: string;
  on: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onToggle?: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div data-effect-row={name}>
      <div className="flex items-center gap-[9px] py-[5px]">
        <TogglePill
          checked={on}
          mixed={mixed}
          disabled={disabled}
          onToggle={onToggle}
          testId={name}
        />
        <span
          className="flex-1 text-xs"
          style={{ color: on ? "var(--pg-fg)" : "var(--pg-muted-fg)" }}
        >
          {name}
        </span>
        {on && (
          <Icon
            name="ui-chevron-down"
            size={13}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        )}
      </div>
      {children}
    </div>
  );
}

export function EffectsPanel() {
  const resolved = useBindings(BINDINGS);
  const checked = unwrapBool(resolved.dropShadow.value);
  const opacity = unwrapLength(resolved.opacity.value);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-effects-panel="ready">
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
        {/* Engine gap — no blend-mode path yet. */}
        <div className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
            Blend
          </span>
          <KitSelect value="" soft disabled data-seam>
            <option value="">Normal</option>
          </KitSelect>
        </div>
        <div className="-mx-3 border-t border-input px-3 pt-2">
          <div className="pg-label mb-1">Effects</div>
          <div className="flex flex-col">
            <EffectRow
              name="Drop shadow"
              on={checked === true}
              mixed={checked === null}
              disabled={resolved.dropShadow.onCommit == null}
              onToggle={(next) => {
                resolved.dropShadow.onCommit?.({
                  type: "bool",
                  value: next,
                } as Value);
              }}
            >
              {checked === true && (
                <div
                  className="mb-[6px] ml-1 py-2 pl-3"
                  data-drop-shadow-fields
                  style={{ borderLeft: "2px solid var(--pg-primary-soft)" }}
                >
                  <CompositionRenderer composition={effectsComposition} />
                </div>
              )}
            </EffectRow>
            {/* Engine gaps — effect models beyond drop shadow are
                unwired; the rows ship as neutral disabled pills. */}
            {SEAM_EFFECTS.map((name) => (
              <div key={name} data-seam-effect={name}>
                <div
                  className="flex items-center gap-[9px] py-[5px]"
                  data-effect-row={name}
                  data-seam
                >
                  <TogglePill checked={false} disabled testId={name} />
                  <span
                    className="flex-1 text-xs"
                    style={{ color: "var(--pg-muted-fg)" }}
                  >
                    {name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
