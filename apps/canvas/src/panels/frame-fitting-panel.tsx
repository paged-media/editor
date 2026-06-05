// SDK Phase 5 / panel-gallery pass — Frame Fitting panel.
//
// Composition shim (fit type + crops live; auto-fit check rows
// seamed). Rectangle-only — picking the panel when a TextFrame is
// selected shows em-dash placeholders because the apply layer
// raises UnsupportedProperty for non-Rectangle kinds. The gallery's
// reference-point grid is bespoke and INERT until the engine grows
// a reference-point convention on the fitting arm (honest seam).

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  ReferencePointGrid,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { frameFittingComposition } from "./frame-fitting.composition";

export function FrameFittingPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-frame-fitting-panel="ready">
        <CompositionRenderer composition={frameFittingComposition} />
        <div className="grid grid-cols-[92px_1fr] items-center gap-2 pt-2">
          <span className="text-xs text-muted-foreground">Reference point</span>
          <ReferencePointGrid value={0} disabled />
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
