// Cockpit — the Properties tab: the kit's CONTEXT INSPECTOR
// (inspectors.jsx — swaps Text / Image / Frame / Page by what's
// selected). Routing layer over the existing engine-backed
// compositions; no new bindings, no new wire:
//
//   - Content selection (caret/range)  ⇒ Text: Character + Paragraph.
//   - Element(s) whose geometry hosts a placed image ⇒ Image:
//     Object Transform + Frame fitting + Stroke.
//   - Other element(s) ⇒ Frame: Object Transform + Stroke (+ the
//     text-frame compositions ride the content selection).
//   - Nothing selected ⇒ the panel-rail steer (`inspectorContext`)
//     picks the Page summary or a per-kind guidance hint.
//
// The AI Assistant card renders below as a visible, inert seam.

import {
  AIAssistantSeam,
  CatalogRegistryProvider,
  CockpitPanelHeader,
  CockpitRow,
  CockpitSection,
  CockpitValue,
  CompositionRenderer,
  useContentSelection,
  useDocument,
  useOptionalCockpitState,
  useSelection,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";
import { frameFittingComposition } from "./frame-fitting.composition";
import { objectTransformComposition } from "./object-transform.composition";
import { paragraphComposition } from "./paragraph.composition";
import { strokeComposition } from "./stroke.composition";

type InspectorKind = "text" | "image" | "frame" | "page" | "none";

export function PropertiesPanel() {
  const { elementSelection, elementGeometry } = useSelection();
  const { contentSelection } = useContentSelection();
  const cockpit = useOptionalCockpitState();

  const hasElement = elementSelection.length > 0;
  const hasContent = !!contentSelection;
  const hasImage =
    hasElement &&
    elementGeometry.some(
      (g) => (g as { hasImage?: boolean }).hasImage === true,
    );

  // Live selection wins; the panel-rail steer covers the empty case.
  const kind: InspectorKind = hasContent
    ? "text"
    : hasImage
      ? "image"
      : hasElement
        ? "frame"
        : (cockpit?.inspectorContext ?? "none");

  const title =
    kind === "text"
      ? "Text"
      : kind === "image"
        ? "Image"
        : kind === "frame"
          ? "Frame"
          : kind === "page"
            ? "Page"
            : "Properties";

  // The gallery's selection sub-header — "Text · 1 frame".
  const selectionLabel =
    kind === "text"
      ? "Text selection"
      : hasElement
        ? `${kind === "image" ? "Image" : "Frame"} · ${
            elementSelection.length
          } frame${elementSelection.length === 1 ? "" : "s"}`
        : null;

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        data-properties-panel="ready"
        data-inspector-kind={kind}
        data-has-element={hasElement ? "true" : "false"}
        data-has-content={hasContent ? "true" : "false"}
        style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <CockpitPanelHeader title={title} />
        {selectionLabel && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "0 14px 8px",
            }}
          >
            <span className="pg-label" data-selection-label>
              {selectionLabel}
            </span>
            {/* The kit's overset alert chip — an honest seam until
                the engine's overset signal lands (gap 1). */}
            {kind === "text" && (
              <span
                data-overset-seam
                title="Overset detection — awaiting the engine's overset signal"
                className="pg-ui-xs"
                style={{ opacity: 0.55, whiteSpace: "nowrap" }}
              >
                overset · —
              </span>
            )}
          </div>
        )}

        {kind === "none" && (
          <div
            className="pg-ui-xs"
            data-properties-empty
            style={{ padding: "0 14px 12px", lineHeight: 1.5 }}
          >
            Select a frame or place a text caret to see its properties.
          </div>
        )}

        {kind === "page" && <PageSummary />}

        <div className="p-3 pt-0 flex flex-col gap-3">
          {hasElement ? (
            <div data-properties-section="object">
              <CompositionRenderer composition={objectTransformComposition} />
            </div>
          ) : null}
          {kind === "image" ? (
            <div data-properties-section="fitting">
              <CompositionRenderer composition={frameFittingComposition} />
            </div>
          ) : null}
          {hasElement ? (
            <div data-properties-section="stroke">
              <CompositionRenderer composition={strokeComposition} />
            </div>
          ) : null}
          {hasContent ? (
            <div data-properties-section="character">
              <CompositionRenderer composition={characterComposition} />
            </div>
          ) : null}
          {hasContent ? (
            <div data-properties-section="paragraph">
              <CompositionRenderer composition={paragraphComposition} />
            </div>
          ) : null}
        </div>

        {kind !== "none" && <AIAssistantSeam />}
      </div>
    </CatalogRegistryProvider>
  );
}

/** Page geometry summary (kit PageInspector). REAL: size from the
 *  document handle. Margins / bleed / columns await the engine's
 *  page-geometry reads; section/status await collaboration. */
function PageSummary() {
  const { handle } = useDocument();
  const first = handle?.pageSizesPt[0];
  const fmt = (pt: number) => `${(pt / 72).toFixed(2).replace(/\.00$/, "")} in`;
  return (
    <CockpitSection title="Geometry">
      <CockpitRow label="Pages">
        <CockpitValue>{handle ? handle.pageCount : "—"}</CockpitValue>
      </CockpitRow>
      <CockpitRow label="Size">
        <CockpitValue>
          {first ? `${fmt(first[0])} × ${fmt(first[1])}` : "—"}
        </CockpitValue>
      </CockpitRow>
      <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
        Margins, bleed and column reads land with the engine's page-geometry
        accessors.
      </span>
    </CockpitSection>
  );
}
