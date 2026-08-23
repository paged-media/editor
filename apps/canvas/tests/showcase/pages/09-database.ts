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

// Spread 09 — paged.data: governed data published into the layout.
//
// THE FLOW THIS PAGE DRIVES, end to end through the real editor host:
//
//   register a CSV source  →  add a query  →  map its columns to
//   bindings  →  refreshData()  →  lower the bindings into the document
//
// A CSV goes in through the sources panel's host file-picker door; the
// session boots the vendored DuckDB-WASM engine (~36 MiB, a pthread
// Worker) and registers the table. The field-mapping wizard asks the
// Rust engine for each column's binding EXPRESSION — the bundle never
// decides the mapping — and the confirmed columns become variable
// bindings. `refreshData()` re-runs the query; "Lower to document"
// resolves every binding and commits it as native Paged mutations.
//
// WHAT REACHES THE PAGE — all three bound kinds, each placed a
// different way, which is the point:
//
//   · a bound VARIABLE — the D-01 lane: a tagged `placeholder` FIELD
//     (protocol v43) carrying the engine-resolved display. It is placed
//     at the TEXT CARET, first in `variableInsertionPoint`'s precedence
//     and the only lane that carries a story id end to end (the
//     selected-frame lane re-derives one by hit-testing the ACTIVE page
//     at the frame's centre, which is a different question). The caret
//     is the C-9 read door — `plugin-platform.text-caret-door`.
//   · a bound TABLE — a native Paged table, one row per record. The
//     plugin mints its frame at a fixed 36pt page inset
//     (`defaultPlacement`), so the module translates it into the slot
//     the page laid out. Same page, ordinary layout.
//   · a bound BARCODE — Code-128, encoded clean-room in Rust and drawn
//     as native `insertPath` filled rects scaled to the bound frame's
//     content box. Real page geometry, not an image: no asset store, no
//     resolution.
//
// WHERE THEY LAND. `data-bundle/src/lower.ts` resolves its target page
// as `meta.activePage ?? pages[0]`, and both the table's frame and the
// barcode's modules take their PAGE from there (the barcode takes only
// its ORIGIN from the bound rectangle). The module therefore supplies
// the active page around each lowering — and around the whole of it,
// because the panel's button hands off to an async session call and
// returns long before the writes land. It then reads back where every
// created item actually is and claims only what is on this page.
//
// RECIPE FROM: `tests/journey/plugins/data-render.journey.spec.ts`
// (import → wire → lower → render), `data.journey.spec.ts` (the honest
// DuckDB degrade) and `data-barcode.journey.spec.ts` (symbology + the
// `{v, data}` envelope — `{v, payload}` is rejected by the host gate and
// sinks the whole enclosing batch in silence, which is why that spec
// exists).

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../fidelity/canvas-driver";
import { withActivePage } from "../active-page";
import type { Bounds } from "../driver";
import { STYLE, SWATCH } from "../names";
import {
  ConsoleTap,
  geometryOf,
  headingAndCaption,
  labelFrame,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
  type Ref,
} from "../plugin-support";
import type { PageContext, PageReport } from "../types";

const CSV_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/data-people.csv",
);

const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const IMPORT_CMD = "media.paged.data.command.importData";

/** The CSV's first column — the field both the variable and the barcode
 *  bind to. Spelled once; `data-people.csv` is `name,role`. */
const BOUND_COLUMN = "name";
/** The column left UNCHECKED in the mapping wizard, so the record card
 *  carries exactly one field and stays readable. */
const UNMAPPED_COLUMN = "role";

const CARD: Bounds = [204, 72, 244, 300];
const BARCODE_BOX: Bounds = [204, 330, 316, 540];
/** Where the lowered table is translated to; the plugin mints it at a
 *  fixed 36pt page inset, which is the corner. */
const TABLE_SLOT: Bounds = [364, 72, 560, 540];
/** A frame that exists only to hold the caret for the second lowering
 *  pass, so the demo wiring's empty-expression variable lands somewhere
 *  disposable instead of in the record card. */
const THROWAWAY: Bounds = [730, 72, 760, 300];
const STATUS_SLOT: Bounds = [576, 72, 716, 540];

const HEADING = "Publishing from a database";

const CAPTION =
  "A CSV registers through the plugin's DuckDB query engine, its columns become " +
  "bindings with engine-authored expressions, and the resolved values lower into " +
  "the document as native content. The field below is live: it re-resolves against " +
  "the data rather than being pasted in as text.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers = [
    "editor-shell.plugin-bundles",
    "frames-paths.frame.insert",
    "stories-text.text.insert",
    "stories-text.style-apply-range",
  ];

  elements.push(...(await headingAndCaption(doc, pageId, HEADING, CAPTION)));

  // The receiving furniture, authored here: the plugin decides WHAT to
  // lower, the page decides where its own frames sit.
  elements.push(
    await labelFrame(
      doc,
      pageId,
      [180, 72, 200, 300],
      "Bound variable — the record's name",
    ),
    await labelFrame(
      doc,
      pageId,
      [180, 330, 200, 540],
      "Bound barcode — Code-128, as vector modules",
    ),
    await labelFrame(
      doc,
      pageId,
      [340, 72, 360, 540],
      "Bound table — one row per record",
    ),
  );
  const cardId = await doc.textFrame(pageId, CARD);
  elements.push(cardId);
  const cardStory = await doc.storyOf(pageId, CARD);

  const barcodeFrame = await doc.rectangle(pageId, BARCODE_BOX);
  elements.push(barcodeFrame);
  await doc.designer.applyStroke(
    "rectangle",
    barcodeFrame,
    await doc.swatch(SWATCH.accent),
    1,
  );

  const tap = new ConsoleTap(page, /\[data\]|barcode|lower:|variable "/i);
  let engineNote =
    "The DuckDB-WASM query engine did not boot in this lane, so nothing was published.";
  try {
    // ── 1. REGISTER A SOURCE ────────────────────────────────────────
    // The import goes through the host file-picker door
    // (`shell.pickFile@1`): the panel's button fires a programmatic
    // input.click(), which Playwright answers as a filechooser.
    await doc.runCommand(IMPORT_CMD);
    await openPanel(page, SOURCES_PANEL);
    const importButton = page.locator("[data-data-import-csv]");
    await expect(
      importButton,
      "the paged.data sources panel mounted",
    ).toBeVisible({
      timeout: 15_000,
    });
    const chooser = page.waitForEvent("filechooser");
    await importButton.click();
    await (await chooser).setFiles(CSV_FIXTURE);

    const status = page.locator("[data-status]").last();
    const ready = await settle(
      page,
      async () =>
        (await status.getAttribute("data-status").catch(() => null)) ===
        "ready",
      60_000,
    );

    if (!ready) {
      const got =
        (await status.getAttribute("data-status").catch(() => null)) ??
        "unknown";
      notes.push(
        `the CSV source never reached "ready" (engine status "${got}"): the vendored ` +
          "DuckDB-WASM dist is absent or this context is not cross-origin isolated. " +
          "No query ran, no binding resolved, and this page claims no data rows.",
      );
      elements.push(await labelFrame(doc, pageId, STATUS_SLOT, engineNote));
      return {
        title: "paged.data — publishing from a database",
        covers: [...new Set(covers)],
        elements,
        notes,
      };
    }
    covers.push("plugin-platform.file-picker");
    await expect(page.getByText(/data_people/).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 2. QUERY + BINDINGS ─────────────────────────────────────────
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bind-author]")).toBeVisible({
      timeout: 15_000,
    });

    // The field-mapping wizard adds the query (`SELECT * FROM
    // data_people`), refreshes it, and asks the ENGINE for each column's
    // suggested binding EXPRESSION — the bundle never decides the
    // mapping. Unchecking a column leaves the record card carrying one
    // field, which is what makes it readable in print.
    await page.getByRole("button", { name: /map fields/i }).click();
    const wizard = page.locator('[data-testid="wizard-columns"]');
    await expect(
      wizard,
      "the field-mapping wizard listed the source's columns",
    ).toBeVisible({ timeout: 20_000 });
    const unmapped = wizard
      .locator("label")
      .filter({ hasText: new RegExp(UNMAPPED_COLUMN, "i") })
      .locator('input[type="checkbox"]');
    if ((await unmapped.count()) > 0) await unmapped.first().uncheck();
    await page.locator('[data-testid="wizard-confirm"]').click();
    covers.push("data.bind.field-mapping");

    // A BARCODE binding through the panel's authoring flow: pick the
    // kind, pick the symbology, name the field to encode, bind it to the
    // selected rectangle. The engine encodes Code-128 clean-room in Rust
    // and scales the module grid to that frame's content box.
    await doc.select("rectangle", barcodeFrame);
    await page.locator("[data-data-bind-kind]").selectOption("barcode");
    const symbology = page
      .locator("select")
      .filter({ has: page.locator('option[value="code128"]') })
      .first();
    await expect(
      symbology,
      "the symbology picker appears once the kind is barcode",
    ).toBeVisible({ timeout: 10_000 });
    await symbology.selectOption("code128");
    await page.locator("[data-data-bind-field]").fill(BOUND_COLUMN);
    await page.locator("[data-data-bind-add]").click();
    covers.push("data.bind.authoring");

    // ── 3. REFRESH + LOWER, PASS ONE ────────────────────────────────
    // Two things decide where lowered content lands, and the module
    // supplies both: the ACTIVE PAGE (which `commitLoweredBarcode` and
    // `commitLoweredTable` resolve their page from) and the TEXT CARET
    // (which the D-01 variable lane resolves its story from, first in
    // `variableInsertionPoint`'s precedence). The active page has to
    // stay set until the lowering FINISHES, not just until the click
    // returns — the panel's button hands off to an async session call.
    const polysBefore = await sceneRefs(page, "polygon");
    const framesBefore = await sceneRefs(page, "textFrame");
    await withActivePage(page, pageId, async () => {
      await doc.designer.placeCaret(cardStory, 0);
      await page.getByRole("button", { name: /^refresh data$/i }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: /^lower to document$/i }).click();
      await settle(
        page,
        async () => (await doc.storyChars(cardStory)) > 0,
        20_000,
      );
      await page.waitForTimeout(500);
    });
    covers.push("data.bind.engine");

    const passOnePolys = await partitionByPage(
      page,
      await newRefs(page, "polygon", polysBefore),
      pageId,
    );
    const passOneFrames = await partitionByPage(
      page,
      await newRefs(page, "textFrame", framesBefore),
      pageId,
    );

    // ── 4. THE TABLE BINDING, PASS TWO ──────────────────────────────
    // A table binding has no authoring path — the kind picker offers
    // variable / image / barcode only — so the panel's one-click demo
    // wiring is the only way to define one. It also defines a SECOND
    // variable binding with an EMPTY expression, which resolves to an
    // error token and would land wherever the caret is. So the caret is
    // parked in a throwaway frame for this pass and the frame is thrown
    // away after it, leaving the record card above untouched.
    //
    // Re-lowering also re-draws the barcode, exactly on top of the first
    // set; those duplicate modules are removed below.
    const throwaway = await doc.textFrame(pageId, THROWAWAY);
    const throwawayStory = await doc.storyOf(pageId, THROWAWAY);
    const beforeTableFrames = await sceneRefs(page, "textFrame");
    const beforeTablePolys = await sceneRefs(page, "polygon");
    await withActivePage(page, pageId, async () => {
      await doc.designer.placeCaret(throwawayStory, 0);
      await page.getByRole("button", { name: /wire demo binding/i }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: /^lower to document$/i }).click();
      await settle(
        page,
        async () =>
          (await newRefs(page, "textFrame", beforeTableFrames)).length > 0,
        20_000,
      );
      await page.waitForTimeout(500);
    });

    const passTwoFrames = await partitionByPage(
      page,
      await newRefs(page, "textFrame", beforeTableFrames),
      pageId,
    );
    const passTwoPolys = await partitionByPage(
      page,
      await newRefs(page, "polygon", beforeTablePolys),
      pageId,
    );

    // ── 5. CLEAN UP AND PLACE ───────────────────────────────────────
    // The duplicate barcode + the throwaway caret frame go; anything a
    // lowering put on ANOTHER page goes too, with a note, rather than
    // being left on a spread that belongs to a different module.
    const stray: Ref[] = [
      ...passOnePolys.elsewhere,
      ...passTwoPolys.elsewhere,
      ...passOneFrames.elsewhere,
      ...passTwoFrames.elsewhere,
      ...passTwoPolys.here,
      { kind: "textFrame", id: throwaway },
    ];
    await removeRefs(doc, stray);
    if (
      passOnePolys.elsewhere.length + passTwoFrames.elsewhere.length > 0 ||
      passOneFrames.elsewhere.length > 0
    ) {
      notes.push(
        "some lowered content landed on another page and was removed — the plugin " +
          "resolves its page as `meta.activePage ?? pages[0]`, and the active page this " +
          "module supplied did not reach it.",
      );
    }

    // The bound TABLE — the plugin places it at a fixed 36pt inset
    // (`defaultPlacement`), which is the page corner, so the module
    // translates it into the slot the page laid out for it. A move
    // within one page is ordinary layout; it is the only kind of move
    // there is.
    const tableFrames = passTwoFrames.here.filter((r) => r.id !== throwaway);
    if (tableFrames.length > 0) {
      const [geo] = await geometryOf(page, [tableFrames[0]]);
      if (geo?.bounds) {
        const [top, left, bottom, right] = geo.bounds;
        const dy = TABLE_SLOT[0] - top;
        const dx = TABLE_SLOT[1] - left;
        await doc.mutate("resizeFrame", {
          frameId: tableFrames[0].id,
          bounds: [top + dy, left + dx, bottom + dy, right + dx],
        });
      }
      elements.push(...tableFrames.map((r) => r.id));
      covers.push("tables.model");
      if (tableFrames.length > 1) {
        await removeRefs(doc, tableFrames.slice(1));
        notes.push(
          `the table lowering left ${tableFrames.length} frames on this page; the extra ` +
            "ones were removed.",
        );
      }
    } else {
      notes.push(
        "the bound table lowered no frame onto this page — `commitLoweredTable` places " +
          "at `defaultPlacement(activePageId(host), …)` and did not resolve to this page.",
      );
    }

    // The bound VARIABLE — the D-01 placeholder field.
    const cardChars = await doc.storyChars(cardStory);
    if (cardChars > 0) {
      // The resolved value in the card is the evidence for BOTH the
      // expression DSL (the engine evaluated the wizard's `name`
      // reference against a record) and the caret door that told the
      // plugin where to put the field.
      covers.push(
        "data.expr.engine",
        "plugin-platform.text-caret-door",
        "stories-text.fields.insert",
      );
      await doc.applyStyle(
        cardStory,
        0,
        cardChars,
        await doc.paragraphStyle(STYLE.body),
        "paragraph",
      );
      engineNote =
        "The name above is a tagged placeholder field, not pasted text: the engine " +
        "resolved it from the CSV through DuckDB and a data refresh re-resolves it in " +
        "place. ";
    } else {
      notes.push(
        "the bound variable resolved but no field reached the record card — " +
          "`document.placeholders@1` is unsupported, or the caret door answered null.",
      );
      engineNote =
        "The bound variable resolved but its field did not reach the card on this lane. ";
    }

    // The bound BARCODE — native vector modules, not an image.
    if (passOnePolys.here.length > 0) {
      covers.push("data.barcode.symbology", "frames-paths.path.insert");
      elements.push(...passOnePolys.here.map((r) => r.id));
      engineNote +=
        `The barcode is ${passOnePolys.here.length} native filled paths scaled to its ` +
        "frame — real page geometry, so it stays sharp at any output resolution and " +
        "needs no asset store. The table below it is a native Paged table, one row per " +
        "record.";
    } else {
      notes.push(
        "the barcode binding drew no vector modules on this page — the encoder resolved " +
          `no value for "${BOUND_COLUMN}", or the insertPath batch was rejected (the ` +
          "`{v, data}` metadata envelope is the historic cause; `{v, payload}` sinks the " +
          `whole atomic batch in silence). Plugin log: ${tap.join() || "nothing"}`,
      );
      engineNote += "The barcode binding drew nothing on this lane.";
    }

    const statusText = (
      await page.locator("[data-status]").last().innerText()
    ).trim();
    if (statusText) {
      notes.push(`paged.data session status after lowering: ${statusText}`);
    }
  } finally {
    tap.stop();
  }

  elements.push(await labelFrame(doc, pageId, STATUS_SLOT, engineNote));

  return {
    title: "paged.data — publishing from a database",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
