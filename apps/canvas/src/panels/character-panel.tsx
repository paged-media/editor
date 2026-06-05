// SDK Phase 3 / gallery pixel-parity — Character panel.
//
// Wraps the catalog's CompositionRenderer (every bound field renders
// from `character.composition.ts`) + the deep1 card's OPENTYPE chip
// row, bespoke here as an honest seam — h26 mono chips, NEUTRAL
// (no active chip), visibly disabled until OpenType-feature paths
// exist on the wire.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";

const OPENTYPE_CHIPS = ["Liga", "Frac", "Ordn", "OldS"];

export function CharacterPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3 flex flex-col gap-[9px]" data-character-panel="ready">
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
                title="OpenType features — awaiting engine support"
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
