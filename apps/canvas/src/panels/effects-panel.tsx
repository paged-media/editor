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
//
// ADR 323 — every control is an object-model field: the per-field
// compositions are migrated `PropertyField`s (effects.composition.ts);
// the bespoke opacity metric, blend select and enable pills keep their
// widgets but read/write through `host.objects` (`useObjectBindings`) and
// sit in an `ObjectFieldFrame` ("Bind to data…" + badges).
//
// Transparency targets (engine 0.71.8, core ADR 135) — InDesign gives a
// page item four targets, each with its own opacity and blend mode: the
// Object, its Stroke, its Fill and its content (Text in a text frame,
// Graphic in a graphic frame). The target list below the Opacity / Blend
// row picks which one those two controls edit, and shows each target's
// current setting. A group has only the Object target, plus the two
// group options at the foot of the panel: Isolate blending and Knockout
// group. The effect families stay on the object target (the engine has
// no per-target effect paths).

import { useState } from "react";

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  Icon,
  ObjectFieldFrame,
  TogglePill,
  useObjectBindings,
  useSelection,
  type ObjectField,
} from "@paged-media/shell";
import { KitSelect, NumberInput } from "@paged-media/ui";
import type { CompositionNode } from "@paged-media/catalog";
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
function elementProp(path: PropertyPath): { path: string; scope: "element" } {
  return { path, scope: "element" };
}

// One row per effect family. `enable` is the stable bindings map the
// pill's `useBindings` reads (a module-level object so the hook never
// re-fetches on identity churn); `fields` is the per-field composition
// rendered inside the violet rail when the effect is on. Drop shadow's
// enable rides the legacy `frameDropShadow` bool (not `*Enabled`).
const EFFECT_FAMILIES: {
  name: string;
  enable: { enabled: { path: string; scope: "element" } };
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

type TargetId = "object" | "stroke" | "fill" | "content";

/** InDesign's transparency targets, in its panel order. */
const TARGETS: readonly { id: TargetId; label: string }[] = [
  { id: "object", label: "Object" },
  { id: "stroke", label: "Stroke" },
  { id: "fill", label: "Fill" },
  { id: "content", label: "Text" },
];

// One opacity + blend pair per target (a module-level map: one hook per
// key, in key order).
const TARGET_BINDINGS = {
  objectOpacity: elementProp("frameOpacity"),
  objectBlend: elementProp("frameBlendMode"),
  strokeOpacity: elementProp("frameStrokeOpacity"),
  strokeBlend: elementProp("frameStrokeBlendMode"),
  fillOpacity: elementProp("frameFillOpacity"),
  fillBlend: elementProp("frameFillBlendMode"),
  contentOpacity: elementProp("frameContentOpacity"),
  contentBlend: elementProp("frameContentBlendMode"),
};

// A group's own transparency options (InDesign: the two checkboxes at
// the foot of the Effects panel). Only a group carries them.
const GROUP_BINDINGS = {
  isolate: elementProp("groupIsolateBlending"),
  knockout: elementProp("groupKnockout"),
};
const GROUP_OPTIONS: readonly { key: keyof typeof GROUP_BINDINGS; label: string }[] = [
  { key: "isolate", label: "Isolate blending" },
  { key: "knockout", label: "Knockout group" },
];

function unwrapBool(v: Value | null): boolean | null {
  if (!v) return null;
  if (v.type !== "bool") return null;
  return v.value as boolean;
}

function unwrapLength(v: Value | null): number | null {
  if (!v || v.type !== "length") return null;
  return v.value ?? null;
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
  enable: { enabled: { path: string; scope: "element" } };
  fields: CompositionNode;
}) {
  const resolved = useObjectBindings(enable);
  const checked = unwrapBool(resolved.enabled.value);
  const on = checked === true;
  return (
    <div data-effect-row={name}>
      <ObjectFieldFrame field={resolved.enabled} className="relative flex items-center gap-[9px] py-[5px]">
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
      </ObjectFieldFrame>
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

/** A target's current setting as InDesign lists it ("Multiply 60%"):
 *  an unset blend reads Normal, an unset opacity 100 %; mixed reads —. */
function targetSummary(blend: ObjectField, opacity: ObjectField): string {
  if (blend.state.state !== "value" || opacity.state.state !== "value") return "—";
  const mode = BLEND_MODES.find((m) => m.value === unwrapText(blend.value))?.label ?? "Normal";
  const pct = unwrapLength(opacity.value);
  return `${mode} ${Math.round(pct ?? 100)}%`;
}

/** Isolate blending / Knockout group: a check row, live on a group. */
function GroupOption({ field, label }: { field: ObjectField; label: string }) {
  const on = unwrapBool(field.value);
  const live = field.state.state === "value" && field.onCommit != null;
  return (
    <ObjectFieldFrame field={field} className="relative flex items-center gap-[9px] py-[4px]">
      <TogglePill
        checked={on === true}
        mixed={on === null}
        disabled={!live}
        onToggle={(next) => field.onCommit?.({ type: "bool", value: next } as Value)}
        testId={label}
      />
      <span
        className="flex-1 text-xs"
        style={{ color: live ? "var(--pg-fg)" : "var(--pg-muted-fg)" }}
      >
        {label}
      </span>
    </ObjectFieldFrame>
  );
}

export function EffectsPanel() {
  const fields = useObjectBindings(TARGET_BINDINGS);
  const group = useObjectBindings(GROUP_BINDINGS);
  const { elementSelection } = useSelection();
  const [picked, setPicked] = useState<TargetId>("object");

  // A target the selection does not carry (a group has no stroke, fill
  // or content target) is not listed; the Object target always is.
  const opacityOf = (id: TargetId) => fields[`${id}Opacity` as const];
  const blendOf = (id: TargetId) => fields[`${id}Blend` as const];
  const carried = (id: TargetId) => id === "object" || opacityOf(id).state.state !== "absent";
  const target: TargetId = carried(picked) ? picked : "object";
  const opacityField = opacityOf(target);
  const blendField = blendOf(target);
  // InDesign names the content target by what the frame holds.
  const contentLabel =
    elementSelection.length > 0 && elementSelection.every((id) => id.kind !== "textFrame")
      ? "Graphic"
      : "Text";

  const opacity = unwrapLength(opacityField.value);
  const blendId = unwrapText(blendField.value) || "Normal";
  const blendDisabled = blendField.onCommit == null;
  const blendMixed = blendField.value == null;

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-effects-panel="ready" data-effects-target-active={target}>
        <ObjectFieldFrame field={opacityField} className="relative grid grid-cols-[84px_1fr] items-center gap-2">
          <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
            Opacity
          </span>
          <NumberInput
            icon="ui-size"
            suffix="%"
            // Unset reads as the schema default, 100 %.
            value={opacityField.state.state === "value" ? (opacity ?? 100) : null}
            min={0}
            max={100}
            precision={0}
            disabled={opacityField.onCommit == null}
            onChange={() => {}}
            onCommit={(next) => {
              opacityField.onCommit?.({
                type: "length",
                value: next,
              } as Value);
            }}
            aria-label="opacity"
          />
        </ObjectFieldFrame>
        <ObjectFieldFrame field={blendField} className="relative grid grid-cols-[84px_1fr] items-center gap-2">
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
              blendField.onCommit?.({
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
        </ObjectFieldFrame>
        <div className="flex flex-col" role="radiogroup" aria-label="Transparency target" data-effects-targets="">
          {TARGETS.filter((t) => carried(t.id)).map((t) => {
            const active = t.id === target;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-effects-target={t.id}
                onClick={() => setPicked(t.id)}
                className="flex items-center justify-between rounded-[5px] px-2 py-[3px] text-left text-xs"
                style={{
                  background: active ? "var(--pg-primary-soft)" : "transparent",
                  color: active ? "var(--pg-fg)" : "var(--pg-muted-fg)",
                }}
              >
                <span>{t.id === "content" ? contentLabel : t.label}</span>
                <span className="pg-mono-meta" data-effects-target-summary={t.id}>
                  {targetSummary(blendOf(t.id), opacityOf(t.id))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="-mx-3 border-t border-input px-3 pt-2">
          <div className="pg-label mb-1">
            Effects
            {target !== "object" && (
              <span className="ml-1 normal-case" style={{ color: "var(--pg-muted-fg)" }}>
                · on the object
              </span>
            )}
          </div>
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
        <div className="-mx-3 border-t border-input px-3 pt-2" data-effects-group-options="">
          {GROUP_OPTIONS.map((o) => (
            <GroupOption key={o.key} field={group[o.key]} label={o.label} />
          ))}
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
