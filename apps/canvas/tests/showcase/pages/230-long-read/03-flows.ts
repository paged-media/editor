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

// Named flows (p105, B-Body recto) — one source, four frames, two
// flows. The long read declares `flow-into: article-flow` on its
// article and `flow-into: sidebar-flow` on its route notes; this page
// threads the article across the source frame plus two recipients
// (threadWebFlow — untagged recipients belong to the primary flow) and
// routes a third recipient to the sidebar flow (threadWebFlowNamed —
// the second `flow-into` in declaration order). The persisted chain
// rides the source envelope AND its container part, which is where
// this page goes to VERIFY what it did: the part's JSON is read back
// and its recipients — including the one tagged `sidebar-flow` — are
// the oracle, not wishful thinking about a command that returned.
//
// The unthread verb is demonstrated transiently: a scratch frame is
// threaded in, verified, unthreaded, verified gone, and deleted —
// demonstrated, not resident.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assignLayer, marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import { ConsoleTap, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  WEB_CMD,
  armMutationFailureTap,
  hairline,
  partRecipients,
  readMutationFailures,
  readReport,
  runOnSelection,
  setWebSource,
  splitHtmlAsset,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTICLE = pathResolve(__dirname, "..", "..", "assets", "web", "long-read.html");

const ref = (id: string) => ({ kind: "rectangle", id });

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg105 = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [
    "plugin-web.flow-threading",
    "plugin-web.metadata-persistence",
  ];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(105), [48, 96, 480, 124], [
    { text: "One source, two flows, four frames", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(105), [48, 128, 480, 170], [
    {
      text:
        "The article declares flow-into: article-flow; its route notes " +
        "declare flow-into: sidebar-flow. Frames are the real Regions " +
        "consumers here — the chain below is persisted in the source's " +
        "envelope and container part, and this page reads the part back " +
        "as its proof.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the four frames ──────────────────────────────────────────────
  const src = await doc.rectangle(pg105, [48, 196, 186, 380]);
  const r1 = await doc.rectangle(pg105, [198, 196, 336, 440]);
  const r2 = await doc.rectangle(pg105, [348, 196, 480, 440]);
  const sidebar = await doc.rectangle(pg105, [48, 406, 186, 540]);
  for (const id of [src, r1, r2, sidebar]) {
    await hairline(doc, "rectangle", id, SWATCH.slate);
    await assignLayer(ctx, "rectangle", id, LAYER.content);
  }
  elements.push(src, r1, r2, sidebar);

  await setWebSource(doc, src, splitHtmlAsset(ARTICLE));

  // ── thread the primary flow, then the named flow ─────────────────
  await runOnSelection(ctx, [ref(src), ref(r1), ref(r2)], `${WEB_CMD}.threadWebFlow`);
  const threaded = await settle(
    page,
    async () => ((await partRecipients(page, src)) ?? []).length === 2,
    10_000,
  );
  expect(
    threaded,
    "threadWebFlow persisted two primary recipients into the source part",
  ).toBe(true);

  await runOnSelection(ctx, [ref(src), ref(sidebar)], `${WEB_CMD}.threadWebFlowNamed`);
  await settle(
    page,
    async () => ((await partRecipients(page, src)) ?? []).length === 3,
    10_000,
  );
  const recipients = (await partRecipients(page, src)) ?? [];
  expect(recipients.length, "three recipients persisted").toBe(3);
  const sidebarEntry = recipients.find((r) => r.id === sidebar);
  expect(
    sidebarEntry?.flow,
    "the third recipient is routed to the NAMED sidebar flow",
  ).toBe("sidebar-flow");

  // ── unthread, demonstrated transiently ───────────────────────────
  const runTransient = async <T>(fn: () => Promise<T>): Promise<T> =>
    doc.ledger ? doc.ledger.transient(fn) : fn();
  await runTransient(async () => {
    const scratch = await doc.rectangle(pg105, [198, 456, 336, 540]);
    await runOnSelection(ctx, [ref(src), ref(scratch)], `${WEB_CMD}.threadWebFlow`);
    const grew = await settle(
      page,
      async () => ((await partRecipients(page, src)) ?? []).length === 4,
      10_000,
    );
    await runOnSelection(ctx, [ref(src), ref(scratch)], `${WEB_CMD}.unthreadWebFlow`);
    const shrank = await settle(
      page,
      async () => ((await partRecipients(page, src)) ?? []).length === 3,
      10_000,
    );
    await doc.mutate("deleteFrame", { frameId: scratch });
    notes.push(
      grew && shrank
        ? "unthreadWebFlow round trip verified through the container part " +
          "(chain 3 → 4 → 3); the scratch frame was deleted — demonstrated, " +
          "not resident"
        : "the unthread round trip could not be verified through the part " +
          `(grew=${grew}, shrank=${shrank})`,
    );
  });

  // ── render every flow group ──────────────────────────────────────
  // GUARDED like the fragmentation page: a scene-layer submit refusal
  // throws through the command; the page records it instead of dying.
  await armMutationFailureTap(page);
  const tap = new ConsoleTap(page, /renderWebFlow:|\[web\]/i);
  let submitted = 0;
  try {
    try {
      await runOnSelection(ctx, [ref(src)], `${WEB_CMD}.renderWebFlow`);
      await settle(
        page,
        () => tap.saw(/renderWebFlow: (threaded|rendered|engine|.+)/i),
        25_000,
      );
    } catch (err) {
      const engineSaid = await readMutationFailures(page);
      notes.push(
        "renderWebFlow died in the plugin lane (a scene-layer submit was " +
          `refused): ${String(err).split("\n")[0].slice(0, 120)}; engine: ` +
          `${engineSaid.join(" | ") || "(no payload captured)"}`,
      );
    }
    const m = /renderWebFlow: threaded (\d+) frame/.exec(tap.join());
    submitted = m ? Number(m[1]) : 0;
    if (submitted > 0) {
      covers.push("plugin-web.engine-rendering", "plugin-platform.scene-layer");
      notes.push(
        `renderWebFlow submitted ${submitted} frame(s) across the two flows` +
          (tap.saw(/overset/i) ? " (overset reported past the last frame)" : ""),
      );
    } else {
      notes.push(
        "renderWebFlow submitted no scene layers on this lane " +
          `(saw: ${tap.join() || "nothing"}) — the chain persists; the paint is a ` +
          "capable lane away. plugin-web.engine-rendering is NOT claimed here",
      );
    }
    const readout = await readReport(page, "renderFlow");
    if (readout) notes.push(`flow readout: ${readout.slice(0, 140)}`);
  } finally {
    tap.stop();
  }

  // ── captions naming the syntax ───────────────────────────────────
  const capSrc = await proseFrame(ctx, p(105), [48, 384, 186, 402], [
    { text: "source — flow-into: article-flow", style: STYLE.caption },
  ]);
  const capR = await proseFrame(ctx, p(105), [198, 444, 480, 462], [
    {
      text: "flow-from consumers 1 and 2 — the primary chain, in selection order",
      style: STYLE.caption,
    },
  ]);
  const capSide = await proseFrame(ctx, p(105), [48, 544, 480, 568], [
    {
      text: "flow-into: sidebar-flow — the named flow, routed by threadWebFlowNamed",
      style: STYLE.caption,
    },
  ]);
  elements.push(capSrc.frameId, capR.frameId, capSide.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(105),
      "The flow renders above are scene layers — session state that the " +
        "chapter checkpoint will drop. The CHAIN is not: it rides the " +
        "source envelope and the container part, and reopening the file " +
        "re-renders it on any engine-capable lane. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(105), [
      "Specimen No. 172",
      "threadWebFlow ×2 · threadWebFlowNamed · unthreadWebFlow",
      "renderWebFlow — every flow group",
      "chain verified via paged/media.paged.web/<id>/source.json",
    ]),
  );

  return { title: "One source, two flows, four frames", covers, elements, notes };
}
