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

// Source + render (p104, B-Body verso) — one web frame and, beside it,
// the exact source it carries, printed as a code specimen.
//
// The frame arrives through the bundle's own "Insert web frame"
// command (one undoable batch: insertFrame + envelope on the v34
// `$created` sentinel), and its source is then written through the
// SAME wire door the bundle uses — `setPluginMetadata` carrying the
// `x-paged:media.paged.web` envelope, `{v: 1, data: {html, css,
// options}}`, exactly the shape web-model/src/source.ts validates. The
// panel is then opened on the selection to show the envelope coming
// BACK through the plugin's own surface, and the frame is rendered by
// the Blitz engine into a C-1 scene layer.
//
// What is printed beside the frame is not decoration: it is excerpted
// from the same bytes the envelope carries, so source and rendering
// can be read against each other — the chapter's thesis in one page.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../../fidelity/canvas-driver";
import { withActivePage } from "../../active-page";
import { marginNote, proseFrame, specLabel, type Para } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import {
  ConsoleTap,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
} from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  WEB_CMD,
  WEB_PANEL,
  codeLine,
  envelopeFor,
  hairline,
  readReport,
  setWebSource,
  splitHtmlAsset,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTICLE = pathResolve(__dirname, "..", "..", "assets", "web", "long-read.html");

/** The web frame's slot, page-space (x0, y0, x1, y1). */
const FRAME: [number, number, number, number] = [60, 186, 268, 560];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg104 = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [
    "plugin-web.source-model",
    "plugin-web.metadata-persistence",
    "plugin-platform.document-metadata",
  ];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(104), [60, 96, 492, 124], [
    { text: "Source beside render", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(104), [60, 128, 492, 178], [
    {
      text:
        "The frame on the left is an ordinary rectangle whose document " +
        "metadata carries this year's long read as HTML and CSS. The " +
        "column on the right prints an excerpt of exactly what the " +
        "envelope holds. The engine that laid the article out is a real " +
        "browser stack, compiled to wasm, drawing into the frame.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the frame, through the bundle's own insert command ───────────
  const rectsBefore = await sceneRefs(page, "rectangle");
  await withActivePage(page, pg104, async () => {
    await doc.runCommand(`${WEB_CMD}.insertWebFrame`);
    await settle(
      page,
      async () => (await newRefs(page, "rectangle", rectsBefore)).length > 0,
      10_000,
    );
  });
  const minted = await newRefs(page, "rectangle", rectsBefore);
  const { here, elsewhere } = await partitionByPage(page, minted, pg104);
  if (here.length === 1 && elsewhere.length === 0) {
    covers.push("plugin-web.insert-command");
    notes.push(
      "insertWebFrame minted its frame + starter envelope on this page " +
        "(one undoable batch, verified by geometry) — the demonstration " +
        "frame was then removed and the exhibit frame authored at the " +
        "design box, because reshaping the default frame in place would " +
        "take SPREAD-space resizeFrame bounds (the chain spread records " +
        "that wire shape)",
    );
  } else {
    notes.push(
      "insertWebFrame did not mint exactly one rectangle on this page " +
        `(here ${here.length}, elsewhere ${elsewhere.length}); ` +
        "plugin-web.insert-command is NOT claimed",
    );
  }
  // Demonstrated, not resident: the command's default-box frame makes
  // way for the page's own exhibit frame at the design geometry.
  const clearDemo = () => removeRefs(doc, [...here, ...elsewhere]);
  await (doc.ledger ? doc.ledger.transient(clearDemo) : clearDemo()).catch(
    () => undefined,
  );
  const frameId = await doc.rectangle(pg104, FRAME);
  await hairline(doc, "rectangle", frameId, SWATCH.slate);
  elements.push(frameId);

  // ── the envelope, through the raw metadata door ──────────────────
  const source = splitHtmlAsset(ARTICLE);
  await setWebSource(doc, frameId, source);

  // The panel reads the envelope back through the plugin's own surface
  // — the round trip that proves the write was the bundle's shape, not
  // a private one. The selection is BOUNCED off another element first:
  // the insert command already selected this frame with its starter
  // source, and the panel's stale-guard re-reads on selection CHANGE.
  await doc.select("textFrame", head.frameId);
  await doc.select("rectangle", frameId);
  await openPanel(page, WEB_PANEL);
  const htmlLane = page.locator("[data-web-html] [data-code-input]");
  await expect(
    htmlLane,
    "the source panel mounted on the selection and opened its editors",
  ).toBeVisible({ timeout: 15_000 });
  // The panel's metadata read is async with a stale-guard — POLL for
  // the round trip rather than judging a single early sample.
  const readBack = await settle(
    page,
    async () =>
      (await htmlLane.inputValue().catch(() => "")).includes(
        "The Year the Presses Ran Long",
      ),
    8_000,
  );
  if (readBack) {
    notes.push(
      "the source panel read the document-authored envelope back verbatim " +
        "(the html lane shows the article)",
    );
  } else {
    const laneText = await htmlLane.inputValue().catch(() => "");
    notes.push(
      "the source panel kept its earlier draft after the direct metadata " +
        "write — the envelope reached the document (the render below reads " +
        `it) but the open panel lane still shows ${laneText.length} chars; ` +
        "the panel re-reads on selection CHANGE, and re-selecting the same " +
        "frame is not one",
    );
  }

  // ── the render — Blitz to a C-1 scene layer ──────────────────────
  const tap = new ConsoleTap(page, /renderWebFrame:|\[web\]/i);
  let rendered = false;
  try {
    await doc.select("rectangle", frameId);
    try {
      await doc.runCommand(`${WEB_CMD}.renderWebFrame`);
    } catch (err) {
      notes.push(
        "renderWebFrame died in the plugin lane (a scene-layer submit was " +
          `refused): ${String(err).split("\n")[0].slice(0, 140)}`,
      );
    }
    const answered = await settle(
      page,
      () => tap.saw(/scene layer submitted/i) || tap.saw(/engine not loaded/i),
      25_000,
    );
    rendered = tap.saw(/scene layer submitted/i);
    if (rendered) {
      covers.push("plugin-web.engine-rendering", "plugin-platform.scene-layer");
    } else {
      notes.push(
        answered
          ? "the Blitz/WASM engine did not load in this lane — the frame " +
            "carries its source but no live paint; plugin-web.engine-rendering " +
            "is NOT claimed"
          : `renderWebFrame reported no outcome within 25 s (saw: ${tap.join() || "nothing"})`,
      );
    }
    const readout = await readReport(page, "renderFrame");
    if (readout) covers.push("plugin-web.render-readout");
  } finally {
    tap.stop();
  }

  // ── the code specimen: what the envelope actually holds ──────────
  const htmlBytes = new TextEncoder().encode(source.html).length;
  const cssBytes = new TextEncoder().encode(source.css).length;
  const specimenLines: string[] = [
    `// x-paged:media.paged.web — the envelope (v1)`,
    `{ "v": 1, "data": {`,
    `    "html": /* ${htmlBytes} bytes, excerpt: */`,
    ...source.html
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(0, 9)
      .map((l) => codeLine(l)),
    `    "css": /* ${cssBytes} bytes, excerpt: */`,
    ...source.css
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(4, 10)
      .map((l) => codeLine(l)),
    `    "options": { "media": "print", "overflow": "clip" } } }`,
  ];
  const paras: Para[] = specimenLines.map((text) => ({
    text,
    style: STYLE.codeBlock,
  }));
  const specimen = await proseFrame(ctx, p(104), [280, 186, 492, 560], paras);
  elements.push(specimen.frameId);

  const status = await proseFrame(ctx, p(104), [60, 574, 492, 630], [
    {
      text: rendered
        ? "Rendered live: the engine submitted a scene layer that core " +
          "composes inside the frame. That paint is session state — the " +
          "envelope beside it is what the document keeps."
        : "The web engine did not load on this build lane, so the frame " +
          "carries its committed source without live paint; a lane with " +
          "the engine renders it. The envelope round-trips either way.",
      style: STYLE.caption,
    },
  ]);
  elements.push(status.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(104),
      "The live render is a C-1 scene layer and will not survive this " +
        "chapter's checkpoint reload; the envelope in document metadata " +
        "will. The chapter's last spread makes that asymmetry the whole " +
        "point. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(104), [
      "Specimen No. 171",
      "insertWebFrame (one undoable batch)",
      "setPluginMetadata x-paged:media.paged.web {v:1, data}",
      "renderWebFrame — Blitz → C-1 sceneLayer",
      `${envelopeFor(source).length} envelope bytes`,
    ]),
  );

  return { title: "Source beside render", covers, elements, notes };
}
