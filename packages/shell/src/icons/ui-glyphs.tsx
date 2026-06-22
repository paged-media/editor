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

// Design system — the chrome UI glyph registry (search, chevrons,
// theme toggle, status, alignment, type metrics, cockpit glyphs).
// Ported from the design system's clean-room set
// (brand/editor/ui_kits/editor/icons.jsx) — authored on a 24×24
// grid, line style, currentColor, round caps/joins. Same conventions
// as tool-glyphs.tsx / panel-glyphs.tsx.

// Shared stroke defaults for line-style glyphs.
const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const UI_GLYPHS: Record<string, ReactNode> = {
  "ui-search": (
    <>
      <circle cx={11} cy={11} r={6.5} {...LINE} />
      <line x1={16} y1={16} x2={20.5} y2={20.5} {...LINE} strokeWidth={1.8} />
    </>
  ),
  "ui-bell": (
    <>
      <path d="M6 16 L6 11 a6 6 0 0 1 12 0 L18 16 L20 18 L4 18 Z" {...LINE} />
      <path d="M10 18 a2 2 0 0 0 4 0" {...LINE} />
    </>
  ),
  "ui-comment": (
    <path d="M4 5 L20 5 L20 16 L11 16 L7 20 L7 16 L4 16 Z" {...LINE} />
  ),
  "ui-share": (
    <>
      <circle cx={6} cy={12} r={2.5} {...LINE} />
      <circle cx={17} cy={6} r={2.5} {...LINE} />
      <circle cx={17} cy={18} r={2.5} {...LINE} />
      <path d="M8.2 10.8 L14.8 7.2 M8.2 13.2 L14.8 16.8" {...LINE} />
    </>
  ),
  "ui-chevron-down": <path d="M6 9 L12 15 L18 9" {...LINE} strokeWidth={1.8} />,
  "ui-chevron-right": (
    <path d="M9 6 L15 12 L9 18" {...LINE} strokeWidth={1.8} />
  ),
  "ui-chevron-left": (
    <path d="M15 6 L9 12 L15 18" {...LINE} strokeWidth={1.8} />
  ),
  "ui-dots": (
    <>
      <circle cx={5} cy={12} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={12} cy={12} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={19} cy={12} r={1.6} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-x": <path d="M6 6 L18 18 M18 6 L6 18" {...LINE} strokeWidth={1.8} />,
  "ui-check": <path d="M5 12.5 L10 17.5 L19 6.5" {...LINE} strokeWidth={1.9} />,
  "ui-sparkle": (
    <path
      d="M12 3 L13.8 9.2 L20 11 L13.8 12.8 L12 19 L10.2 12.8 L4 11 L10.2 9.2 Z"
      {...LINE}
    />
  ),
  "ui-fit-width": (
    <>
      <rect x={3} y={6} width={18} height={12} rx={1.5} {...LINE} />
      <path
        d="M7 12 L17 12 M7 12 L9.5 9.5 M7 12 L9.5 14.5 M17 12 L14.5 9.5 M17 12 L14.5 14.5"
        {...LINE}
        strokeWidth={1.4}
      />
    </>
  ),
  "ui-displays": (
    <>
      <rect x={3} y={4} width={18} height={12} rx={1.5} {...LINE} />
      <path d="M9 20 L15 20 M12 16 L12 20" {...LINE} />
    </>
  ),
  // layout/view switchers in the options bar
  "ui-grid": (
    <>
      <rect x={4} y={4} width={7} height={7} rx={1} {...LINE} />
      <rect x={13} y={4} width={7} height={7} rx={1} {...LINE} />
      <rect x={4} y={13} width={7} height={7} rx={1} {...LINE} />
      <rect x={13} y={13} width={7} height={7} rx={1} {...LINE} />
    </>
  ),
  "ui-cols-2": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.5} {...LINE} />
      <path d="M12 4 L12 20" {...LINE} />
    </>
  ),
  "ui-cols-3": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.5} {...LINE} />
      <path d="M9.3 4 L9.3 20 M14.6 4 L14.6 20" {...LINE} />
    </>
  ),
  "ui-rows": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.5} {...LINE} />
      <path d="M4 12 L20 12" {...LINE} />
    </>
  ),
  "ui-expand": (
    <path
      d="M14 4 L20 4 L20 10 M20 4 L13 11 M10 20 L4 20 L4 14 M4 20 L11 13"
      {...LINE}
    />
  ),
  "ui-warn": (
    <>
      <path d="M12 4 L21 19 L3 19 Z" {...LINE} />
      <path d="M12 10 L12 14" {...LINE} />
      <circle cx={12} cy={16.5} r={0.7} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-flow": (
    <>
      <rect x={4} y={5} width={6} height={6} rx={1} {...LINE} />
      <rect x={14} y={13} width={6} height={6} rx={1} {...LINE} />
      <path d="M10 8 L14 8 a3 3 0 0 1 3 3 L17 13" {...LINE} />
    </>
  ),
  "ui-plus": <path d="M12 5 L12 19 M5 12 L19 12" {...LINE} strokeWidth={1.8} />,
  // text alignment cluster (Properties)
  "ui-align-left": (
    <>
      <path
        d="M4 6 L20 6 M4 10 L14 10 M4 14 L18 14 M4 18 L12 18"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),
  "ui-align-center": (
    <>
      <path
        d="M4 6 L20 6 M7 10 L17 10 M5 14 L19 14 M8 18 L16 18"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),
  "ui-align-right": (
    <>
      <path
        d="M4 6 L20 6 M10 10 L20 10 M6 14 L20 14 M12 18 L20 18"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),
  "ui-align-justify": (
    <>
      <path
        d="M4 6 L20 6 M4 10 L20 10 M4 14 L20 14 M4 18 L16 18"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),
  // type metrics chips
  "ui-size": (
    <>
      <path
        d="M5 18 L9 6 L13 18 M6.4 14 L11.6 14"
        {...LINE}
        strokeWidth={1.5}
      />
      <path d="M15 9 L19 9 M17 9 L17 18" {...LINE} strokeWidth={1.5} />
    </>
  ),
  "ui-leading": (
    <>
      <path d="M4 5 L20 5 M4 19 L20 19" {...LINE} strokeWidth={1.5} />
      <path
        d="M12 8 L12 16 M9.5 10.5 L12 8 L14.5 10.5 M9.5 13.5 L12 16 L14.5 13.5"
        {...LINE}
        strokeWidth={1.5}
      />
    </>
  ),
  "ui-tracking": (
    <>
      <path d="M9 17 L12 7 L15 17 M10 14 L14 14" {...LINE} strokeWidth={1.4} />
      <path d="M4 7 L4 17 M20 7 L20 17" {...LINE} strokeWidth={1.5} />
    </>
  ),
  "ui-kerning": (
    <>
      <path d="M7 17 L7 7 M7 7 L11 12 L7 12" {...LINE} strokeWidth={1.5} />
      <path d="M17 17 L17 7 M17 12 L13 12 L17 17" {...LINE} strokeWidth={1.5} />
      <path d="M12 5 L12 19" {...LINE} strokeWidth={1.2} opacity={0.4} />
    </>
  ),
  // cockpit glyphs
  "ui-database": (
    <>
      <ellipse cx={12} cy={6} rx={7} ry={2.6} {...LINE} />
      <path d="M5 6 L5 18 a7 2.6 0 0 0 14 0 L19 6" {...LINE} />
      <path d="M5 12 a7 2.6 0 0 0 14 0" {...LINE} />
    </>
  ),
  "ui-export": (
    <>
      <path
        d="M12 3 L12 14 M8.5 6.5 L12 3 L15.5 6.5"
        {...LINE}
        strokeWidth={1.8}
      />
      <path
        d="M5 13 L5 19 a1 1 0 0 0 1 1 L18 20 a1 1 0 0 0 1 -1 L19 13"
        {...LINE}
      />
    </>
  ),
  "ui-component": (
    <>
      <rect x={4} y={4} width={7} height={7} rx={1.4} {...LINE} />
      <rect x={13} y={4} width={7} height={7} rx={1.4} {...LINE} />
      <rect x={4} y={13} width={7} height={7} rx={1.4} {...LINE} />
      <path d="M13 16.5 L20 16.5 M16.5 13 L16.5 20" {...LINE} />
    </>
  ),
  "ui-eye": (
    <>
      <path d="M3 12 C6 6 18 6 21 12 C18 18 6 18 3 12 Z" {...LINE} />
      <circle cx={12} cy={12} r={2.6} {...LINE} />
    </>
  ),
  "ui-eye-off": (
    <>
      <path d="M5 5 L19 19" {...LINE} />
      <path d="M9.5 9.6 a2.6 2.6 0 0 0 3.6 3.6" {...LINE} />
      <path
        d="M6.6 7.2 C4.9 8.3 3.7 10 3 12 C6 18 18 18 21 12 C20.4 10.8 19.6 9.7 18.6 8.8"
        {...LINE}
      />
    </>
  ),
  "ui-lock": (
    <>
      <rect x={5} y={11} width={14} height={9} rx={2} {...LINE} />
      <path d="M8 11 L8 8 a4 4 0 0 1 8 0 L16 11" {...LINE} />
    </>
  ),
  "ui-pin": (
    <>
      <path d="M5 5 L19 5 L19 15 L11 15 L7 19 L7 15 L5 15 Z" {...LINE} />
      <circle cx={12} cy={10} r={1.1} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-moon": (
    <path d="M19 13.5 A8 8 0 1 1 10.5 5 A6.2 6.2 0 0 0 19 13.5 Z" {...LINE} />
  ),
  "ui-sun": (
    <>
      <circle cx={12} cy={12} r={4} {...LINE} />
      <path
        d="M12 3 L12 5 M12 19 L12 21 M3 12 L5 12 M19 12 L21 12 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M18.4 5.6 L17 7 M7 17 L5.6 18.4"
        {...LINE}
        strokeWidth={1.4}
      />
    </>
  ),
  "ui-bolt": <path d="M13 3 L5 13 L11 13 L10 21 L19 10 L13 10 Z" {...LINE} />,
  "ui-translate": (
    <>
      <path
        d="M4 6 L12 6 M8 4 L8 6 C8 11 6 14 3 16 M5 11 C7 14 10 15 12 15"
        {...LINE}
        strokeWidth={1.4}
      />
      <path
        d="M13 20 L16.5 11 L20 20 M14.2 17 L18.8 17"
        {...LINE}
        strokeWidth={1.4}
      />
    </>
  ),
  "ui-accessibility": (
    <>
      <circle cx={12} cy={5.5} r={1.8} {...LINE} />
      <path d="M4 9 L20 9 M12 9 L12 15 M12 15 L8 21 M12 15 L16 21" {...LINE} />
    </>
  ),
  "ui-filter": <path d="M4 5 L20 5 L14 12 L14 19 L10 21 L10 12 Z" {...LINE} />,
  "ui-history": (
    <>
      <path d="M4 12 a8 8 0 1 0 2.5 -5.8 L4 8 M4 4 L4 8 L8 8" {...LINE} />
      <path d="M12 8 L12 12 L15 14" {...LINE} strokeWidth={1.4} />
    </>
  ),
  "ui-return": (
    <path
      d="M20 5 L20 11 L7 11 M7 11 L11 7 M7 11 L11 15"
      {...LINE}
      strokeWidth={1.6}
    />
  ),
  "ui-target": (
    <>
      <circle cx={12} cy={12} r={8} {...LINE} />
      <circle cx={12} cy={12} r={3.4} {...LINE} />
      <circle cx={12} cy={12} r={0.6} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-wand": (
    <>
      <path d="M5 19 L15 9 M13 7 L17 11" {...LINE} strokeWidth={1.7} />
      <path
        d="M17 3 L17.7 5.3 L20 6 L17.7 6.7 L17 9 L16.3 6.7 L14 6 L16.3 5.3 Z"
        {...LINE}
        strokeWidth={1.2}
      />
    </>
  ),
  "ui-doc": (
    <>
      <path d="M6 3.5 L15 3.5 L18.5 7 L18.5 20.5 L6 20.5 Z" {...LINE} />
      <path d="M15 3.5 L15 7 L18.5 7" {...LINE} />
      <path d="M9 12 L15 12 M9 15.5 L15 15.5" {...LINE} strokeWidth={1.4} />
    </>
  ),
  "ui-web": (
    <>
      <rect x={3} y={5} width={18} height={14} rx={1.5} {...LINE} />
      <path d="M3 9 L21 9" {...LINE} />
      <circle cx={6} cy={7} r={0.6} fill="currentColor" stroke="none" />
      <circle cx={8.3} cy={7} r={0.6} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-social": (
    <>
      <rect x={4} y={4} width={11} height={11} rx={1.6} {...LINE} />
      <path d="M9 9 L20 9 L20 20 L9 20 Z" {...LINE} />
    </>
  ),
  "ui-page": (
    <>
      <path d="M6 3.5 L15 3.5 L18.5 7 L18.5 20.5 L6 20.5 Z" {...LINE} />
      <path d="M15 3.5 L15 7 L18.5 7" {...LINE} />
    </>
  ),
  "ui-grid-cols": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.5} {...LINE} />
      <path
        d="M9.3 4 L9.3 20 M14.6 4 L14.6 20"
        {...LINE}
        strokeWidth={1.3}
        opacity={0.6}
      />
    </>
  ),
  "ui-minus": <path d="M5 12 L19 12" {...LINE} strokeWidth={1.8} />,
  // Authored to the kit rules (not in the source set): printer for
  // the Layers panel's printable toggle; unlock as the open-shackle
  // counterpart of ui-lock.
  "ui-print": (
    <>
      <path d="M7 8 L7 3.5 L17 3.5 L17 8" {...LINE} />
      <rect x={4} y={8} width={16} height={8} rx={1.5} {...LINE} />
      <path d="M7 13 L7 20.5 L17 20.5 L17 13" {...LINE} />
      <circle cx={17} cy={10.5} r={0.7} fill="currentColor" stroke="none" />
    </>
  ),
  "ui-unlock": (
    <>
      <rect x={5} y={11} width={14} height={9} rx={2} {...LINE} />
      <path d="M8 11 L8 8 a4 4 0 0 1 7.6 -1.6" {...LINE} />
    </>
  ),
  "ui-presentation": (
    <>
      <rect x={3} y={4} width={18} height={12} rx={1.5} {...LINE} />
      <path d="M12 16 L12 20 M8 20 L16 20" {...LINE} />
    </>
  ),
  // Solid dot — the dropdown-menu radio indicator (replaces lucide's
  // Circle so the shadcn primitives stay on the in-house registry).
  "ui-dot": <circle cx={12} cy={12} r={4} fill="currentColor" stroke="none" />,

  // Swatch (fill) — a filled rounded square with a thin frame; the
  // paged.draw Fill schema panel's section glyph.
  "ui-swatch-fill": (
    <>
      <rect x={4} y={4} width={16} height={16} rx={2} />
      <rect
        x={4}
        y={4}
        width={16}
        height={16}
        rx={2}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        opacity={0.35}
      />
    </>
  ),
};
