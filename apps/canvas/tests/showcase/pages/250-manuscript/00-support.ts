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

// Shared vocabulary for the manuscript chapter (250) — paged.doc driven
// through its real surfaces (the placeDoc command with the PRE-ARMED
// filechooser, the outline panel, the export center's plugin-exporter
// row) and FOUND on the page afterwards.
//
// Two doors this chapter needs beyond the driver:
//
//   · the paged-parts listing (`listParts`) — the container's own
//     answer to "which plugin parts travel with this file", read
//     through the privileged wire door the editor's native-document
//     backend uses. The manuscript spread asserts the source .docx
//     part's SINGLE-prefix path with it.
//
//   · the story overset flag (`storyOverset`) — whether the poured
//     manuscript ran out of its frame chain, read from the engine's
//     own story summaries so the spread can say honestly how much of
//     the report paints.
//
// And the spread seam, measured not assumed: wire inserts re-base
// page-local anchors by the spread origin while geometry/resize speak
// STORED coords (verso = origin page, the facing recto at +540 on this
// fixture) — `spreadOffset` probes the live answer per page.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { geometryOf } from "../../plugin-support";
import type { PageContext } from "../../types";

const HERE = dirname(fileURLToPath(import.meta.url));

export const PLACE_CMD = "media.paged.doc.command.placeDoc";
export const OUTLINE_PANEL = "media.paged.doc.panel.outline";
export const DOCX_EXPORTER = "media.paged.doc.exporter.docx";
export const EXPORT_CENTER_PANEL = "paged.export-center";

/** The manuscript: a circulation report authored FOR this annual — its
 *  section is the annual's own 540×720/54pt page, and it carries every
 *  tier the lowering handles (see the assets README grant row). */
export const DOCX_FIXTURE = pathResolve(
  HERE,
  "../../assets/annual-report.docx",
);

/** What the spread learned, for the save-back page. In-memory only —
 *  ids never cross the CHAPTER boundary; within one chapter run they
 *  address the same live document. */
export const chapterDoc: {
  placed: boolean;
  storyId: string | null;
  partPath: string | null;
  readiness: string | null;
} = { placed: false, storyId: null, partPath: null, readiness: null };

// ── the spread seam ──────────────────────────────────────────────────

const offsetCache = new Map<string, [number, number]>();

/** Where this page's STORED coordinates sit relative to page-local
 *  ones, measured with a transient probe (→ Appendix A). */
export async function spreadOffset(
  ctx: PageContext,
  pageId: string,
): Promise<[number, number]> {
  const hit = offsetCache.get(pageId);
  if (hit) return hit;
  const probe: [number, number, number, number] = [10, 10, 26, 26];
  const id = await ctx.doc.rectangle(pageId, probe);
  const geo = await geometryOf(ctx.page, [{ kind: "rectangle", id }]);
  await ctx.doc.mutate("deleteFrame", { frameId: id });
  const bounds = geo[0]?.bounds;
  if (!bounds) {
    throw new Error(`spread-offset probe on ${pageId} answered no geometry`);
  }
  const off: [number, number] = [bounds[1] - probe[0], bounds[0] - probe[1]];
  offsetCache.set(pageId, off);
  return off;
}

// ── read doors ───────────────────────────────────────────────────────

/** The `.paged` container parts under `prefix` — the privileged
 *  `listPagedParts` wire door (the same one the editor's
 *  native-document backend reads). */
export async function listParts(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { paths?: string[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "listPagedParts",
      payload: { prefix },
    });
    return reply.kind === "pagedPartList" ? (reply.payload.paths ?? []) : [];
  }, prefix);
}

/** The overset flag of one story, read AFTER a render pass (the flag
 *  derives from build diagnostics). `null` when the story is unknown. */
export async function storyOverset(
  page: Page,
  storyId: string,
): Promise<boolean | null> {
  const raw = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.executeScript("paged.stories()");
    return reply.output[0] ?? "[]";
  });
  const summaries = JSON.parse(raw) as Array<{
    selfId: string;
    overset?: boolean;
  }>;
  const hit = summaries.find((s) => s.selfId === storyId);
  return hit ? (hit.overset ?? false) : null;
}
