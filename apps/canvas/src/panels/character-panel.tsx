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

// SDK Phase 3 / gallery pixel-parity — Character panel.
//
// Wraps the catalog's CompositionRenderer (every bound field renders
// from `character.composition.ts`) plus two bespoke surfaces the
// declarative catalog can't express:
//
//   • Family — a live select over the `fonts` document collection.
//     The collection rows key on `family` (a string), not the
//     `{selfId,name}` shape the catalog CollectionSelect leaf
//     expects, and the wire value is `Value::Text(family)`; so the
//     select is hand-wired here, committing `characterFontFamily`
//     (W2.1, 2026-06-06).
//   • OpenType — the deep1 card's OPENTYPE chip row. W2.4
//     (2026-06-07): each chip now WRITES the run's
//     `characterOtfFeatures` — an opaque space-separated tag string
//     owned by the mutate API. A chip toggles the presence of its tag
//     (e.g. Frac ⇒ `frac`) in that string, preserving any other tags.
//
// ADR 023 phase C/D — THE VALUE AXIS. This panel is REWIRED, not
// rewritten, and the rewiring is not in this file: `useBindings`
// resolves every `selectionProperty` through the binding-provider seam
// now, so the composition fields retarget with ZERO change here. What
// IS here is the two BESPOKE surfaces reading the seam's verdict, since
// they render their own chrome rather than a catalog leaf:
//
//   · a claim of `absent` is NOT `mixed`. A provider that owns the
//     selection and has no such property is answering, and painting the
//     em-dash "mixed" face over that answer says the values disagree
//     when in truth there is nothing to disagree about;
//   · a claim the provider will not take WRITES for is read-only, which
//     the missing `onCommit` already produces.
//
// There is not one `if (pluginId === …)` in this panel and there must
// never be. It does not learn who answered — `data-binding-source` is a
// DOM hook for tests and diagnostics, nothing reads it as control flow.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useBindings,
  useCollection,
} from "@paged-media/shell";
import { KitSelect } from "@paged-media/ui";
import type { FontSummary, Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";

// W2.4 — UI chip label → the OpenType feature tag it toggles in the
// `characterOtfFeatures` string. Standard 4-char OT feature tags:
//   Liga = standard ligatures, Frac = fractions, Ordn = ordinals,
//   OldS = oldstyle figures (`onum`).
const OPENTYPE_CHIPS: ReadonlyArray<{ label: string; tag: string }> = [
  { label: "Liga", tag: "liga" },
  { label: "Frac", tag: "frac" },
  { label: "Ordn", tag: "ordn" },
  { label: "OldS", tag: "onum" },
];

const OTF_BINDING = {
  otf: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "characterOtfFeatures" as const,
  },
};

/** Parse the opaque space-separated tag string into a tag set. */
function parseTags(v: Value | null): Set<string> {
  if (!v || v.type !== "text") return new Set();
  const s = (v.value as string) ?? "";
  return new Set(s.split(/\s+/).filter(Boolean));
}

/** OpenType feature chips — each toggles its tag in the run's
 *  `characterOtfFeatures` string, preserving the other tags (W2.4). */
function OpenTypeChips() {
  const { otf } = useBindings(OTF_BINDING);
  const active = parseTags(otf.value);
  const disabled = otf.onCommit == null;
  const absent = otf.state === "absent";
  const commit = (tag: string) => {
    if (disabled) return;
    const next = new Set(active);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    // Stable order: emit in the chip-row order so round-trips read
    // deterministically.
    const ordered = OPENTYPE_CHIPS.map((c) => c.tag).filter((t) =>
      next.has(t),
    );
    // Preserve any tags the chip row doesn't surface (forward-compat).
    for (const t of next) if (!ordered.includes(t)) ordered.push(t);
    otf.onCommit?.({ type: "text", value: ordered.join(" ") } as Value);
  };
  return (
    <div
      className="-mx-3 border-t border-input px-3 pt-2"
      data-opentype-seam
      data-control="characterOtfFeatures"
      data-binding-source={otf.provider ?? "core"}
      data-binding-state={otf.state}
      data-seam={absent ? "true" : undefined}
      style={{ opacity: absent ? 0.55 : 1 }}
    >
      <div className="pg-label mb-2">Opentype</div>
      <div className="flex gap-[6px]">
        {OPENTYPE_CHIPS.map(({ label, tag }) => {
          const on = active.has(tag);
          return (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              data-opentype-chip={label}
              data-otf-tag={tag}
              data-active={on ? "" : undefined}
              title={`OpenType feature ${tag}`}
              className="h-[26px] rounded-[6px] border px-[9px] text-[11px]"
              style={{
                fontFamily: "var(--font-mono)",
                borderColor: on ? "var(--pg-accent)" : "var(--input)",
                background: on ? "var(--pg-accent)" : "var(--background)",
                color: on ? "var(--pg-accent-fg)" : "var(--pg-muted-fg)",
                opacity: disabled ? 0.55 : 1,
              }}
              onClick={() => commit(tag)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FAMILY_BINDING = {
  family: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "characterFontFamily" as const,
  },
};

function unwrapText(v: Value | null): string | null {
  if (!v || v.type !== "text") return null;
  return (v.value as string) ?? "";
}

/** Live font-family select over the `fonts` collection (bespoke —
 *  the catalog CollectionSelect leaf can't read the `family`-keyed
 *  row shape, and the wire value is the family name string). */
function FamilySelect() {
  const fonts = useCollection<FontSummary>("fonts");
  const { family } = useBindings(FAMILY_BINDING);
  const current = unwrapText(family.value);
  const resolved = current !== null && current !== "";
  const families = fonts ?? [];
  const known = families.some((f) => f.family === current);
  // ADR 023 — an owned-but-inapplicable path is a SEAM, not a mixed
  // value. The em-dash stays (there is still nothing to show) but the
  // `data-mixed` claim does not.
  const absent = family.state === "absent";
  return (
    <div
      className="mb-px"
      data-character-family
      data-control="characterFontFamily"
      data-binding-source={family.provider ?? "core"}
      data-binding-state={family.state}
    >
      <div
        className="text-[11.5px] mb-[5px]"
        style={{ color: "var(--pg-muted-fg)" }}
      >
        Family
      </div>
      <KitSelect
        value={resolved ? current : "__mixed__"}
        soft={!resolved}
        disabled={family.onCommit == null}
        data-seam={absent ? "true" : undefined}
        data-mixed={resolved || absent ? undefined : ""}
        onChange={(e) => {
          if (e.target.value === "__mixed__") return;
          family.onCommit?.({ type: "text", value: e.target.value } as Value);
        }}
      >
        {!resolved && (
          <option value="__mixed__" disabled>
            —
          </option>
        )}
        {families.map((f) => (
          <option key={f.family} value={f.family}>
            {f.family}
          </option>
        ))}
        {/* Keep the current family visible even if it isn't in the
            in-use list (e.g. a style default not on any run). */}
        {resolved && !known ? <option value={current}>{current}</option> : null}
      </KitSelect>
    </div>
  );
}

export function CharacterPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-character-panel="ready">
        <FamilySelect />
        <CompositionRenderer composition={characterComposition} />
        <OpenTypeChips />
      </div>
    </CatalogRegistryProvider>
  );
}
