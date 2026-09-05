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

// The born-shared oracle.
//
// Two text frames may share a story for exactly one reason: they are
// threaded, one flowing into the next along `NextTextFrame`. A story
// with two frames and no link between them was not threaded — the
// frames were BORN on it. The engine's story minter did that whenever
// sibling frames were minted in one batch on a document whose story
// ids had gaps: every mint walked to the same first free number, the
// first apply created the story and the rest adopted it. Nothing in
// the chain could see it, the change-only pixel gates passed, and
// InDesign printed the chart wall's labels as "2803.251807.50". The
// minter is fixed (`story_id_floor`); this is the gate that keeps it
// fixed, read from the exported IDML because that is the twin whose
// stories InDesign counts.

import { readZipText, zipEntryNames } from "../e2e/harness/read-zip";

export interface SharedStory {
  story: string;
  frames: string[];
  /** Frames no other frame of the story threads into. A thread has one. */
  heads: string[];
  spreads: string[];
}

interface FrameRow {
  story: string | null;
  next: string | null;
  spread: string;
}

/** Every story carried by more than one frame, split into threads
 *  (one head) and born-shared stories (more than one head). */
export function storiesSharedByFrames(idml: Buffer): {
  threads: SharedStory[];
  bornShared: SharedStory[];
} {
  const frames = new Map<string, FrameRow>();
  for (const name of zipEntryNames(idml)) {
    if (!name.startsWith("Spreads/") && !name.startsWith("MasterSpreads/")) continue;
    const xml = readZipText(idml, name);
    if (xml === null) continue;
    for (const m of xml.matchAll(/<TextFrame\b([^>]*)>/g)) {
      const attrs = m[1];
      const self = /\bSelf="([^"]+)"/.exec(attrs)?.[1];
      if (!self) continue;
      const story = /\bParentStory="([^"]+)"/.exec(attrs)?.[1] ?? null;
      const nextRaw = /\bNextTextFrame="([^"]+)"/.exec(attrs)?.[1] ?? null;
      const next = nextRaw && nextRaw !== "n" ? nextRaw : null;
      frames.set(self, { story, next, spread: name });
    }
  }
  const byStory = new Map<string, string[]>();
  for (const [id, row] of frames) {
    if (!row.story) continue;
    const list = byStory.get(row.story) ?? [];
    list.push(id);
    byStory.set(row.story, list);
  }
  const threads: SharedStory[] = [];
  const bornShared: SharedStory[] = [];
  for (const [story, ids] of byStory) {
    if (ids.length < 2) continue;
    const targets = new Set(ids.map((id) => frames.get(id)?.next ?? null));
    const heads = ids.filter((id) => !targets.has(id));
    const spreads = [...new Set(ids.map((id) => frames.get(id)!.spread))];
    const entry = { story, frames: ids, heads, spreads };
    (heads.length === 1 ? threads : bornShared).push(entry);
  }
  return { threads, bornShared };
}
