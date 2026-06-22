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

// SDK Phase 5 (v1 sweep) — Control bar.
//
// Horizontal-strip variant of the Properties panel. Per
// `panel-catalog-and-sdk-extension.md` §6 Tier 6 — the
// "Control" idiom InDesign uses for the top context bar.
// Renders the same compositions Properties does (Object
// Transform + Stroke + Character + Paragraph) but in a
// horizontally-scrollable row so it fits a thin top dock.
//
// The compositions stay vertical inside each section — only the
// outer flow is horizontal. Wide sections (Object, Paragraph)
// take more space; the scroll lets them all coexist.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useContentSelection,
  useSelection,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { characterComposition } from "./character.composition";
import { objectTransformComposition } from "./object-transform.composition";
import { paragraphComposition } from "./paragraph.composition";
import { strokeComposition } from "./stroke.composition";

export function ControlPanel() {
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const hasElement = elementSelection.length > 0;
  const hasContent = !!contentSelection;

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="p-2 flex gap-3 overflow-x-auto"
        data-control-panel="ready"
        data-has-element={hasElement ? "true" : "false"}
        data-has-content={hasContent ? "true" : "false"}
      >
        {!hasElement && !hasContent ? (
          <div
            className="text-xs text-muted-foreground self-center"
            data-control-empty
          >
            Select a frame or place a text caret.
          </div>
        ) : null}
        {hasElement ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="object"
          >
            <CompositionRenderer composition={objectTransformComposition} />
          </div>
        ) : null}
        {hasElement ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="stroke"
          >
            <CompositionRenderer composition={strokeComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div
            className="shrink-0 min-w-[14rem] border-r border-input pr-3"
            data-control-section="character"
          >
            <CompositionRenderer composition={characterComposition} />
          </div>
        ) : null}
        {hasContent ? (
          <div
            className="shrink-0 min-w-[14rem]"
            data-control-section="paragraph"
          >
            <CompositionRenderer composition={paragraphComposition} />
          </div>
        ) : null}
      </div>
    </CatalogRegistryProvider>
  );
}
