// SDK Phase 5 (named sweep) — Gradients panel.
//
// Composition shim. Same recipe as Swatches with collectionName:
// "gradients". A gradient self_id flows through the same
// FrameFillColor apply arm as a swatch self_id (IDML allows
// either as the FillColor attribute).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { gradientsComposition } from "./gradients.composition";
import { GradientEditor } from "./gradient-editor";

export function GradientsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-gradients-panel="ready">
        <CompositionRenderer composition={gradientsComposition} />
        {/* Concept 2 — the ramp editor (expert child). */}
        <GradientEditor />
      </div>
    </CatalogRegistryProvider>
  );
}
