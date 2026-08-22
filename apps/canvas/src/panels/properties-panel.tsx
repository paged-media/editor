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
  PanelHost,
  useContentSelection,
  useDocument,
  useOptionalCockpitState,
  useSelection,
  useSelectionObjectType,
  useOptionalThreading,
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
  // Plugin-owned content: SELECTING a classified object (webFrame,
  // sheetFrame, wordDocument, …) now surfaces the owning bundle in the
  // inspector — previously object types were consulted only on
  // double-click (the edit-context entry chain).
  const owned = useSelectionObjectType();

  const hasElement = elementSelection.length > 0;
  const hasContent = !!contentSelection;
  const hasImage =
    hasElement &&
    elementGeometry.some(
      (g) => (g as { hasImage?: boolean }).hasImage === true,
    );

  // D1 — the frame whose overset state the chip reports. A text caret
  // means the content selection's frame; a frame selection means that
  // frame. Null when neither, which is why the chip renders only when
  // it has something real to say rather than showing a dash.
  const threading = useOptionalThreading();
  // `ElementId.id` is a union — a StoryRange carries a struct, not a
  // string — and narrowing on `kind` does not narrow it, so the string
  // check is the narrowing.
  const oversetFrameId = (() => {
    const hit = elementGeometry.find((g) => g.id.kind === "textFrame");
    return typeof hit?.id.id === "string" ? hit.id.id : null;
  })();

  // Live selection wins; the panel-rail steer covers the empty case.
  const kind: InspectorKind = hasContent
    ? "text"
    : hasImage
      ? "image"
      : hasElement
        ? "frame"
        : (cockpit?.inspectorContext ?? "none");

  const ownedTitle =
    kind === "frame" && owned ? humanizeType(owned.objectType.type) : null;
  const title =
    ownedTitle ??
    (kind === "text"
      ? "Text"
      : kind === "image"
        ? "Image"
        : kind === "frame"
          ? "Frame"
          : kind === "page"
            ? "Page"
            : "Properties");

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
            {/* D1 — the seam had INVERTED. This chip read
                `overset · —  "awaiting the engine's overset signal"`
                while that very signal was live and already painting the
                red "+" badge on the out-port two overlays away. So the
                Properties panel — which IS on the panel rail, unlike
                the ports — was telling the user a shipped feature was
                missing, next to a canvas demonstrating it.

                `StorySummary.overset` reaches the ThreadingContext via
                `paged.stories()`, mapped frame→story by hit-testing the
                frame's transformed centre. Reading it here costs
                nothing; it is the same accessor the ports use. */}
            {kind === "text" && oversetFrameId && (
              <span
                data-overset-state={
                  threading?.isOverset(oversetFrameId) ? "overset" : "fits"
                }
                title={
                  threading?.isOverset(oversetFrameId)
                    ? "This frame's story does not fit — text continues past the last frame in its chain"
                    : "This frame's story fits"
                }
                className="pg-ui-xs"
                style={{
                  opacity: threading?.isOverset(oversetFrameId) ? 1 : 0.55,
                  whiteSpace: "nowrap",
                  color: threading?.isOverset(oversetFrameId)
                    ? "var(--status-error)"
                    : undefined,
                }}
              >
                {threading?.isOverset(oversetFrameId) ? "overset" : "overset · no"}
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
          {kind === "frame" && owned ? (
            <div
              data-properties-section="object-type"
              data-object-type={owned.objectType.type}
            >
              {owned.editContext?.panelIds?.length ? (
                // The owning bundle's inspector surface, inline — the
                // same registered panel the edit context raises.
                <PanelHost id={owned.editContext.panelIds[0]} />
              ) : (
                <div
                  className="pg-ui-xs"
                  style={{ padding: "4px 2px", opacity: 0.7, lineHeight: 1.5 }}
                >
                  {humanizeType(owned.objectType.type)} — double-click to edit
                  in place.
                </div>
              )}
            </div>
          ) : null}
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

/** "webFrame" → "Web frame" — the breadcrumb's title-casing rule. */
function humanizeType(type: string): string {
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
