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

// What InDesign SHOULD see, read off the package XML — the expectation
// the InDesign probe is compared against. Counts, never values: the
// artifact this feeds carries shapes and verdicts.

import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";
import type { ItemCounts } from "./probe";

export interface IdmlExpectation {
  pages: number;
  spreads: number;
  master_spreads: number;
  stories: number;
  /** Stories with any `<Content>` text. */
  non_empty_stories: number;
  /** `<Br/>` marks — paragraphs minus one per story that has them. */
  br_total: number;
  items: ItemCounts;
  master_items: ItemCounts;
  sections: number;
  guides: number;
  hyperlinks: number;
  conditions: number;
  /** Every `<Table>` in the stories. */
  tables: number;
  /** Tables in stories some text frame references — the ones a reader
   *  can see. A table in an orphaned story is nobody's loss. */
  tables_in_placed_stories: number;
  tint_swatches: Array<{ name: string; base: string; tint: number }>;
  /** The `AppliedFont="…"` ATTRIBUTE spelling, which InDesign ignores. */
  applied_font_attribute_form: number;
  root_paragraph_style_groups: number;
  /** `<Link>` elements on the spreads — the placed images InDesign
   *  should resolve, given the `Links/` folder beside the `.idml`. */
  links: number;
  /** Entries that are not part of an IDML package (container parts). */
  foreign_entries: string[];
}

const IDML_PREFIXES = ["META-INF/", "Resources/", "XML/", "MasterSpreads/", "Spreads/", "Stories/"];

function count(re: RegExp, xml: string): number {
  return (xml.match(re) ?? []).length;
}

function itemCounts(xml: string): ItemCounts {
  const tag = (name: string): number => count(new RegExp(`<${name}(?=[ />])`, "g"), xml);
  return {
    textFrame: tag("TextFrame"),
    rectangle: tag("Rectangle"),
    oval: tag("Oval"),
    polygon: tag("Polygon"),
    graphicLine: tag("GraphicLine"),
    group: tag("Group"),
    image: count(/<(?:Image|PDF|EPS|ImportedPage|PICT|WMF)(?=[ />])/g, xml),
    other: 0,
  };
}

function add(a: ItemCounts, b: ItemCounts): ItemCounts {
  const out = { ...a };
  for (const k of Object.keys(out) as Array<keyof ItemCounts>) out[k] += b[k];
  return out;
}

const EMPTY: ItemCounts = {
  textFrame: 0, rectangle: 0, oval: 0, polygon: 0, graphicLine: 0, group: 0, image: 0, other: 0,
};

export function idmlExpectation(bytes: Buffer): IdmlExpectation {
  const names = zipEntryNames(bytes);
  const text = (n: string): string => readZipText(bytes, n) ?? "";
  const spreads = names.filter((n) => n.startsWith("Spreads/"));
  const masters = names.filter((n) => n.startsWith("MasterSpreads/"));
  const stories = names.filter((n) => n.startsWith("Stories/"));
  const designmap = text("designmap.xml");
  const styles = text("Resources/Styles.xml");
  const graphic = text("Resources/Graphic.xml");

  let items = EMPTY;
  let pages = 0;
  let guides = 0;
  let links = 0;
  const placedStories = new Set<string>();
  for (const s of spreads) {
    const xml = text(s);
    items = add(items, itemCounts(xml));
    pages += count(/<Page(?=[ />])/g, xml);
    guides += count(/<Guide(?=[ />])/g, xml);
    links += count(/<Link(?=[ />])/g, xml);
    for (const m of xml.matchAll(/<TextFrame\b[^>]*\bParentStory="([^"]+)"/g)) {
      placedStories.add(m[1]);
    }
  }
  let masterItems = EMPTY;
  for (const m of masters) {
    const xml = text(m);
    masterItems = add(masterItems, itemCounts(xml));
    guides += count(/<Guide(?=[ />])/g, xml);
  }

  let brTotal = 0;
  let nonEmpty = 0;
  let tables = 0;
  let placedTables = 0;
  let attrFonts = count(/\bAppliedFont="/g, styles);
  for (const s of stories) {
    const xml = text(s);
    brTotal += count(/<Br\s*\/>/g, xml);
    if (/<Content>[^<]/.test(xml)) nonEmpty += 1;
    const t = count(/<Table(?=[ />])/g, xml);
    tables += t;
    attrFonts += count(/\bAppliedFont="/g, xml);
    const self = /<Story\b[^>]*\bSelf="([^"]+)"/.exec(xml)?.[1];
    if (t > 0 && self && placedStories.has(self)) placedTables += t;
  }

  const colorNames = new Map<string, string>();
  for (const m of graphic.matchAll(/<Color\b[^>]*\bSelf="([^"]+)"[^>]*\bName="([^"]+)"/g)) {
    colorNames.set(m[1], m[2]);
  }
  const tints: IdmlExpectation["tint_swatches"] = [];
  for (const m of graphic.matchAll(/<Tint\b([^>]*)>/g)) {
    const a = m[1];
    const name = /\bName="([^"]+)"/.exec(a)?.[1];
    const base = /\bBaseColor="([^"]+)"/.exec(a)?.[1];
    const tint = Number(/\bTintValue="([^"]+)"/.exec(a)?.[1]);
    if (name && base) tints.push({ name, base: colorNames.get(base) ?? base, tint });
  }

  // Conditions live in designmap.xml (Adobe) or Styles.xml (our older
  // spelling); count both, never twice.
  const conditions =
    count(/<Condition(?=[ />])/g, designmap) + count(/<Condition(?=[ />])/g, styles);

  return {
    pages,
    spreads: spreads.length,
    master_spreads: masters.length,
    stories: stories.length,
    non_empty_stories: nonEmpty,
    br_total: brTotal,
    items,
    master_items: masterItems,
    sections: count(/<Section(?=[ />])/g, designmap),
    guides,
    hyperlinks: count(/<Hyperlink(?=[ />])/g, designmap),
    conditions,
    tables,
    tables_in_placed_stories: placedTables,
    tint_swatches: tints,
    applied_font_attribute_form: attrFonts,
    root_paragraph_style_groups: count(/<RootParagraphStyleGroup>/g, styles),
    links,
    foreign_entries: names.filter(
      (n) => !(n === "mimetype" || n === "designmap.xml" || IDML_PREFIXES.some((p) => n.startsWith(p))),
    ),
  };
}
