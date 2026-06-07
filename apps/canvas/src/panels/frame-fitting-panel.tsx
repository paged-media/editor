// SDK Phase 5 / gallery pixel-parity — Frame Fitting panel. The
// deep1 card order: Fit segments → reference-point grid ("Align
// content") → Crop 4-up → auto-fit check rows.
// Rectangle-only — other kinds em-dash.
//
// W2.3 (2026-06-06) — the reference-point grid flips LIVE on
// `frameFittingReferencePoint`. It's bespoke (not a composition leaf)
// because the 3×3 grid maps a row-major cell index ↔ the raw IDML
// `FittingAlignment` anchor string the read-side returns verbatim.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  ReferencePointGrid,
  useBindings,
} from "@paged-media/shell";
import type { Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";
import {
  frameFittingCropComposition,
  frameFittingFitComposition,
} from "./frame-fitting.composition";

// Row-major 3×3 ↔ IDML `FittingAlignment` anchor strings (the same
// 9-point vocabulary the parser uses for AutoSizingReferencePoint).
// Index 0 = top-left … 8 = bottom-right.
const ANCHORS = [
  "TopLeftPoint",
  "TopCenterPoint",
  "TopRightPoint",
  "CenterLeftPoint",
  "CenterPoint",
  "CenterRightPoint",
  "BottomLeftPoint",
  "BottomCenterPoint",
  "BottomRightPoint",
] as const;

const REFERENCE_POINT_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameFittingReferencePoint" as const,
  },
};

// W2.4 — the "Fill frame proportionally" action writes the existing
// `frameFittingType` enum to `"FillProportionally"` (a real persisted
// model property — not a client-side scale hack and not a new op).
const FITTING_TYPE_BINDING = {
  value: {
    kind: "selectionProperty" as const,
    scope: "element" as const,
    path: "frameFittingType" as const,
  },
};

/** Resolve the bound anchor string to a grid index, or null when the
 *  value is absent / mixed / an unrecognised anchor (→ inert grid). */
function anchorToIndex(v: Value | null): number | null {
  if (!v || v.type !== "text") return null;
  const i = ANCHORS.indexOf(v.value as (typeof ANCHORS)[number]);
  return i >= 0 ? i : null;
}

/** Resolve `frameFittingType` to its current enum string, or null when
 *  absent / mixed. */
function fittingType(v: Value | null): string | null {
  if (!v || v.type !== "text") return null;
  return (v.value as string) ?? "";
}

export function FrameFittingPanel() {
  const resolved = useBindings(REFERENCE_POINT_BINDING);
  const refPoint = resolved.value;
  const index = anchorToIndex(refPoint.value);

  const fitting = useBindings(FITTING_TYPE_BINDING).value;
  const fittingDisabled = fitting.onCommit == null;
  const isFillProp = fittingType(fitting.value) === "FillProportionally";

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-3 flex flex-col gap-[9px]"
        data-frame-fitting-panel="ready"
      >
        <CompositionRenderer composition={frameFittingFitComposition} />
        <div className="my-[2px] flex items-center gap-[14px]">
          <ReferencePointGrid
            value={index ?? 0}
            disabled={refPoint.onCommit == null}
            onChange={(i) => {
              refPoint.onCommit?.({
                type: "text",
                value: ANCHORS[i],
              } as Value);
            }}
          />
          <span
            className="text-[10.5px]"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            Align content
          </span>
        </div>
        <CompositionRenderer composition={frameFittingCropComposition} />
        {/* W2.4 — fill-frame-proportionally action. Writes the real
            `frameFittingType` enum; reflects the current type so the
            button reads pressed when already FillProportionally. */}
        <button
          type="button"
          disabled={fittingDisabled}
          aria-pressed={isFillProp}
          data-fill-proportionally
          data-active={isFillProp ? "" : undefined}
          className="h-[28px] rounded-[6px] border px-[10px] text-[11px]"
          style={{
            borderColor: isFillProp ? "var(--pg-accent)" : "var(--input)",
            background: isFillProp ? "var(--pg-accent)" : "var(--background)",
            color: isFillProp ? "var(--pg-accent-fg)" : "var(--pg-fg)",
            opacity: fittingDisabled ? 0.55 : 1,
          }}
          onClick={() => {
            fitting.onCommit?.({
              type: "text",
              value: "FillProportionally",
            } as Value);
          }}
        >
          Fill frame proportionally
        </button>
      </div>
    </CatalogRegistryProvider>
  );
}
