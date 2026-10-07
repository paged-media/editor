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

// SDK Phase 5 (v1 sweep) — Text Frame Options panel.
//
// Composition shim. Element-scope bindings to the text-frame
// preference paths (columns / balance / inset / vertical justify /
// auto-size / first baseline). W2.3 flipped the COLUMNS + justify +
// auto-size + baseline rows live on protocol v28 (engine gap 13).

import { useMemo } from "react";

import {
  CatalogRegistryProvider,
  CockpitSection,
  CompositionRenderer,
  PropertyField,
  useContentSelection,
  useSelection,
} from "@paged-media/shell";

import { appCatalogRegistry } from "./catalog-registry";
import { textFrameOptionsComposition } from "./text-frame-options.composition";

export function TextFrameOptionsPanel() {
  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div className="p-3" data-text-frame-options-panel="ready">
        <CompositionRenderer composition={textFrameOptionsComposition} />
        <FlowGrowSection />
      </div>
    </CatalogRegistryProvider>
  );
}

/** ADR 323 §4 — page growth is a STORY setting (`story:<id>` flowGrow,
 *  flowGrowMaxPages, flowGrowCopyFrameOptions): the stories the selected
 *  text frames show (or the caret's), as PropertyFields — all of them
 *  in one batch = one undo step, with "Bind to data…". */
function FlowGrowSection() {
  const { elementGeometry } = useSelection();
  const { contentSelection } = useContentSelection();
  const fromFrames = elementGeometry.map((g) => g.storyId).filter((s): s is string => !!s);
  const ids = fromFrames.length ? fromFrames : contentSelection ? [contentSelection.storyId] : [];
  const key = [...new Set(ids)].join(" ");
  const targets = useMemo(() => (key ? key.split(" ").map((id) => `story:${id}`) : []), [key]);
  if (!targets.length) return null;
  return (
    <CockpitSection title="Page growth">
      <div className="flex flex-col gap-1.5 pb-2" data-flow-grow={targets.join(" ")}>
        <PropertyField path="flowGrow" label="Add pages as text overflows" targets={targets} schemaKind="story" />
        <PropertyField path="flowGrowMaxPages" label="At most (pages)" targets={targets} schemaKind="story" />
        <PropertyField path="flowGrowCopyFrameOptions" label="Copy frame options" targets={targets} schemaKind="story" />
      </div>
    </CockpitSection>
  );
}
