// SDK Phase 5 / gallery pixel-parity — Frame Fitting panel. The
// deep1 card order: Fit segments → reference-point grid ("Align
// content", inert seam) → Crop 4-up → auto-fit check rows.
// Rectangle-only — other kinds em-dash.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  ReferencePointGrid,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import {
  frameFittingCropComposition,
  frameFittingFitComposition,
} from "./frame-fitting.composition";

export function FrameFittingPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-3 flex flex-col gap-[9px]"
        data-frame-fitting-panel="ready"
      >
        <CompositionRenderer composition={frameFittingFitComposition} />
        <div className="my-[2px] flex items-center gap-[14px]">
          <ReferencePointGrid value={0} disabled />
          <span
            className="text-[10.5px]"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Align content
          </span>
        </div>
        <CompositionRenderer composition={frameFittingCropComposition} />
      </div>
    </CatalogRegistryProvider>
  );
}
