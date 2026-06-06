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
//   • OpenType — the deep1 card's OPENTYPE chip row, an honest seam:
//     `characterOtfFeatures` is an OPAQUE feature-tag string with no
//     per-chip mapping, so the chips stay disabled until a tag-string
//     editor exists.

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

const OPENTYPE_CHIPS = ["Liga", "Frac", "Ordn", "OldS"];

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
  return (
    <div className="mb-px" data-character-family>
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
        data-mixed={resolved ? undefined : ""}
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
        <div
          className="-mx-3 border-t border-input px-3 pt-2"
          data-opentype-seam
        >
          <div className="pg-label mb-2">Opentype</div>
          <div className="flex gap-[6px]">
            {OPENTYPE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled
                data-opentype-chip={chip}
                title="OpenType features — characterOtfFeatures is an opaque tag string; per-chip mapping pending"
                className="h-[26px] rounded-[6px] border border-input bg-background px-[9px] text-[11px] opacity-55"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--pg-muted-fg)",
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
