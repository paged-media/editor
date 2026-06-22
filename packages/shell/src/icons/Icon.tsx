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

import type { CSSProperties, ReactNode } from "react";

import { TOOL_GLYPHS } from "./tool-glyphs";
import { PANEL_GLYPHS } from "./panel-glyphs";
import { UI_GLYPHS } from "./ui-glyphs";

// Concept 1 — the shared icon resolver. A registry contribution's
// `icon` is a NAME resolved here to an original SVG glyph (faithful to
// the InDesign silhouette, not traced from Adobe artwork). One
// resolver serves both the tool rail and the dockview panel tabs.
//
// All glyphs are authored on a 24×24 grid. The <svg> sets
// `fill="currentColor"`, so solid silhouettes inherit the colour;
// line-style glyphs set `fill="none" stroke="currentColor"` on their
// own paths. Size defaults to 16; the rail renders larger.

const GLYPHS: Record<string, ReactNode> = {
  ...TOOL_GLYPHS,
  ...PANEL_GLYPHS,
  ...UI_GLYPHS,
};

export interface IconProps {
  /** Glyph name, e.g. `"tool-pen"` or `"panel-layers"`. */
  name: string;
  /** Square px size. Default 16. */
  size?: number;
  /** Accessible label; when omitted the icon is decorative. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/** True if a glyph is registered for `name` (callers fall back to a
 *  text label otherwise — e.g. the rail's shortcut letter). */
export function hasIcon(name: string): boolean {
  return name in GLYPHS;
}

export function Icon({ name, size = 16, title, className, style }: IconProps) {
  const glyph = GLYPHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {glyph ?? <FallbackGlyph />}
    </svg>
  );
}

/** Neutral placeholder for an unregistered name — a dashed square so a
 *  missing glyph is visible but unobtrusive. */
function FallbackGlyph() {
  return (
    <rect
      x={4}
      y={4}
      width={16}
      height={16}
      rx={2}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeDasharray="2 2"
      opacity={0.5}
    />
  );
}
