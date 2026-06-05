// SDK Phase 3 / panel-gallery pass — Character panel.
//
// Wraps the catalog's CompositionRenderer (every bound field renders
// from `character.composition.ts`) + the gallery's OPENTYPE chip
// row, which exceeds the composition vocabulary so it lives here as
// a bespoke HONEST SEAM — visible, disabled, never fake-interactive
// (no OpenType-feature paths on the wire yet).

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
      <div className="p-3" data-character-panel="ready">
        <CompositionRenderer composition={characterComposition} />
        <div className="border-t border-input mt-3 pt-2" data-opentype-seam>
          <div className="pg-label px-1">Opentype</div>
          <div className="flex gap-1 pt-1">
            {OPENTYPE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled
                data-opentype-chip={chip}
                title="OpenType features — awaiting engine support"
                className="text-xs px-2 h-[24px] rounded-[6px] border border-input bg-background text-muted-foreground opacity-55"
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
