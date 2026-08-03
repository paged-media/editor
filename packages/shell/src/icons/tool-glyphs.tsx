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

import type { ReactNode } from "react";

// Original SVG glyphs for the InDesign-style tool rail. Authored on a
// 24×24 grid with ~3px padding; each value is a fragment of SVG child
// elements only — the <svg> wrapper (viewBox 0 0 24 24,
// fill="currentColor") lives in Icon.tsx.
//
// Convention: SOLID silhouettes (paths/rects/circles/polygons) inherit
// the wrapper's `fill="currentColor"` and set no fill of their own.
// LINE-style glyphs set `fill="none" stroke="currentColor"` with a
// 1.6–1.9 stroke and round caps/joins. This is clean-room geometry —
// faithful to each tool's recognizable silhouette, not traced from
// Adobe artwork.

const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const TOOL_GLYPHS: Record<string, ReactNode> = {
  // Selection — classic solid mouse-pointer arrow, tip at top-left.
  "tool-select": (
    <>
      <path d="M5 3 L5 18.2 L9 14.2 L11.6 19.8 L13.9 18.7 L11.3 13.2 L16.8 13.1 Z" />
    </>
  ),

  // Direct selection — the same pointer arrow, hollow.
  "tool-directSelect": (
    <>
      <path
        d="M5 3 L5 18.2 L9 14.2 L11.6 19.8 L13.9 18.7 L11.3 13.2 L16.8 13.1 Z"
        {...LINE}
        strokeWidth={1.6}
      />
    </>
  ),

  // Page — document rectangle with a folded top-right corner.
  "tool-page": (
    <>
      <path
        d="M5 3.5 L15 3.5 L19 7.5 L19 20.5 L5 20.5 Z"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M15 3.5 L15 7.5 L19 7.5" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Gap — two vertical bars with a double-headed arrow between them.
  "tool-gap": (
    <>
      <line x1={4.5} y1={4} x2={4.5} y2={20} {...LINE} strokeWidth={1.8} />
      <line x1={19.5} y1={4} x2={19.5} y2={20} {...LINE} strokeWidth={1.8} />
      <line x1={8} y1={12} x2={16} y2={12} {...LINE} strokeWidth={1.7} />
      <path d="M10.5 9.5 L8 12 L10.5 14.5" {...LINE} strokeWidth={1.7} />
      <path d="M13.5 9.5 L16 12 L13.5 14.5" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Content collector — an open tray scooping small squares above it.
  "tool-contentCollector": (
    <>
      <rect x={5} y={4.5} width={3.4} height={3.4} rx={0.5} />
      <rect x={10.3} y={4.5} width={3.4} height={3.4} rx={0.5} />
      <rect x={15.6} y={4.5} width={3.4} height={3.4} rx={0.5} />
      <path
        d="M4 12 L4 16 Q4 18.5 6.5 18.5 L17.5 18.5 Q20 18.5 20 16 L20 12"
        {...LINE}
        strokeWidth={1.8}
      />
    </>
  ),

  // Content placer — a tray with a downward arrow dropping a square in.
  "tool-contentPlacer": (
    <>
      <rect x={9.5} y={3.5} width={5} height={5} rx={0.5} />
      <line x1={12} y1={9} x2={12} y2={13.5} {...LINE} strokeWidth={1.7} />
      <path d="M9.7 11.3 L12 13.6 L14.3 11.3" {...LINE} strokeWidth={1.7} />
      <path
        d="M4 14 L4 16 Q4 18.5 6.5 18.5 L17.5 18.5 Q20 18.5 20 16 L20 14"
        {...LINE}
        strokeWidth={1.8}
      />
    </>
  ),

  // Type — a bold solid "T".
  "tool-type": (
    <>
      <path d="M4.5 4 L19.5 4 L19.5 7.2 L13.6 7.2 L13.6 20 L10.4 20 L10.4 7.2 L4.5 7.2 Z" />
    </>
  ),

  // Type on a path — a small "T" sitting on a wavy baseline.
  "tool-typePath": (
    <>
      <path d="M7.5 4 L16.5 4 L16.5 6.2 L13.1 6.2 L13.1 13.5 L10.9 13.5 L10.9 6.2 L7.5 6.2 Z" />
      <path
        d="M4 18 Q7 15 10 18 T16 18 T20 18"
        {...LINE}
        strokeWidth={1.7}
      />
    </>
  ),

  // Line — a single diagonal, bottom-left to top-right.
  "tool-line": (
    <>
      <line x1={5} y1={19} x2={19} y2={5} {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Pen — a bezier pen nib: triangular nib, center slit, small tip line.
  "tool-pen": (
    <>
      <path d="M9 3.5 L15 3.5 L13.2 13 L10.8 13 Z" {...LINE} strokeWidth={1.7} />
      <line x1={12} y1={5} x2={12} y2={13} {...LINE} strokeWidth={1.4} />
      <line x1={12} y1={13} x2={12} y2={20.5} {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Add anchor point — pen nib with a small "+" badge.
  "tool-addAnchor": (
    <>
      <path d="M7 3.5 L13 3.5 L11.2 12.5 L8.8 12.5 Z" {...LINE} strokeWidth={1.6} />
      <line x1={10} y1={5} x2={10} y2={12.5} {...LINE} strokeWidth={1.3} />
      <line x1={10} y1={12.5} x2={10} y2={19.5} {...LINE} strokeWidth={1.6} />
      <line x1={17} y1={5} x2={17} y2={11} {...LINE} strokeWidth={1.6} />
      <line x1={14} y1={8} x2={20} y2={8} {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Delete anchor point — pen nib with a small "−" badge.
  "tool-deleteAnchor": (
    <>
      <path d="M7 3.5 L13 3.5 L11.2 12.5 L8.8 12.5 Z" {...LINE} strokeWidth={1.6} />
      <line x1={10} y1={5} x2={10} y2={12.5} {...LINE} strokeWidth={1.3} />
      <line x1={10} y1={12.5} x2={10} y2={19.5} {...LINE} strokeWidth={1.6} />
      <line x1={14} y1={8} x2={20} y2={8} {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Convert anchor point — a corner with one bezier handle + control dot.
  "tool-convertAnchor": (
    <>
      <path d="M4 17 L11 6 L18 17" {...LINE} strokeWidth={1.7} />
      <line x1={11} y1={6} x2={19} y2={6} {...LINE} strokeWidth={1.5} />
      <circle cx={20} cy={6} r={1.7} />
      <circle cx={11} cy={6} r={1.7} />
    </>
  ),

  // Pencil — drawn at 45°.
  "tool-pencil": (
    <>
      <path
        d="M16.5 4.5 L19.5 7.5 L9 18 L5 19 L6 15 Z"
        {...LINE}
        strokeWidth={1.7}
      />
      <line x1={14} y1={7} x2={17} y2={10} {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Smooth — a pencil tip over a smooth wavy line.
  "tool-smooth": (
    <>
      <path d="M14 4 L20 10 L13 17 L9.5 18 L10.5 14.5 Z" {...LINE} strokeWidth={1.6} />
      <path d="M3.5 20 Q6 16.5 9 18 T14.5 18.5" {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Erase — a slanted rounded eraser block at 45°.
  "tool-erase": (
    <>
      <rect
        x={5}
        y={9}
        width={16}
        height={7}
        rx={1.6}
        transform="rotate(-45 12 12)"
        {...LINE}
        strokeWidth={1.7}
      />
      <line
        x1={11}
        y1={6.5}
        x2={16}
        y2={11.5}
        {...LINE}
        strokeWidth={1.6}
        transform="rotate(-45 12 12)"
      />
    </>
  ),

  // Rectangle frame — rectangle with an X through it (image placeholder).
  "tool-rectangleFrame": (
    <>
      <rect x={4} y={5.5} width={16} height={13} rx={0.6} {...LINE} strokeWidth={1.7} />
      <line x1={4} y1={5.5} x2={20} y2={18.5} {...LINE} strokeWidth={1.5} />
      <line x1={20} y1={5.5} x2={4} y2={18.5} {...LINE} strokeWidth={1.5} />
    </>
  ),

  // Ellipse frame — ellipse with an X through it.
  "tool-ellipseFrame": (
    <>
      <ellipse cx={12} cy={12} rx={8.5} ry={7.5} {...LINE} strokeWidth={1.7} />
      <line x1={6} y1={6.7} x2={18} y2={17.3} {...LINE} strokeWidth={1.5} />
      <line x1={18} y1={6.7} x2={6} y2={17.3} {...LINE} strokeWidth={1.5} />
    </>
  ),

  // Polygon frame — pentagon with an X through it.
  "tool-polygonFrame": (
    <>
      <path d="M12 3.5 L20 9.3 L16.9 18.7 L7.1 18.7 L4 9.3 Z" {...LINE} strokeWidth={1.7} />
      <line x1={7.1} y1={18.7} x2={16.9} y2={9.3} {...LINE} strokeWidth={1.5} />
      <line x1={16.9} y1={18.7} x2={7.1} y2={9.3} {...LINE} strokeWidth={1.5} />
    </>
  ),

  // Rectangle — plain outline.
  "tool-rectangle": (
    <>
      <rect x={4} y={5.5} width={16} height={13} rx={0.8} {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Ellipse — plain outline.
  "tool-ellipse": (
    <>
      <ellipse cx={12} cy={12} rx={8.5} ry={7.5} {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Polygon — plain pentagon outline.
  "tool-polygon": (
    <>
      <path d="M12 3.5 L20 9.3 L16.9 18.7 L7.1 18.7 L4 9.3 Z" {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Scissors — two looped handles and crossing blades.
  "tool-scissors": (
    <>
      <circle cx={6.5} cy={6} r={2.4} {...LINE} strokeWidth={1.6} />
      <circle cx={6.5} cy={18} r={2.4} {...LINE} strokeWidth={1.6} />
      <line x1={8.6} y1={7.2} x2={20} y2={18} {...LINE} strokeWidth={1.6} />
      <line x1={8.6} y1={16.8} x2={20} y2={6} {...LINE} strokeWidth={1.6} />
      <circle cx={12.4} cy={12} r={0.9} />
    </>
  ),

  // Free transform — bounding box with square handles at the 4 corners.
  "tool-freeTransform": (
    <>
      <rect x={6.5} y={6.5} width={11} height={11} {...LINE} strokeWidth={1.5} />
      <rect x={4} y={4} width={3} height={3} />
      <rect x={17} y={4} width={3} height={3} />
      <rect x={4} y={17} width={3} height={3} />
      <rect x={17} y={17} width={3} height={3} />
    </>
  ),

  // Rotate — a curved arrow forming most of a circle.
  "tool-rotate": (
    <>
      <path
        d="M19 9 A7.5 7.5 0 1 0 19.6 14.5"
        {...LINE}
        strokeWidth={1.8}
      />
      <path d="M14.6 8.2 L19.4 8.2 L19.4 13" {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Scale — a square with a diagonal double arrow from the BR corner.
  "tool-scale": (
    <>
      <rect x={4} y={4} width={10} height={10} {...LINE} strokeWidth={1.7} />
      <line x1={11} y1={11} x2={20} y2={20} {...LINE} strokeWidth={1.7} />
      <path d="M16 20 L20 20 L20 16" {...LINE} strokeWidth={1.7} />
      <path d="M15 11 L11 11 L11 15" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Shear — a slanted parallelogram (skew).
  "tool-shear": (
    <>
      <path d="M8 5 L20 5 L16 19 L4 19 Z" {...LINE} strokeWidth={1.8} />
    </>
  ),

  // Gradient swatch — rounded square approximated by vertical opacity strips.
  "tool-gradientSwatch": (
    <>
      <rect x={4} y={5} width={16} height={14} rx={2} fill="none" />
      <g>
        <rect x={4} y={5} width={3.4} height={14} opacity={1} />
        <rect x={7.4} y={5} width={3.4} height={14} opacity={0.75} />
        <rect x={10.8} y={5} width={3.4} height={14} opacity={0.5} />
        <rect x={14.2} y={5} width={3.4} height={14} opacity={0.3} />
        <rect x={17.6} y={5} width={2.4} height={14} opacity={0.15} />
      </g>
      <rect x={4} y={5} width={16} height={14} rx={2} {...LINE} strokeWidth={1.4} />
    </>
  ),

  // Gradient feather — soft radial fade via decreasing-opacity rings.
  "tool-gradientFeather": (
    <>
      <circle cx={12} cy={12} r={9} opacity={0.15} />
      <circle cx={12} cy={12} r={6.5} opacity={0.3} />
      <circle cx={12} cy={12} r={4} opacity={0.55} />
      <circle cx={12} cy={12} r={1.8} opacity={1} />
    </>
  ),

  // Note — a sticky note / small page with a folded corner and 2 lines.
  "tool-note": (
    <>
      <path
        d="M5 4 L19 4 L19 15 L15 20 L5 20 Z"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M19 15 L15 15 L15 20" {...LINE} strokeWidth={1.7} />
      <line x1={8} y1={9} x2={16} y2={9} {...LINE} strokeWidth={1.5} />
      <line x1={8} y1={12.5} x2={14} y2={12.5} {...LINE} strokeWidth={1.5} />
    </>
  ),

  // Eyedropper — a pipette at 45° with a bulb at the top.
  "tool-eyedropper": (
    <>
      <line x1={4} y1={20} x2={13} y2={11} {...LINE} strokeWidth={1.8} />
      <path
        d="M12.5 10.5 L15.5 7.5 L17.5 9.5 L14.5 12.5 Z"
        {...LINE}
        strokeWidth={1.6}
      />
      <rect
        x={15.4}
        y={4.4}
        width={5}
        height={3}
        rx={1.5}
        transform="rotate(45 17.9 5.9)"
      />
    </>
  ),

  // Measure — a ruler at 45° with tick marks.
  "tool-measure": (
    <>
      <rect
        x={2.5}
        y={9.5}
        width={19}
        height={5}
        rx={0.6}
        transform="rotate(-45 12 12)"
        {...LINE}
        strokeWidth={1.7}
      />
      <g transform="rotate(-45 12 12)">
        <line x1={6.5} y1={9.5} x2={6.5} y2={12} {...LINE} strokeWidth={1.4} />
        <line x1={10} y1={9.5} x2={10} y2={13} {...LINE} strokeWidth={1.4} />
        <line x1={13.5} y1={9.5} x2={13.5} y2={12} {...LINE} strokeWidth={1.4} />
        <line x1={17} y1={9.5} x2={17} y2={13} {...LINE} strokeWidth={1.4} />
      </g>
    </>
  ),

  // Hand — open palm silhouette: four fingers + a thumb.
  "tool-hand": (
    <>
      <path
        d="M7 12 L7 7.5 Q7 6 8.4 6 Q9.8 6 9.8 7.5 L9.8 11
           L9.8 5.5 Q9.8 4 11.2 4 Q12.6 4 12.6 5.5 L12.6 11
           L12.6 6 Q12.6 4.5 14 4.5 Q15.4 4.5 15.4 6 L15.4 11.5
           L15.4 8.5 Q15.4 7 16.8 7 Q18.2 7 18.2 8.5 L18.2 14.5
           Q18.2 20 13 20 Q9 20 7.2 16.5 L5 12.5
           Q4.4 11.2 5.6 10.6 Q6.5 10.2 7 11.3 Z"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),

  // Zoom — magnifying glass (lens + diagonal handle) with a "+" inside.
  "tool-zoom": (
    <>
      <circle cx={10.5} cy={10.5} r={6.5} {...LINE} strokeWidth={1.8} />
      <line x1={15.2} y1={15.2} x2={20.5} y2={20.5} {...LINE} strokeWidth={1.9} />
      <line x1={10.5} y1={7.5} x2={10.5} y2={13.5} {...LINE} strokeWidth={1.5} />
      <line x1={7.5} y1={10.5} x2={13.5} y2={10.5} {...LINE} strokeWidth={1.5} />
    </>
  ),

  // Curvature — a smooth arc with three anchor dots (drop points, the
  // curve fits itself). paged.draw pro tool.
  "tool-curvature": (
    <>
      <path d="M4 18 Q4 7 12 7 Q20 7 20 18" {...LINE} strokeWidth={1.7} />
      <circle cx={4} cy={18} r={1.6} />
      <circle cx={12} cy={7} r={1.6} />
      <circle cx={20} cy={18} r={1.6} />
    </>
  ),

  // Gradient annotator — a rounded square with a diagonal drag line
  // between two endpoint handles (the gradient direction). paged.draw.
  "tool-gradient": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.6} {...LINE} strokeWidth={1.6} />
      <line x1={7.5} y1={16.5} x2={16.5} y2={7.5} {...LINE} strokeWidth={1.6} />
      <circle cx={7.5} cy={16.5} r={1.5} />
      <circle cx={16.5} cy={7.5} r={1.5} />
    </>
  ),

  // Shape builder — two overlapping shapes being united. paged.draw.
  "tool-shapeBuilder": (
    <>
      <rect x={4} y={8} width={11} height={11} rx={1.4} {...LINE} strokeWidth={1.6} />
      <circle cx={15.5} cy={13.5} r={5.5} {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Crop — two offset right-angle brackets (the classic crop marks).
  // paged.image transform tool.
  "tool-crop": (
    <>
      <path d="M8 3 L8 16 L21 16" {...LINE} strokeWidth={1.7} />
      <path d="M3 8 L16 8 L16 21" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Corner radius — a square corner whose elbow is rounded away, with
  // the radius shown as a short tick to the arc's centre. paged.draw.
  "tool-cornerRadius": (
    <>
      <path d="M4 20 L4 10 A6 6 0 0 1 10 4 L20 4" {...LINE} strokeWidth={1.7} />
      <path d="M10 10 L13.5 6.5" {...LINE} strokeWidth={1.4} />
      <circle cx="10" cy="10" r="1.1" />
    </>
  ),

  // Paintbrush — angled handle into a ferrule, splaying to a soft tip.
  // paged.draw brush family.
  "tool-paintbrush": (
    <>
      <path d="M20 4 L11.5 12.5" {...LINE} strokeWidth={1.8} />
      <path
        d="M12.6 11.4 L8.5 15.5 L10.7 17.7 L14.8 13.6 Z"
        {...LINE}
        strokeWidth={1.6}
      />
      <path
        d="M8.5 15.5 C6.6 17.4 6.9 19.4 4 20 C4.6 17.1 6.6 17.4 8.5 15.5"
        {...LINE}
        strokeWidth={1.6}
      />
    </>
  ),

  // Blob brush — the same nib laying down a filled blob that merges
  // with what it touches. paged.draw.
  "tool-blobBrush": (
    <>
      <path d="M19.5 4.5 L13 11" {...LINE} strokeWidth={1.8} />
      <path
        d="M13.9 10.1 L10.4 13.6 L12.2 15.4 L15.7 11.9 Z"
        {...LINE}
        strokeWidth={1.6}
      />
      <path d="M9.6 14.6 C6.2 15.4 4 17 4 19 C4 20.7 5.6 21 7.4 20.3 C9.7 19.4 11.4 17.6 11.4 16.4 Z" />
    </>
  ),

  // Eraser — a tilted block with its wear edge marked. paged.draw.
  "tool-eraserBrush": (
    <>
      <path
        d="M9.5 4.8 L19.2 14.5 L14.5 19.2 L4.8 9.5 Z"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M7.2 12.1 L11.9 16.8" {...LINE} strokeWidth={1.4} />
      <path d="M4 21 L20 21" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Width — a stroke whose two sides bow apart and back, the variable
  // width profile. paged.draw.
  "tool-width": (
    <>
      <path d="M3 12 C7 12 8 5.5 12 5.5 C16 5.5 17 12 21 12" {...LINE} strokeWidth={1.7} />
      <path d="M3 12 C7 12 8 18.5 12 18.5 C16 18.5 17 12 21 12" {...LINE} strokeWidth={1.7} />
      <path d="M12 5.5 L12 18.5" {...LINE} strokeWidth={1.3} />
    </>
  ),

  // Lasso — a drawn loop closing onto its own tail. paged.draw's
  // element-region select.
  "tool-lassoSelect": (
    <>
      <path
        d="M12 4.2 C16.9 4.2 20.5 6.9 20.5 10.3 C20.5 13.7 16.9 16.4 12 16.4 C7.1 16.4 3.5 13.7 3.5 10.3 C3.5 7.4 6.1 5 9.7 4.4"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M7.6 15.4 C7 17.6 7.6 19.4 9.2 20.3" {...LINE} strokeWidth={1.6} />
      <circle cx="9.9" cy="20.6" r="1.4" {...LINE} strokeWidth={1.4} />
    </>
  ),

  // Rectangular marquee — the dashed selection rectangle. paged.image.
  "tool-marquee-rect": (
    <>
      <path
        d="M4 4 L9 4 M13 4 L20 4 L20 8 M20 12 L20 20 L15 20 M11 20 L4 20 L4 16 M4 12 L4 4"
        {...LINE}
        strokeWidth={1.7}
      />
    </>
  ),

  // Elliptical marquee — the dashed selection ellipse. paged.image.
  "tool-marquee-ellipse": (
    <>
      <path
        d="M12 3.6 C16.6 3.6 20.4 7.4 20.4 12 C20.4 14.1 19.6 16.1 18.3 17.6"
        {...LINE}
        strokeWidth={1.7}
      />
      <path
        d="M15.6 19.6 C14.5 20.1 13.3 20.4 12 20.4 C7.4 20.4 3.6 16.6 3.6 12"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M4.5 8.2 C5.6 5.6 8.1 3.9 11 3.7" {...LINE} strokeWidth={1.7} />
    </>
  ),

  // Freehand lasso — an open drawn loop. paged.image selection.
  "tool-lasso": (
    <>
      <path
        d="M12 4 C17 4 20.6 7 20.6 10.6 C20.6 14.2 17 17.1 12 17.1 C7 17.1 3.4 14.2 3.4 10.6 C3.4 7.6 5.9 5 9.6 4.3"
        {...LINE}
        strokeWidth={1.7}
      />
      <path d="M8.4 16.2 C7.6 18.4 8.4 20.2 10.4 20.8" {...LINE} strokeWidth={1.6} />
    </>
  ),

  // Magic wand — a wand on the diagonal with a spark at its tip.
  // paged.image colour-region select.
  "tool-magic-wand": (
    <>
      <path d="M4 20 L14 10" {...LINE} strokeWidth={1.8} />
      <path d="M12.4 8.4 L15.6 11.6" {...LINE} strokeWidth={1.6} />
      <path
        d="M17.5 3.5 L18.4 6.1 L21 7 L18.4 7.9 L17.5 10.5 L16.6 7.9 L14 7 L16.6 6.1 Z"
        {...LINE}
        strokeWidth={1.4}
      />
    </>
  ),
};
