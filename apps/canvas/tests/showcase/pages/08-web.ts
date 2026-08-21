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

// Spread 08 — paged.web: HTML and CSS as placed content.
//
// WHAT THIS PAGE DEMONSTRATES, in the order the page reads:
//
//   · a WEB FRAME — an ordinary rectangle carrying the plugin's
//     `x-paged:media.paged.web` metadata envelope (`{v, data, engine}`),
//     which is the whole of what makes a frame a web frame (§5 of the
//     bundle's model; `web-bundle/src/insert.ts` mints exactly that as
//     ONE undoable batch: insertFrame + setPluginMetadata on the v34
//     `$created` sentinel);
//   · real HTML + CSS authored in the bundle's SOURCE PANEL and
//     committed with "Save to document" — preview is not persistence,
//     the metadata write is;
//   · the frame RENDERED on canvas — `renderWebFrame` boots the
//     Blitz/WASM engine and submits a C-1 sceneLayer the engine
//     composes inside the frame;
//   · the frame BAKED to native content — `bakeWebFrame` flattens that
//     render into real swatches, rectangles and text frames, which is
//     the step that makes this page survive `showcase.idml` and a PDF
//     export with no plugin engine anywhere in the pipeline.
//
// RECIPE FROM: `tests/journey/plugins/web.journey.spec.ts` (insert →
// source panel → preview → persist) and `web-render.journey.spec.ts`
// (renderWebFrame → "scene layer submitted to canvas" vs "engine not
// loaded", polled off the console). The Blitz artifact does not load in
// every realm; when it does not, this page reports it as a note and
// claims neither the rendering nor the bake — never a fake render.
//
// WHAT THIS PAGE DOES NOT CLAIM, and why. `plugin-web.bake-to-native`
// RUNS here — it is the last step below — but the feature registry does
// not record that row as shipped in any stage, and the showcase must
// not advertise past the project's own record. Every other claim is
// CONDITIONAL on evidence read back off this page: the insert command
// is claimed only if its frame landed here, the engine rendering only
// if the engine answered "scene layer submitted", and the baked items
// only after their ids are found on this page's own geometry.

import { expect } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { withActivePage } from "../active-page";
import type { Bounds } from "../driver";
import { SWATCH } from "../names";
import {
  CONTENT_TOP_PT,
  ConsoleTap,
  headingAndCaption,
  labelFrame,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
} from "../plugin-support";
import type { PageContext, PageReport } from "../types";

const PANEL_ID = "media.paged.web.panel.source";
const INSERT_CMD = "media.paged.web.command.insertWebFrame";
const RENDER_CMD = "media.paged.web.command.renderWebFrame";
const BAKE_CMD = "media.paged.web.command.bakeWebFrame";

/** The web frame's page rectangle, `[top, left, bottom, right]` pt. */
const FRAME: Bounds = [CONTENT_TOP_PT, 72, 560, 540];

const HEADING = "HTML and CSS, placed on the page";

const CAPTION =
  "A web frame is a rectangle carrying a source envelope in document metadata. " +
  "The plugin lays the source out with a real browser engine, submits the paint as " +
  "an in-frame scene layer, and then bakes that paint down to native swatches, " +
  "rectangles and text frames so the result exports like anything else on this page.";

// Deliberately a layout that CANNOT be mistaken for a text frame doing
// the work: collapsed table borders, a striped body, a reversed header
// row and a rule drawn by a border rather than by a frame. If any of
// that reaches the page, CSS layout ran.
const HTML = [
  '<section class="sheet">',
  "  <h1>Spring line sheet</h1>",
  '  <p class="lede">Authored as HTML and CSS. Laid out by the engine, baked to native page items.</p>',
  "  <table>",
  "    <thead>",
  "      <tr><th>Style</th><th>Colourway</th><th>Retail</th></tr>",
  "    </thead>",
  "    <tbody>",
  "      <tr><td>Aster coat</td><td>Ink</td><td>420</td></tr>",
  "      <tr><td>Bellwether shirt</td><td>Chalk</td><td>145</td></tr>",
  "      <tr><td>Corbel trouser</td><td>Slate</td><td>190</td></tr>",
  "      <tr><td>Dovetail knit</td><td>Ochre</td><td>165</td></tr>",
  "    </tbody>",
  "  </table>",
  "</section>",
].join("\n");

const CSS = [
  "html, body { margin: 0; padding: 0; background: #ffffff; }",
  ".sheet { padding: 20px 22px; background: #f2efe8; border-left: 8px solid #1f3a5f; }",
  "h1 { font: 600 22px/1.25 sans-serif; margin: 0 0 6px; color: #1f3a5f; }",
  ".lede { font: 13px/1.5 sans-serif; margin: 0 0 16px; color: #4a4a4a; }",
  "table { border-collapse: collapse; width: 100%; }",
  "th, td { font: 12px/1.7 sans-serif; text-align: left; padding: 5px 10px; }",
  "thead th { background: #1f3a5f; color: #ffffff; }",
  "tbody tr:nth-child(even) td { background: #e4dfd3; }",
].join("\n");

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers = [
    "editor-shell.plugin-bundles",
    "plugin-platform.document-metadata",
    "plugin-web.source-model",
    "plugin-web.source-panel",
    "plugin-web.metadata-persistence",
    "frames-paths.frame.insert",
    "stories-text.text.insert",
    "stories-text.style-apply-range",
  ];

  elements.push(...(await headingAndCaption(doc, pageId, HEADING, CAPTION)));

  // ── 1. THE WEB FRAME ────────────────────────────────────────────
  //
  // The bundle's own "Insert web frame" command mints frame + envelope
  // as one undo step. It resolves its page as `meta.activePage ??
  // pages[0]`, so the module says which page is active for the duration
  // of the call (`withActivePage`) — otherwise a sixteen-page document
  // gets every plugin's work on page one.
  //
  // Then ASK where the frame landed rather than trusting that. If it is
  // not here, the stray is removed and the frame is authored on this
  // page instead, made a web frame through the panel's own "Make web
  // frame" affordance — the same `setMetadata` door the insert command
  // uses, reached from the user-facing surface — and the page does not
  // claim the insert command it could not use.
  const rectsBefore = await sceneRefs(page, "rectangle");
  await withActivePage(page, pageId, async () => {
    await doc.runCommand(INSERT_CMD);
    await settle(
      page,
      async () => (await newRefs(page, "rectangle", rectsBefore)).length > 0,
      8_000,
    );
  });
  const minted = await newRefs(page, "rectangle", rectsBefore);
  const { here, elsewhere } = await partitionByPage(page, minted, pageId);

  let frameId: string;
  if (here.length === 1 && elsewhere.length === 0) {
    frameId = here[0].id;
    covers.push("plugin-web.insert-command");
    await doc.mutate("resizeFrame", { frameId, bounds: FRAME });
  } else {
    if (elsewhere.length > 0) {
      await removeRefs(doc, elsewhere);
      notes.push(
        `insertWebFrame minted ${elsewhere.length} frame(s) on another page even with an ` +
          "active page supplied. Removed; the frame below was authored on this page and " +
          "made a web frame through the source panel instead, and " +
          "plugin-web.insert-command is NOT claimed by this page.",
      );
    } else {
      notes.push(
        "insertWebFrame minted no rectangle at all — the frame below was authored on this " +
          "page instead. plugin-web.insert-command is NOT claimed by this page.",
      );
    }
    frameId = await doc.rectangle(pageId, FRAME);
  }
  elements.push(frameId);

  // A stroke in the document's own accent, so the frame reads as a
  // placed object even on a lane where the engine never boots.
  await doc.designer.applyStroke(
    "rectangle",
    frameId,
    await doc.swatch(SWATCH.accent),
    1,
  );

  // ── 2. SOURCE — the panel, not a private door ───────────────────
  await doc.select("rectangle", frameId);
  await openPanel(page, PANEL_ID);

  // The panel resolves the selection into one of two lanes: a frame
  // that already carries an envelope opens the editors; one that does
  // not offers "Make web frame", which writes the envelope through
  // `host.document.setMetadata(selection[0], envelopeFor(source))` —
  // the plugin's own door, reached from its own surface. Wait for
  // whichever lane the panel chose rather than assuming one.
  const convert = page.locator("[data-web-make]");
  const html = page.locator("[data-web-html] [data-code-input]");
  await Promise.race([
    convert
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => undefined),
    html.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
  ]);
  if (await convert.isVisible().catch(() => false)) {
    await convert.click();
  }

  await expect(
    html,
    "the paged.web source panel mounted on the selection",
  ).toBeVisible({
    timeout: 10_000,
  });
  await html.fill(HTML);

  const css = page.locator("[data-web-css] [data-code-input]");
  await expect(css, "the CSS lane of the source panel").toBeVisible({
    timeout: 10_000,
  });
  await css.fill(CSS);

  // Preview is not persistence: only "Save to document" writes the
  // envelope, and the dirty flag clearing is the receipt.
  const commit = page.locator("[data-web-commit]");
  await expect(commit, "the source panel's commit affordance").toBeEnabled({
    timeout: 10_000,
  });
  await commit.click();
  await expect(page.locator("[data-web-dirty]")).toHaveAttribute(
    "data-web-dirty",
    "false",
    {
      timeout: 10_000,
    },
  );

  // ── 3. RENDER — the Blitz engine and the C-1 scene layer ────────
  const tap = new ConsoleTap(page, /(render|bake)WebFrame:|\[web\]/i);
  let rendered = false;
  let baked = 0;
  try {
    await doc.select("rectangle", frameId);
    await doc.runCommand(RENDER_CMD);
    const answered = await settle(
      page,
      () => tap.saw(/scene layer submitted/i) || tap.saw(/engine not loaded/i),
      25_000,
    );
    rendered = tap.saw(/scene layer submitted/i);
    if (!answered) {
      notes.push(
        "renderWebFrame never reported an outcome within 25s — neither " +
          `"scene layer submitted" nor "engine not loaded" reached the console (saw: ${tap.join() || "nothing"}).`,
      );
    } else if (rendered) {
      covers.push("plugin-web.engine-rendering");
    } else {
      notes.push(
        "the Blitz/WASM web engine did not load in this lane, so the web frame carries its " +
          "source but no rendered paint. plugin-web.engine-rendering is NOT claimed.",
      );
    }

    // The ADR-020 readout puts the outcome in the panel, not only the log.
    const readout = page.locator('[data-web-render-report="renderFrame"]');
    const readoutShown = await readout
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (readoutShown) covers.push("plugin-web.render-readout");

    // ── 4. BAKE — native content, so the page survives without us ──
    if (rendered) {
      const rectsPre = await sceneRefs(page, "rectangle");
      const framesPre = await sceneRefs(page, "textFrame");
      await doc.runCommand(BAKE_CMD);
      await settle(page, () => tap.saw(/bakeWebFrame:/i), 25_000);
      const bakedRects = await partitionByPage(
        page,
        await newRefs(page, "rectangle", rectsPre),
        pageId,
      );
      const bakedText = await partitionByPage(
        page,
        await newRefs(page, "textFrame", framesPre),
        pageId,
      );
      baked = bakedRects.here.length + bakedText.here.length;
      elements.push(
        ...bakedRects.here.map((r) => r.id),
        ...bakedText.here.map((r) => r.id),
      );
      if (bakedRects.elsewhere.length + bakedText.elsewhere.length > 0) {
        // The bake reads the frame's OWN page from elementGeometry, so
        // this should be unreachable; record it rather than assume.
        await removeRefs(doc, [
          ...bakedRects.elsewhere,
          ...bakedText.elsewhere,
        ]);
        notes.push(
          `bakeWebFrame put ${bakedRects.elsewhere.length + bakedText.elsewhere.length} ` +
            "native item(s) on another page; removed.",
        );
      }
      // The readout counts what the bake DEFERRED as well as what it
      // made — a bake that quietly dropped item kinds it cannot lower
      // would otherwise read as a clean success.
      const bakeReadout = await page
        .locator('[data-web-render-report="bake"]')
        .innerText()
        .catch(() => "");
      if (bakeReadout) {
        notes.push(`bake readout: ${bakeReadout.replace(/\s+/g, " ").trim()}`);
      }
      if (baked === 0) {
        notes.push(
          "bakeWebFrame produced no native page items on this page — the frame renders " +
            "live but does not yet survive an export without the plugin.",
        );
      }
    } else {
      notes.push(
        "bake skipped: the bake needs the same engine the render could not load.",
      );
    }
  } finally {
    tap.stop();
  }

  // ── 5. THE RUNNING COMMENTARY ───────────────────────────────────
  const status = rendered
    ? `Rendered by the web engine and baked to ${baked} native page item${baked === 1 ? "" : "s"}. ` +
      "The bake is what carries this block into showcase.idml and into a PDF: after it, " +
      "nothing here needs the plugin to draw."
    : "The web engine did not load in this lane, so the frame above carries its committed " +
      "HTML and CSS source in document metadata but no rendered paint. The source " +
      "round-trips with the file; a lane with the engine renders and bakes it.";
  elements.push(await labelFrame(doc, pageId, [572, 72, 660, 540], status));

  return {
    title: "paged.web — HTML and CSS as placed content",
    covers,
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
