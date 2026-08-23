/*
 * This file is part of paged (https://paged.media).
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

// C-32 — the pure half of the host Eyedropper: page-point → snapshot
// pixel, RGB → swatch identity, and the apply plan. Split out from the
// handler because everything here is arithmetic and naming, testable
// without a canvas, a worker, or a document.
//
// WHY THE HOST OWNS THIS AT ALL. paged.draw shipped an Eyedropper and
// the editor RETIRED its own inert built-in in favour of it — correct
// for the rail, but it made the capability unreachable for paged.image,
// which cannot import from a sibling bundle under the isolation
// contract. The Photoshop catalog's "Direct reuse: Eyedropper" row went
// from satisfiable to unsatisfiable BECAUSE a sibling plugin succeeded.
//
// The ruling this implements: **a capability whose vocabulary is HOST
// vocabulary belongs to the host once a second plugin needs it.**
// Colour is host vocabulary — swatches are a document resource, every
// one of the seven bundles touches colour, and the pixels being sampled
// are the composited page, which only the host can see. Contrast
// paged.draw's own Eyedropper, which samples typed ELEMENT PROPERTIES
// (fill/stroke/weight/opacity via `elementProperties`) and is genuinely
// draw vocabulary — it stays where it is. The two are not duplicates:
// one reads properties off an element, this one reads a PIXEL off the
// composited page, and paged.draw's handler says in its own header that
// it does not do pixels.
//
// HOW PLUGINS GET THE RESULT, with no new contract surface: the sample
// lands in the document defaults (`setDocumentDefaults.fillColor`), and
// `DocumentMeta.defaultFillColor` is ALREADY a read every bundle has.
// That is the whole argument for host-ownership made concrete — the
// host already had a colour channel plugins read; it just had nothing
// writing a sampled pixel into it.

/** A sampled pixel, 0–255 per channel. Alpha is carried so a caller can
 *  decide what a transparent sample means; `swatchSpecFor` ignores it,
 *  because IDML swatches have no alpha of their own. */
export interface SampledRgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Where a page-local point lands in a page snapshot's pixel grid.
 *  `null` when the snapshot has no usable extent. */
export function snapshotPixelFor(
  pagePoint: readonly [number, number],
  pageWidthPt: number,
  snapshotWidthPx: number,
  snapshotHeightPx: number,
): [number, number] | null {
  if (
    !(pageWidthPt > 0) ||
    !(snapshotWidthPx > 0) ||
    !(snapshotHeightPx > 0)
  ) {
    return null;
  }
  // The snapshot is the page rendered to `snapshotWidthPx`, so one
  // scale serves both axes — pages are not anamorphic.
  const scale = snapshotWidthPx / pageWidthPt;
  const x = Math.floor(pagePoint[0] * scale);
  const y = Math.floor(pagePoint[1] * scale);
  // A click exactly on the trailing edge floors to width/height, which
  // is one past the last pixel. Clamp rather than refuse: the user
  // pointed at the page, and the edge pixel is the honest answer.
  if (x < -0.5 || y < -0.5) return null;
  return [
    Math.min(Math.max(x, 0), snapshotWidthPx - 1),
    Math.min(Math.max(y, 0), snapshotHeightPx - 1),
  ];
}

/** InDesign's own name for an unnamed process colour, and the identity
 *  we dedupe on: two samples of the same pixel value must resolve to
 *  ONE swatch, or every click grows the document. */
export function swatchNameFor(rgb: SampledRgb): string {
  return `R=${Math.round(rgb.r)} G=${Math.round(rgb.g)} B=${Math.round(rgb.b)}`;
}

/** The `SwatchSpec` for a sampled pixel. RGB rather than CMYK on
 *  purpose: the sample came off an sRGB composite, so converting here
 *  would invent a separation the user never chose. */
export function swatchSpecFor(rgb: SampledRgb): {
  name: string;
  space: string;
  value: number[];
} {
  return {
    name: swatchNameFor(rgb),
    space: "RGB",
    value: [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)],
  };
}

/** Existing swatches, reduced to what the lookup needs. */
export interface SwatchLike {
  selfId: string;
  name?: string | null;
}

/** The id of an existing swatch carrying this exact colour, or null.
 *  Matching by NAME is matching by value here, because `swatchNameFor`
 *  is a total function of the RGB triple — a name collision would mean
 *  the same colour. */
export function findSwatchFor(
  swatches: readonly SwatchLike[],
  rgb: SampledRgb,
): string | null {
  const want = swatchNameFor(rgb);
  for (const s of swatches) {
    if (s.name === want) return s.selfId;
  }
  return null;
}

/** What the Eyedropper does with a sample, decided before any mutation
 *  is issued so the decision is testable on its own.
 *
 *  `needsSwatch` is the create-if-absent step; `targets` are the
 *  selected elements whose fill should follow the sample. An EMPTY
 *  selection is not a failure — the sample still becomes the document
 *  default, which is how a plugin (and the next new object) picks it
 *  up. That is the case paged.image lives in: no host frame selected,
 *  the raster context wanting a brush colour. */
export interface ApplyPlan<Target> {
  swatchName: string;
  needsSwatch: boolean;
  targets: Target[];
}

/** Generic in the target id so this module stays free of wire types —
 *  the host passes `ElementId`s, a test passes strings, and the plan
 *  logic is the same either way. */
export function planApply<Target>(
  rgb: SampledRgb,
  swatches: readonly SwatchLike[],
  selection: readonly Target[],
): ApplyPlan<Target> {
  return {
    swatchName: swatchNameFor(rgb),
    needsSwatch: findSwatchFor(swatches, rgb) === null,
    targets: [...selection],
  };
}
