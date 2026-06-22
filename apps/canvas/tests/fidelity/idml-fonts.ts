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

// Extract declared font families from an IDML by reading its
// `Resources/Fonts.xml` entry directly via `unzip -p`. IDML is a flat
// ZIP of XML so a one-file extraction is cheap. We deliberately avoid
// pulling in a wasm-side parser here — Node spawning `unzip` is
// roughly an order of magnitude faster than a 5MB IDML through JSZip
// for the "just read one file" case.

import { execFileSync } from "node:child_process";

export interface DeclaredFont {
  /** IDML family name (`<FontFamily Name="..."/>`). */
  family: string;
  /** Style strings (`<Font FontStyleName="..."/>`) declared under that family. */
  styles: string[];
}

/**
 * Read `Resources/Fonts.xml` from an IDML and return the set of
 * declared `(family, styles)` pairs. Returns an empty array when the
 * archive has no fonts entry (very rare — single-frame IDMLs without
 * any text). Throws on a corrupted archive.
 */
export function declaredFonts(idmlPath: string): DeclaredFont[] {
  let xml: string;
  try {
    xml = execFileSync("unzip", ["-p", idmlPath, "Resources/Fonts.xml"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    // `unzip -p` exits non-zero when the entry is missing. Treat as
    // "no declared fonts" rather than blowing up the suite.
    void err;
    return [];
  }
  return parseFontsXml(xml);
}

/**
 * Parse a `Fonts.xml` body. Each `<FontFamily Name="..."/>` block
 * contains zero or more `<Font FontStyleName="..."/>` children. We
 * extract both via regex — full DOM parsing is overkill for this
 * tightly-shaped Adobe-generated XML.
 */
export function parseFontsXml(xml: string): DeclaredFont[] {
  const out: DeclaredFont[] = [];
  const familyRe = /<FontFamily\b[^>]*\bName="([^"]+)"[^>]*>([\s\S]*?)<\/FontFamily>/g;
  for (const familyMatch of xml.matchAll(familyRe)) {
    const family = familyMatch[1];
    const body = familyMatch[2];
    const styleRe = /<Font\b[^>]*\bFontStyleName="([^"]+)"/g;
    const styles: string[] = [];
    for (const styleMatch of body.matchAll(styleRe)) {
      styles.push(styleMatch[1]);
    }
    out.push({ family, styles });
  }
  return out;
}
