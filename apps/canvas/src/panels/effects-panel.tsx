// SDK Phase 5 / panel-gallery pass — Effects panel, shaped to the
// gallery card: opacity + blend up top, then the EFFECTS stack as
// per-effect rows with on/off pills. Bespoke (not a composition):
// the per-row toggle + conditional expansion exceeds the §11.5
// renderer ceiling.
//
// LIVE: opacity (frameOpacity), the Drop Shadow row — its pill
// binds `frameDropShadow` (Value::Bool) and, when on, expands the
// per-field editors (effects.composition.ts: mode / offsets /
// blur / opacity / colour — the apply arms materialise a default
// DropShadowSetting on the first per-field write). HONEST SEAMS:
// blend mode select + the Inner Shadow / Glows / Feather / Bevel
// rows — visible, disabled pills until their effect models land
// (effects-architecture roadmap: target selector, feather types,
// global light).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useBindings,
} from "@paged-media/shell";
import { NumberInput } from "@paged-media/ui";
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

function MixedDash() {
  return (
    <span className="text-xs text-muted-foreground" data-mixed>
      —
    </span>
  );
}

/** The kit's on/off pill (30×17, knob 13). `checked === null` is
 *  the caller's responsibility (render MixedDash instead). */
function TogglePill({
  checked,
  disabled,
  onToggle,
  testId,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle?: (next: boolean) => void;
  testId?: string;
}) {
  const inert = disabled || onToggle == null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={inert}
      data-effect-toggle={testId}
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
  );
}

function EffectRow({
  name,
  control,
  children,
}: {
  name: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="border-b border-input last:border-b-0"
      data-effect-row={name}
    >
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs">{name}</span>
        {control}
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
      <div className="p-3 flex flex-col gap-2" data-effects-panel="ready">
        <div className="grid grid-cols-[92px_1fr] items-center gap-2">
          <span className="text-xs text-muted-foreground">Opacity</span>
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
        </div>
        {/* Engine gap — no blend-mode path yet. */}
        <div className="grid grid-cols-[92px_1fr] items-center gap-2">
          <span className="text-xs text-muted-foreground">Blend</span>
          <select
            className="w-full text-xs h-[30px] px-2 rounded-[6px] border border-input bg-background text-muted-foreground"
            value=""
            disabled
            data-seam
          >
            <option value="">Normal</option>
          </select>
        </div>
        <div className="border-t border-input pt-2">
          <div className="pg-label px-1">Effects</div>
          <div className="flex flex-col pt-1">
            <EffectRow
              name="Drop shadow"
              control={
                checked === null ? (
                  <MixedDash />
                ) : (
                  <TogglePill
                    checked={checked}
                    testId="drop-shadow"
                    onToggle={(next) => {
                      resolved.dropShadow.onCommit?.({
                        type: "bool",
                        value: next,
                      } as Value);
                    }}
                  />
                )
              }
            >
              {checked === true && (
                <div className="pb-2 pl-2" data-drop-shadow-fields>
                  <CompositionRenderer composition={effectsComposition} />
                </div>
              )}
            </EffectRow>
            {/* Engine gaps — effect models beyond drop shadow are
                unwired; the rows ship as visible disabled pills. */}
            {SEAM_EFFECTS.map((name) => (
              <EffectRow
                key={name}
                name={name}
                control={<TogglePill checked={false} disabled testId={name} />}
              />
            ))}
          </div>
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
