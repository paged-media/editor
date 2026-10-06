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

// ADR 323 — Object Options: the page-item paths no other panel lays out
// (corner options, arrowheads and dashes, gradient angle / length /
// feather, the raw item and image transforms, flip V, the item's name,
// layer, image link and labels), as `PropertyField`s on the element
// selection. A commit over several selected items is ONE batch = one
// undo step; every field offers "Bind to data…". The gradient tools and
// object commands keep writing their own gestures — this is where the
// same paths are visible, typed and bindable.

import { CockpitPanelHeader } from "@paged-media/shell";

import { SchemaSections, type SectionSpec } from "./schema-sections";

const OBJECT_OPTION_SECTIONS: readonly SectionSpec[] = [
  {
    title: "Item",
    fields: [
      { path: "itemName", label: "Name" },
      { path: "itemLayer", label: "Layer", collection: "layers" },
      { path: "appliedObjectStyle", label: "Object style", collection: "objectStyles" },
    ],
  },
  {
    title: "Corner Options",
    fields: [
      { path: "frameCornerOptionTopLeft", label: "Top left" },
      { path: "frameCornerRadiusTopLeft", label: "TL size" },
      { path: "frameCornerOptionTopRight", label: "Top right" },
      { path: "frameCornerRadiusTopRight", label: "TR size" },
      { path: "frameCornerOptionBottomLeft", label: "Bottom left" },
      { path: "frameCornerRadiusBottomLeft", label: "BL size" },
      { path: "frameCornerOptionBottomRight", label: "Bottom right" },
      { path: "frameCornerRadiusBottomRight", label: "BR size" },
    ],
  },
  {
    title: "Stroke Ends and Dashes",
    fields: [
      { path: "frameStrokeStartArrowhead", label: "Start" },
      { path: "frameStrokeEndArrowhead", label: "End" },
      { path: "frameStrokeDashArray", label: "Dashes" },
    ],
  },
  {
    title: "Gradient",
    fields: [
      { path: "frameGradientFillAngle", label: "Fill angle" },
      { path: "frameGradientFillLength", label: "Fill length" },
      { path: "frameGradientFeather", label: "Feather" },
      { path: "frameGradientStrokeAngle", label: "Stroke angle" },
      { path: "frameGradientStrokeLength", label: "Stroke length" },
    ],
  },
  {
    title: "Transform",
    fields: [
      { path: "frameTransform", label: "Matrix" },
      { path: "frameFlipV", label: "Flip V" },
    ],
  },
  {
    title: "Image",
    fields: [
      { path: "imageUri", label: "Link" },
      { path: "imageContentTransform", label: "Content" },
    ],
  },
  {
    title: "Advanced",
    fields: [
      { path: "framePath", label: "Path" },
      { path: "pluginMetadata", label: "Label" },
    ],
  },
];

export function ObjectOptionsPanel() {
  return (
    <div data-object-options-panel="ready">
      <CockpitPanelHeader title="Object Options" />
      <SchemaSections schemaKind="frame" sections={OBJECT_OPTION_SECTIONS} testId="frame" />
    </div>
  );
}
