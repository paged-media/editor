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

// Reads the LIVE document's own IDML export to recover facts the wire's
// read doors do not surface:
//
//   · Master spread NAMES. The `masterPages` collection reports self
//     ids only — `label` is a copy of `selfId` — so "apply D-Plate"
//     cannot be resolved by name through any collection. Taking an
//     index would be the corpus campaign's stale-fixture trap all over
//     again, so instead the document is asked to export itself and the
//     `MasterSpreads/*` entries (carried through verbatim by the
//     writer) give `Self` + `Name` pairs that are correct for THIS
//     loaded document, whatever ids a reload minted.
//
//   · Text-variable definitions. There is no variables collection on
//     the wire either; the designmap carries them.
//
// The export is cached per ShowcaseDoc: masters and variables are
// document-lifetime facts, and one 134-page export per chapter is
// already one more than free.

import { readZipText, zipEntries } from "../../../e2e/harness/read-zip";
import type { ShowcaseDoc } from "../../driver";

const exportCache = new WeakMap<ShowcaseDoc, Promise<Buffer>>();

function exportedIdml(doc: ShowcaseDoc): Promise<Buffer> {
  let hit = exportCache.get(doc);
  if (!hit) {
    hit = doc.exportIdml();
    exportCache.set(doc, hit);
  }
  return hit;
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

/** Master NAME ("D-Plate") → master spread SELF id, from the live
 *  document's own export. Throws when the package lists no masters —
 *  a drifted fixture should fail loudly, not fall back to an index. */
export async function masterIdsByName(
  doc: ShowcaseDoc,
): Promise<Map<string, string>> {
  const idml = await exportedIdml(doc);
  const map = new Map<string, string>();
  for (const entry of zipEntries(idml)) {
    if (!entry.name.startsWith("MasterSpreads/")) continue;
    const xml = readZipText(idml, entry.name) ?? "";
    // The inner element, not the <idPkg:MasterSpread> wrapper.
    const tag = xml.match(/<MasterSpread\s[^>]*>/)?.[0];
    if (!tag) continue;
    const selfId = attr(tag, "Self");
    const name = attr(tag, "Name");
    if (selfId && name) map.set(name, selfId);
  }
  if (map.size === 0) {
    throw new Error(
      "the exported package lists no MasterSpreads/ entries — the base " +
        "fixture drifted, or the export dropped the masters",
    );
  }
  return map;
}

export interface TextVariableInfo {
  selfId: string;
  name: string;
  variableType: string;
  /** Custom-text payload, when the type carries one. */
  contents: string | null;
  /** Running-header pickup style + use, when the type carries them. */
  headerStyle: string | null;
  headerUse: string | null;
}

/** Every `<TextVariable>` the designmap defines, live from the export. */
export async function textVariables(
  doc: ShowcaseDoc,
): Promise<TextVariableInfo[]> {
  const idml = await exportedIdml(doc);
  const designmap = readZipText(idml, "designmap.xml") ?? "";
  const out: TextVariableInfo[] = [];
  for (const block of designmap.matchAll(
    /<TextVariable\s[^>]*>[\s\S]*?<\/TextVariable>/g,
  )) {
    const open = block[0].match(/<TextVariable\s[^>]*>/)?.[0] ?? "";
    const pref = block[0].match(/<TextVariablePreference\s[^>]*\/>/)?.[0] ?? "";
    const selfId = attr(open, "Self");
    const name = attr(open, "Name");
    const variableType = attr(open, "VariableType");
    if (!selfId || !name || !variableType) continue;
    const contents = attr(pref, "Contents");
    out.push({
      selfId,
      name,
      variableType,
      contents: contents && contents.length > 0 ? contents : null,
      headerStyle: attr(pref, "AppliedParagraphStyle"),
      headerUse: attr(pref, "Use"),
    });
  }
  return out;
}
