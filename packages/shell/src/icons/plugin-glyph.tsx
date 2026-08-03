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

// K-8 — the plugin-supplied SVG glyph, SANITIZED. A bundle may ship the
// inner markup of a 24×24 glyph on `PanelContribution.iconSvg` (the icon
// registry stays a closed compile-time map — this is the door for icons
// the host doesn't own). The sanitizer is a SCANNER, not a parser (the
// web-model stance): script/foreignObject subtrees are excised, event
// attributes and javascript:/data:text URLs dropped. Anything left is
// inert vector markup rendered under currentColor.

const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\s*>|<script\b[^>]*\/?>/gi;
const FOREIGN_BLOCK =
  /<foreignObject\b[\s\S]*?<\/foreignObject\s*>|<foreignObject\b[^>]*\/?>/gi;
const EVENT_ATTR = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const BAD_URL_ATTR =
  /\s(?:href|xlink:href)\s*=\s*(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*')/gi;

/** Strip active content from a plugin glyph's SVG markup. Total on any
 *  input; the result is safe to inline under the shell's CSP. */
export function sanitizeSvgGlyph(svg: string): string {
  if (typeof svg !== "string") return "";
  return svg
    .replace(SCRIPT_BLOCK, "")
    .replace(FOREIGN_BLOCK, "")
    .replace(EVENT_ATTR, "")
    .replace(BAD_URL_ATTR, "");
}

/** Render a sanitized plugin glyph in the host icon box (currentColor,
 *  same sizing contract as `Icon`). */
export function PluginGlyph({ svg, size = 17 }: { svg: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      // Sanitized above — script/foreignObject/event/URL vectors removed.
      dangerouslySetInnerHTML={{ __html: sanitizeSvgGlyph(svg) }}
    />
  );
}
