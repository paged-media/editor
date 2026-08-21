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

// Shared doors the PLUGIN spreads need and a single-page journey does
// not. Not a spread — `pages/` holds those; this is the support layer
// under 08-web / 09-database / 10-word.
//
// WHY IT EXISTS — because a plugin's output has to be FOUND, not
// assumed.
//
// A first-party bundle mints its page items through the host, and where
// they land is the bundle's decision, not the caller's: every one of
// them resolves its target page as
//
//     const meta = await host.document.meta();
//     pageId = meta.activePage ?? pages[0].selfId;
//
// (paged.web `insert.ts`, paged.data `lower.ts`, paged.doc `place.ts` —
// all three, verbatim). The showcase supplies that active page with
// `withActivePage` (see `../active-page.ts`), but a supplied intention
// is not evidence: a bundle that resolves its page some other way, a
// bake that reads geometry instead, or a lowering that takes the origin
// from one frame and the page from another all still put content
// somewhere, and only the document knows where.
//
// So the plugin spreads do three things, in this order, and these
// helpers are what they do them with:
//
//   1. drive the real plugin surface;
//   2. ASK what appeared and where (`newRefs` + `geometryOf` /
//      `pagesOf` / `partitionByPage`);
//   3. keep what is on the module's own page, remove what is not
//      (`removeRefs`) rather than leave it on another spread's page,
//      and report the removal as a note.
//
// Each spread's registry claims are then CONDITIONAL on step 2 — a row
// is claimed only when its evidence is on the page the reader is
// looking at. Nothing here decides that a plugin worked; the page does.
//
// Reparenting cannot rescue a miss after the fact: `Operation::MoveNode`
// is deliberately not on the wire (`paged-canvas/src/channel.rs`), so
// nothing can carry a created item to another page. Moving it WITHIN its
// page is ordinary layout and the spreads do that freely.

import type { Page } from "@playwright/test";

import { treeIds } from "../e2e/harness/viewport";
import type { Bounds, ShowcaseDoc } from "./driver";
import { STYLE } from "./names";

/** A scene-tree element reference — the `{kind, id}` pair the wire uses. */
export interface Ref {
  kind: string;
  id: string;
}

export const refKey = (r: Ref): string => `${r.kind}:${r.id}`;

/** Every scene-tree element of one wire kind, document-wide. */
export function sceneRefs(page: Page, kind: string): Promise<Ref[]> {
  return treeIds(page, kind);
}

/** The elements of `kind` that appeared since `before` was taken. */
export async function newRefs(
  page: Page,
  kind: string,
  before: Ref[],
): Promise<Ref[]> {
  const seen = new Set(before.map(refKey));
  const after = await treeIds(page, kind);
  return after.filter((r) => !seen.has(refKey(r)));
}

/** What the engine's geometry door answers for one element. */
export interface RefGeometry {
  ref: Ref;
  /** `null` when the item sits on the PASTEBOARD and belongs to no
   *  page (C-23), or when the id did not resolve. */
  pageId: string | null;
  /** `[top, left, bottom, right]` in the item's own content-box space. */
  bounds: [number, number, number, number] | null;
}

/**
 * Read the engine's geometry for `refs` — which page each sits on and
 * its bounds. Never throws: an unreadable id is simply absent from the
 * result, which is what the callers branch on.
 */
export async function geometryOf(
  page: Page,
  refs: Ref[],
): Promise<RefGeometry[]> {
  if (refs.length === 0) return [];
  return page.evaluate(
    async (ids) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementGeometry: (ids: unknown[]) => Promise<
                Array<{
                  id: { kind: string; id: string };
                  pageId?: string | null;
                  bounds?: [number, number, number, number] | null;
                }>
              >;
            };
          };
        }
      ).__canvas;
      try {
        const got = await c.client.elementGeometry(ids);
        return got.map((g) => ({
          ref: { kind: g.id.kind, id: g.id.id },
          pageId: g.pageId ?? null,
          bounds: g.bounds ?? null,
        }));
      } catch {
        return [] as Array<{
          ref: { kind: string; id: string };
          pageId: string | null;
          bounds: [number, number, number, number] | null;
        }>;
      }
    },
    refs as unknown as unknown[],
  );
}

/**
 * The page each ref sits on, keyed by `refKey`. `null` means the engine
 * answered "no page" — a pasteboard item (C-23) or an id it could not
 * resolve.
 */
export async function pagesOf(
  page: Page,
  refs: Ref[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const g of await geometryOf(page, refs)) {
    out.set(refKey(g.ref), g.pageId);
  }
  return out;
}

/** `refs` split into the ones on `pageId` and the ones anywhere else. */
export async function partitionByPage(
  page: Page,
  refs: Ref[],
  pageId: string,
): Promise<{ here: Ref[]; elsewhere: Ref[] }> {
  const where = await pagesOf(page, refs);
  const here: Ref[] = [];
  const elsewhere: Ref[] = [];
  for (const r of refs) {
    if (where.get(refKey(r)) === pageId) here.push(r);
    else elsewhere.push(r);
  }
  return { here, elsewhere };
}

/** Remove page items as ONE undo step. No-op for an empty list. */
export async function removeRefs(doc: ShowcaseDoc, refs: Ref[]): Promise<void> {
  if (refs.length === 0) return;
  await doc.batch(
    refs.map((r) => ({ op: "deleteFrame", args: { frameId: r.id } })),
  );
}

/**
 * Poll `predicate` until it holds or `timeoutMs` elapses. Returns
 * whether it held — deliberately NOT `expect.poll`, because a plugin
 * engine that does not boot is a NOTE on this document, not a red: the
 * caller decides which it is, and both outcomes have to be expressible.
 */
export async function settle(
  page: Page,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(150);
  }
}

/** A console tap that keeps the lines a plugin's own logger emitted. */
export class ConsoleTap {
  readonly lines: string[] = [];

  private readonly handler: (m: { text(): string }) => void;

  constructor(
    private readonly page: Page,
    match: RegExp,
  ) {
    this.handler = (m) => {
      const text = m.text();
      if (match.test(text)) this.lines.push(text);
    };
    this.page.on("console", this.handler);
  }

  saw(pattern: RegExp): boolean {
    return this.lines.some((l) => pattern.test(l));
  }

  join(): string {
    return this.lines.join(" | ");
  }

  stop(): void {
    this.page.off("console", this.handler);
  }
}

/** Where a spread's own content starts, under the heading + caption. */
export const CONTENT_TOP_PT = 176;

/**
 * The two frames that make a spread read as a page of a REPORT rather
 * than a test fixture: a heading and a caption, both styled by NAME
 * from the base fixture's catalog (`Showcase Heading` /
 * `Showcase Caption`), so a drifted fixture fails here rather than
 * printing unstyled text.
 */
export async function headingAndCaption(
  doc: ShowcaseDoc,
  pageId: string,
  heading: string,
  caption: string,
): Promise<string[]> {
  const headingBounds: Bounds = [72, 72, 108, 540];
  const headingId = await doc.textFrame(pageId, headingBounds);
  const headingStory = await doc.storyOf(pageId, headingBounds);
  await doc.insertText(headingStory, heading);
  await doc.applyStyle(
    headingStory,
    0,
    heading.length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );

  const captionBounds: Bounds = [114, 72, 168, 540];
  const captionId = await doc.textFrame(pageId, captionBounds);
  const captionStory = await doc.storyOf(pageId, captionBounds);
  await doc.insertText(captionStory, caption);
  await doc.applyStyle(
    captionStory,
    0,
    caption.length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );

  return [headingId, captionId];
}

/** A small captioned label frame — the running commentary a report
 *  page needs beside a plugin's output. Styled `Showcase Caption`. */
export async function labelFrame(
  doc: ShowcaseDoc,
  pageId: string,
  bounds: Bounds,
  text: string,
): Promise<string> {
  const id = await doc.textFrame(pageId, bounds);
  const story = await doc.storyOf(pageId, bounds);
  await doc.insertText(story, text);
  await doc.applyStyle(
    story,
    0,
    text.length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );
  return id;
}
