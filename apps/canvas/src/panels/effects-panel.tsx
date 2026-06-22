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

// SDK Phase 5 / gallery pixel-parity — Effects panel, composed to
// the deep1 card (gallery-deep1.jsx `Effects`):
//
//   Opacity   (label-left metric "%")          LIVE
//   Blend     (object blend-mode select)       LIVE — W2.2
//   ── EFFECTS kicker (full-bleed border) ──
//   [pill] Drop shadow ⌄                       LIVE — expansion
//   [pill] Inner shadow / Outer glow / Inner   LIVE — W2.2
//          glow / Bevel / Satin / Feather /
//          Directional feather  ⌄              (per-effect disclosures)
//     │ (2px violet rail, indented per-field composition)
//
// Pills sit LEFT of the effect name (the kit's row order); names
// read muted when off.
//
// W2.2 (2026-06-06) — protocol v28 lands every per-effect field path
// (engine gap 18). Each family flips from a disabled seam pill to a
// live disclosure: the pill writes its enable bool, the expanded
// composition writes the per-field `frame{Family}{Field}` paths. The
// object-level Blend select flips live on `frameBlendMode`.
//
// Enable wires: drop shadow keeps the legacy `frameDropShadow` bool;
// the other families enable via `frame{Family}Enabled`. The apply arm
// materialises a default effect struct on enable so the disclosure's
// per-field editors always have a target. Each family's read-side
// reports the same bool, so the pill reflects on/off + mixed.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  TogglePill,
  useBindings,
} from "@paged-media/shell";
import { KitSelect, NumberInput } from "@paged-media/ui";
import type { Binding, CompositionNode } from "@paged-media/catalog";
import type { PropertyPath, Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import {
  BLEND_MODES,
  bevelComposition,
  directionalFeatherComposition,
  dropShadowComposition,
  featherComposition,
  innerGlowComposition,
  innerShadowComposition,
  outerGlowComposition,
  satinComposition,
} from "./effects.composition";

// Typed against `PropertyPath` so a mistyped path is a tsc error.
function elementProp(path: PropertyPath): Binding {
  return {
    kind: "selectionProperty",
    scope: "element",
    path,
  };
}

// One row per effect family. `enable` is the stable bindings map the
// pill's `useBindings` reads (a module-level object so the hook never
// re-fetches on identity churn); `fields` is the per-field composition
// rendered inside the violet rail when the effect is on. Drop shadow's
// enable rides the legacy `frameDropShadow` bool (not `*Enabled`).
const EFFECT_FAMILIES: {
  name: string;
  enable: { enabled: Binding };
  fields: CompositionNode;
}[] = [
  { name: "Drop shadow", enable: { enabled: elementProp("frameDropShadow") }, fields: dropShadowComposition },
  { name: "Inner shadow", enable: { enabled: elementProp("frameInnerShadowEnabled") }, fields: innerShadowComposition },
  { name: "Outer glow", enable: { enabled: elementProp("frameOuterGlowEnabled") }, fields: outerGlowComposition },
  { name: "Inner glow", enable: { enabled: elementProp("frameInnerGlowEnabled") }, fields: innerGlowComposition },
  { name: "Bevel and emboss", enable: { enabled: elementProp("frameBevelEnabled") }, fields: bevelComposition },
  { name: "Satin", enable: { enabled: elementProp("frameSatinEnabled") }, fields: satinComposition },
  { name: "Feather", enable: { enabled: elementProp("frameFeatherEnabled") }, fields: featherComposition },
  {
    name: "Directional feather",
    enable: { enabled: elementProp("frameDirectionalFeatherEnabled") },
    fields: directionalFeatherComposition,
  },
];

const TOP_BINDINGS = {
  opacity: elementProp("frameOpacity"),
  blend: elementProp("frameBlendMode"),
};

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function unwrapLength(v: Value | null): number | null {
  if (!v || v.type !== "length") return null;
  return v.value ?? 0;
}

function unwrapText(v: Value | null): string {
  if (!v || v.type !== "text") return "";
  return v.value;
}

/** A single live effect disclosure: enable pill + name + chevron,
 *  with the per-field composition rendered inside the violet rail
 *  when on. Mirrors the original drop-shadow template, generalised. */
function EffectDisclosure({
  name,
  enable,
  fields,
}: {
  name: string;
  enable: { enabled: Binding };
  fields: CompositionNode;
}) {
  const resolved = useBindings(enable);
  const checked = unwrapBool(resolved.enabled.value);
  const on = checked === true;
  return (
    <div data-effect-row={name}>
      <div className="flex items-center gap-[9px] py-[5px]">
        <TogglePill
          checked={on}
          mixed={checked === null}
          disabled={resolved.enabled.onCommit == null}
          onToggle={(next) => {
            resolved.enabled.onCommit?.({ type: "bool", value: next } as Value);
          }}
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
      {on && (
        <div
          className="mb-[6px] ml-1 py-2 pl-3"
          data-effect-fields={name}
          style={{ borderLeft: "2px solid var(--pg-primary-soft)" }}
        >
          <CompositionRenderer composition={fields} />
        </div>
      )}
    </div>
  );
}

export function EffectsPanel() {
  const top = useBindings(TOP_BINDINGS);
  const opacity = unwrapLength(top.opacity.value);
  const blendId = unwrapText(top.blend.value);
  const blendDisabled = top.blend.onCommit == null;
  const blendMixed = top.blend.value == null;

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
            disabled={top.opacity.onCommit == null}
            onChange={() => {}}
            onCommit={(next) => {
              top.opacity.onCommit?.({
                type: "length",
                value: next,
              } as Value);
            }}
            aria-label="opacity"
          />
        </div>
        {/* Object-level blend mode — LIVE (W2.2) on frameBlendMode. */}
        <div className="grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
            Blend
          </span>
          <KitSelect
            value={blendMixed ? "__mixed__" : blendId}
            soft={blendMixed}
            disabled={blendDisabled}
            data-blend-mode
            data-mixed={blendMixed ? "" : undefined}
            onChange={(e) => {
              if (e.target.value === "__mixed__") return;
              top.blend.onCommit?.({
                type: "text",
                value: e.target.value,
              } as Value);
            }}
          >
            {blendMixed && (
              <option value="__mixed__" disabled>
                —
              </option>
            )}
            {BLEND_MODES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </KitSelect>
        </div>
        <div className="-mx-3 border-t border-input px-3 pt-2">
          <div className="pg-label mb-1">Effects</div>
          <div className="flex flex-col">
            {EFFECT_FAMILIES.map((fam) => (
              <EffectDisclosure
                key={fam.name}
                name={fam.name}
                enable={fam.enable}
                fields={fam.fields}
              />
            ))}
          </div>
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
