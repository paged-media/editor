// SDK Phase 5 (v1 sweep) — Text Frame Options panel.
//
// Composition shim. Element-scope bindings to the text-frame
// preference paths (columns / balance / inset / vertical justify /
// auto-size / first baseline). W2.3 flipped the COLUMNS + justify +
// auto-size + baseline rows live on protocol v28 (engine gap 13).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { textFrameOptionsComposition } from "./text-frame-options.composition";

export function TextFrameOptionsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-text-frame-options-panel="ready">
        <CompositionRenderer composition={textFrameOptionsComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
