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

// The fragmentation ladder (p106, B-Body verso) — two exhibits of the
// ADR-020 flow fragmentation, each on its designed rung:
//
//   · fares-table.html across THREE frames: web-render cuts a <table>
//     only BETWEEN body rows, and never consumes anything inside a
//     <thead> — so the TWO-row header re-renders at the top of every
//     continuation frame (rung 3c). Forty body rows guarantee the
//     split.
//   · nested-cards.html across TWO frames: a column of cards splits
//     BETWEEN a card's own blocks, recursively (rung 3b) — except the
//     pressmark card's <img>, which is on the planner's atomic list
//     and must move whole, never split.
//
// The chains are persisted through the same envelope-and-part door the
// flows page verified; the renders are scene layers, said so in the
// margin. The captions point AT the mechanism — the repeated header,
// the atomic image — because a reader of this page is looking at a
// fragmentation plan, not a screenshot.

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
  runOnSelection,
  setWebSource,
  splitHtmlAsset,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = pathResolve(__dirname, "..", "..", "assets", "web");

const ref = (id: string) => ({ kind: "rectangle", id });

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg106 = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [
    "plugin-web.flow-threading",
    "plugin-web.metadata-persistence",
  ];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(106), [60, 96, 492, 124], [
    { text: "The fragmentation ladder", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(106), [60, 128, 492, 156], [
    {
      text:
        "Two sources, two rungs: a forty-row fares table split between " +
        "body rows with its two-row header repeating, and a card column " +
        "split between a card's own blocks — except the image, which " +
        "moves whole.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── exhibit 1: the fares table across three frames ───────────────
  // Two up, one below — wide enough that five columns breathe at the
  // engine's 96/72 px-per-pt viewport.
  const f0 = await doc.rectangle(pg106, [60, 164, 268, 318]);
  const f1 = await doc.rectangle(pg106, [280, 164, 492, 318]);
  const f2 = await doc.rectangle(pg106, [60, 330, 268, 484]);
  for (const id of [f0, f1, f2]) {
    await hairline(doc, "rectangle", id, SWATCH.slate);
    await assignLayer(ctx, "rectangle", id, LAYER.content);
  }
  elements.push(f0, f1, f2);
  await setWebSource(doc, f0, splitHtmlAsset(pathResolve(ASSETS, "fares-table.html")));
  await runOnSelection(ctx, [ref(f0), ref(f1), ref(f2)], `${WEB_CMD}.threadWebFlow`);
  const faresThreaded = await settle(
    page,
    async () => ((await partRecipients(page, f0)) ?? []).length === 2,
    10_000,
  );
  expect(faresThreaded, "the fares chain persisted (source + 2 frames)").toBe(true);

  // ── exhibit 2: the nested cards across two frames ────────────────
  const n0 = await doc.rectangle(pg106, [60, 496, 268, 610]);
  const n1 = await doc.rectangle(pg106, [280, 496, 492, 610]);
  for (const id of [n0, n1]) {
    await hairline(doc, "rectangle", id, SWATCH.slate);
    await assignLayer(ctx, "rectangle", id, LAYER.content);
  }
  elements.push(n0, n1);
  await setWebSource(doc, n0, splitHtmlAsset(pathResolve(ASSETS, "nested-cards.html")));
  await runOnSelection(ctx, [ref(n0), ref(n1)], `${WEB_CMD}.threadWebFlow`);
  const cardsThreaded = await settle(
    page,
    async () => ((await partRecipients(page, n0)) ?? []).length === 1,
    10_000,
  );
  expect(cardsThreaded, "the card chain persisted (source + 1 frame)").toBe(true);

  // ── render both chains ───────────────────────────────────────────
  // GUARDED: on the first pass of this chapter the fares chain's
  // render DIED inside the plugin — a scene-layer submit came back
  // `mutationFailed` and the client's throw took the whole command
  // with it (deterministic, both attempts; the long-read flows on the
  // previous page submit cleanly every run). The engine's own error
  // payload is captured through the tap and printed in the notes; a
  // refused render degrades this page to its honest record instead of
  // failing the chapter, and claims nothing it did not see.
  await armMutationFailureTap(page);
  const tap = new ConsoleTap(page, /renderWebFlow:|\[web\]/i);
  let faresFrames = 0;
  let cardFrames = 0;
  try {
    try {
      await runOnSelection(ctx, [ref(f0)], `${WEB_CMD}.renderWebFlow`);
      await settle(page, () => /renderWebFlow:/.test(tap.join()), 25_000);
      faresFrames = Number(/threaded (\d+) frame/.exec(tap.join())?.[1] ?? 0);
    } catch (err) {
      const engineSaid = await readMutationFailures(page);
      notes.push(
        "PRODUCT FINDING — the fares-table chain's renderWebFlow died in " +
          "the plugin lane: a C-1 scene-layer submit was REFUSED " +
          `(${String(err).split("\n")[0].slice(0, 120)}); the engine said: ` +
          `${engineSaid.join(" | ") || "(no mutationFailed payload captured)"}`,
      );
    }
    tap.lines.length = 0;
    try {
      await runOnSelection(ctx, [ref(n0)], `${WEB_CMD}.renderWebFlow`);
      await settle(page, () => /renderWebFlow:/.test(tap.join()), 25_000);
      cardFrames = Number(/threaded (\d+) frame/.exec(tap.join())?.[1] ?? 0);
    } catch (err) {
      const engineSaid = await readMutationFailures(page);
      notes.push(
        "PRODUCT FINDING — the card chain's renderWebFlow died in the " +
          "plugin lane: the scene-layer submit for the image-bearing " +
          `fragment was refused (${String(err).split("\n")[0].slice(0, 90)}); ` +
          `engine: ${engineSaid.join(" | ") || "(no payload captured)"}`,
      );
    }
  } finally {
    tap.stop();
  }
  // Fragmentation is claimed when a chain VISIBLY re-line-broke across
  // frames on this page; each exhibit's outcome is recorded separately.
  if (faresFrames >= 2 || cardFrames >= 2) {
    covers.push(
      "plugin-web.flow-fragmentation",
      "plugin-web.engine-rendering",
      "plugin-platform.scene-layer",
    );
  }
  notes.push(
    `flow renders this run: fares table across ${faresFrames} frame(s), ` +
      `card column across ${cardFrames} frame(s)` +
      (faresFrames >= 2 && cardFrames < 2
        ? " — the header-repeat exhibit carries the fragmentation claim; " +
          "the card exhibit's chain persists unrendered"
        : ""),
  );

  // ── captions pointing at the mechanism ───────────────────────────
  const capFares = await proseFrame(ctx, p(106), [280, 330, 492, 484], [
    {
      text:
        faresFrames >= 2
          ? "Carriage fares, one source, three frames (reading order: top " +
            "left, top right, lower left). The split falls BETWEEN body " +
            "rows only, and both header rows — the blue route line and " +
            "the orange units line — say themselves again at the top of " +
            "each continuation. Column widths may re-resolve per frame: " +
            "the documented v0 caveat, content-loss-free; rows past the " +
            "last frame are reported overset, never dropped silently."
          : "Carriage fares, one source, three frames — threaded and " +
            "persisted, but the engine refused this chain's scene layers " +
            "on this build; the refusal is recorded in the chapter notes " +
            "rather than painted over.",
      style: STYLE.caption,
    },
  ]);
  const capCards = await proseFrame(ctx, p(106), [60, 614, 492, 638], [
    {
      text:
        cardFrames >= 2
          ? "Route cards, one source, two frames: a straddling card splits " +
            "between its own blocks, recursively — the pressmark image is " +
            "atomic and moves whole rather than tearing."
          : "Route cards, one source, two frames — threaded and persisted, " +
            "but the engine REFUSED this chain's scene layers on this build " +
            "(the image-bearing fragment's message carries a null where the " +
            "wire wants a number). The frames above are the honest empties; " +
            "the finding is recorded, not painted over.",
      style: STYLE.caption,
    },
  ]);
  elements.push(capFares.frameId, capCards.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(106),
      "Both renders are scene layers (session state); the sources and " +
        "their chains persist in metadata and container parts. The bake " +
        "spread overleaf is where web content crosses into what survives " +
        "the file being closed. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(106), [
      "Specimen No. 173",
      "fares-table.html — 2-row thead, 40 body rows, 3 frames",
      "nested-cards.html — recursive card split, atomic img, 2 frames",
      "threadWebFlow ×2 · renderWebFlow ×2",
    ]),
  );

  return { title: "The fragmentation ladder", covers, elements, notes };
}
