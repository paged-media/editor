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

// The text a given set of text frames holds in an exported IDML.
//
// A check that reads EVERY story of a package proves a word is somewhere
// in the document, not that it is where it should be: a table's cells
// live in a story too. This reads the spreads for each frame's
// `ParentStory` and returns only those stories' text.

import { readZipText, zipEntryNames } from "./read-zip";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e.startsWith("#x")
      ? String.fromCodePoint(Number.parseInt(e.slice(2), 16))
      : e.startsWith("#")
        ? String.fromCodePoint(Number.parseInt(e.slice(1), 10))
        : ENTITIES[e],
  );
}

const attr = (attrs: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

/** Every `<TextFrame>` in the package's spreads: its `Self` → `ParentStory`. */
export function frameStoryIds(idml: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of zipEntryNames(idml).filter((n) => n.startsWith("Spreads/"))) {
    const xml = readZipText(idml, name) ?? "";
    for (const m of xml.matchAll(/<TextFrame\b([^>]*)>/g)) {
      const self = attr(m[1], "Self");
      const story = attr(m[1], "ParentStory");
      if (self && story) out.set(self, story);
    }
  }
  return out;
}

/** Every story's text (its `<Content>` runs, joined), keyed by `Self`. */
export function storyTexts(idml: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of zipEntryNames(idml).filter((n) => n.startsWith("Stories/"))) {
    const xml = readZipText(idml, name) ?? "";
    const self = attr(/<Story\b([^>]*)>/.exec(xml)?.[1] ?? "", "Self");
    if (!self) continue;
    const text = [...xml.matchAll(/<Content>([^<]*)<\/Content>/g)].map((m) => unescapeXml(m[1])).join("");
    out.set(self, text);
  }
  return out;
}

/** The `Self` of every `<TextFrame>` inside the spreads' `<Group>` whose
 *  `Self` is `groupId`, nested groups included, in document order. Empty
 *  when no spread has that group. */
export function textFramesInGroup(idml: Buffer, groupId: string): string[] {
  for (const name of zipEntryNames(idml).filter((n) => n.startsWith("Spreads/"))) {
    const xml = readZipText(idml, name) ?? "";
    const open = new RegExp(`<Group\\b[^>]*\\bSelf="${groupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`).exec(xml);
    if (!open) continue;
    // Walk to the matching close tag: groups nest.
    const tags = /<(\/?)Group\b[^>]*?(\/?)>/g;
    tags.lastIndex = open.index + open[0].length;
    let depth = open[0].endsWith("/>") ? 0 : 1;
    let end = tags.lastIndex;
    for (let m = tags.exec(xml); m && depth > 0; m = tags.exec(xml)) {
      if (m[2] === "/") continue;
      depth += m[1] === "/" ? -1 : 1;
      end = m.index;
    }
    const body = xml.slice(open.index, end);
    return [...body.matchAll(/<TextFrame\b([^>]*)>/g)]
      .map((m) => attr(m[1], "Self"))
      .filter((id): id is string => id !== null);
  }
  return [];
}

/**
 * The text of the story each of `frameIds` holds, in order. A frame the
 * spreads do not list, or whose story is missing, yields `null` — so a
 * caller can tell "not exported" from "empty".
 */
export function textOfFrames(idml: Buffer, frameIds: readonly string[]): Array<string | null> {
  const frames = frameStoryIds(idml);
  const stories = storyTexts(idml);
  return frameIds.map((id) => {
    const story = frames.get(id);
    return story === undefined ? null : (stories.get(story) ?? null);
  });
}
