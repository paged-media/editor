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

// Data sets & the refresh (p113, E-Data recto).
//
// The card on p110 is the instrument this page plays. Its three fields
// are re-resolved against a chosen record through the bindings panel's
// preview stepper; captured as named DATA SETS through the two
// payload-carrying commands (captureDataSet / applyDataSet — commands,
// not just panel buttons, so a host-side loop can drive batch output);
// flipped to another record's captured values in ONE undo step; held
// through a data refresh (an applied set marks its bindings Overridden
// — the refresh must not clobber it); and put back. Every value in the
// ledger below was READ from the live placeholder door at that step,
// not scripted.
//
// This module runs BEFORE any barcode or table binding exists, on
// purpose: the stepper previews EVERY binding through the normal lower
// lanes, and for frame-bound kinds a preview commits fresh geometry —
// stepping with only variable bindings alive updates fields in place
// and mints nothing.
//
// RECIPE FROM: tests/journey/plugins/data-preview.journey.spec.ts (the
// stepper + change report) and data-dataset.journey.spec.ts (palette,
// locale).

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  BINDINGS_PANEL,
  DATASET_PANEL,
  DATA_CMD,
  chapterData,
  fieldValue,
  invokeFor,
} from "./00-support";

const SET_BASELINE = "Order 1001 — as imported";
const SET_OTHER = "Order 1003 — Kettner";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(113);
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [48, 54, 480, 84], [
    { text: "Data sets and the refresh", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg, [48, 90, 480, 192], [
    {
      text:
        "A binding is live in both directions: the record card three pages " +
        "back can be re-resolved against any record, and the values it " +
        "shows at a moment can be captured as a named data set and applied " +
        "back later — many fields, one undo step. The ledger below is this " +
        "page's lab notebook: each line was read from the document's own " +
        "placeholder door at that step of the drive, and the card was left " +
        "as the chapter found it.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const ledger: string[] = [];
  let stepperLine =
    "The preview stepper and the data-set palette were not driven — the " +
    "query engine never reached ready on this lane.";
  let changeLine = "";
  let localeLine = "";

  const fields = chapterData.cardFields;
  if (chapterData.ready && fields.length > 0) {
    const customer = fields.find((f) => f.column === "customer")?.binding;
    const price = fields.find((f) => f.column === "unit_price")?.binding;
    const readPair = async (): Promise<string> => {
      const c = customer ? await fieldValue(page, customer) : null;
      const u = price ? await fieldValue(page, price) : null;
      return `customer = ${c ?? "∅"} · unit_price = ${u ?? "∅"}`;
    };
    // The panel's stepper fires an UNAWAITED async re-resolve per
    // binding, so a read taken at the position flip can catch one field
    // updated and the next still in flight (this page measured a price
    // lagging one record behind its customer). Read until two
    // consecutive samples agree.
    const stablePair = async (): Promise<string> => {
      let prev = await readPair();
      for (let i = 0; i < 10; i += 1) {
        await page.waitForTimeout(600);
        const next = await readPair();
        if (next === prev) return next;
        prev = next;
      }
      return prev;
    };

    // ── the preview stepper ─────────────────────────────────────────
    await openPanel(page, BINDINGS_PANEL);
    const jump = page
      .locator('[data-testid="preview-stepper"]')
      .locator('input[type="number"]');
    const position = page.locator('[data-testid="preview-position"]');
    try {
      await expect(jump, "the record-preview stepper mounted").toBeVisible({
        timeout: 120_000,
      });
      await jump.fill("3");
      await expect(position, "the stepper reports its of-N bound").toHaveText(
        /3 \/ 48/,
        { timeout: 30_000 },
      );
      const atThree = await stablePair();
      stepperLine =
        "Stepped to record 3 of 48 — the engine re-resolved every binding " +
        `against that record and the card read ${atThree}.`;
      covers.push("data.bind.preview-step");

      // ── the change report (the first one IS the baseline) ─────────
      await page.getByRole("button", { name: /what changed\?/i }).click();
      const report = page.locator('[data-testid="change-report"]');
      if (
        await report
          .waitFor({ state: "visible", timeout: 120_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const headline = (await report.locator("strong").innerText()).trim();
        changeLine =
          `Asked “what changed since last sync?” — the panel answered “${headline}”: ` +
          "a first report is the baseline, so every binding arrives as added; " +
          "the data itself has not moved.";
        covers.push("data.bind.change-report");
      } else {
        notes.push(
          "the change report never rendered — refreshDiff answered nothing.",
        );
      }

      // Back to record 1 before capturing the baseline set.
      await jump.fill("1");
      await expect(position).toHaveText(/1 \/ 48/, { timeout: 30_000 });
    } catch (err) {
      stepperLine =
        "The preview stepper did not settle on this lane — the data-set " +
        "exhibit below still ran; the run notes carry the miss.";
      notes.push(`the stepper drive failed: ${String(err).slice(0, 200)}`);
    }

    // ── data sets: capture ×2, apply, refresh, apply back ───────────
    const cap1 = await invokeFor<string[]>(page, `${DATA_CMD}.captureDataSet`, {
      name: SET_BASELINE,
      record: 0,
    });
    const cap2 = await invokeFor<string[]>(page, `${DATA_CMD}.captureDataSet`, {
      name: SET_OTHER,
      record: 2,
    });
    ledger.push(
      `captured “${SET_BASELINE}” (record 1) — ${cap1.length} variable(s)`,
      `captured “${SET_OTHER}” (record 3) — ${cap2.length} variable(s)`,
      `before apply · ${await stablePair()}`,
    );

    const applied = await invokeFor<{
      applied: number;
      skipped: Record<string, string>;
    }>(page, `${DATA_CMD}.applyDataSet`, { name: SET_OTHER });
    const afterApply = await readPair();
    const skipCount = Object.keys(applied.skipped).length;
    ledger.push(
      `apply “${SET_OTHER}” → ${applied.applied} written in ONE undo step · ` +
        `skips: ${skipCount === 0 ? "none" : Object.keys(applied.skipped).join(", ")}`,
      `after apply · ${afterApply}`,
    );
    if (applied.applied > 0) covers.push("data.dataset.palette");

    // The refresh: re-run the queries (the resolveBindings command),
    // then the field-refresh loop — an applied set is Overridden and a
    // refresh must not clobber it. Measured, then printed as measured.
    await doc.runCommand(`${DATA_CMD}.resolveBindings`);
    await openPanel(page, BINDINGS_PANEL);
    await page.getByRole("button", { name: /^refresh fields$/i }).click();
    await page.waitForTimeout(1_500);
    const afterRefresh = await readPair();
    ledger.push(
      afterRefresh === afterApply
        ? "refresh from sources → the fields KEPT the applied set (Overridden " +
            "honored — a refresh never clobbers what a designer pinned)"
        : `refresh from sources → the fields moved to ${afterRefresh} — the ` +
            "refresh loop re-resolved Overridden fields back to the live " +
            "record; recorded as measured",
    );
    if (afterRefresh !== afterApply) {
      notes.push(
        "refreshFields overwrote an applied data set's values — the " +
          "Overridden sync state did not hold through the field-refresh " +
          "loop on this lane (the palette's own apply path documents the " +
          "opposite intent).",
      );
    }

    const restored = await invokeFor<{
      applied: number;
      skipped: Record<string, string>;
    }>(page, `${DATA_CMD}.applyDataSet`, { name: SET_BASELINE });
    ledger.push(
      `apply “${SET_BASELINE}” → ${restored.applied} written · ${await readPair()}`,
    );

    // ── the locale probe (measured, claimed only if it moves) ───────
    try {
      await openPanel(page, DATASET_PANEL);
      const localePick = page
        .locator("select")
        .filter({ has: page.locator('option[value="de"]') })
        .first();
      if (!(await localePick.isVisible().catch(() => false))) {
        throw new Error("the dataset panel's locale picker never mounted");
      }
      const before = price ? await fieldValue(page, price) : null;
      await localePick.selectOption("de");
      await openPanel(page, BINDINGS_PANEL);
      await jump.fill("1");
      await page.waitForTimeout(1_200);
      const inGerman = price ? await fieldValue(page, price) : null;
      await openPanel(page, DATASET_PANEL);
      await localePick.selectOption("en");
      await openPanel(page, BINDINGS_PANEL);
      await jump.fill("1");
      await page.waitForTimeout(1_200);
      if (inGerman !== null && before !== null && inGerman !== before) {
        localeLine =
          `Locale en → de re-rendered the price field ${before} → ${inGerman} ` +
          "and back — the §9.1 display formatting is a session locale, not " +
          "a re-import.";
        covers.push("data.i18n.display");
      } else {
        localeLine =
          "Locale en → de left the bare-column price display unchanged " +
          `(${before ?? "∅"}) — a bare field reference renders the raw ` +
          "value; only the NUMBER/CURRENCY/PERCENT/DATEFMT format family " +
          "consults the locale, and the expression page ahead drives that " +
          "family. Measured, so said.";
      }
    } catch (err) {
      notes.push(`the locale probe did not run: ${String(err).slice(0, 160)}`);
    }
  }

  const stepper = await proseFrame(ctx, pg, [48, 204, 480, 262], [
    { text: stepperLine, style: STYLE.bodySmall },
  ]);
  elements.push(stepper.frameId);

  if (ledger.length > 0) {
    const ledgerFrame = await proseFrame(
      ctx,
      pg,
      [48, 274, 480, 452],
      ledger.map((text) => ({ text, style: STYLE.codeBlock })),
    );
    elements.push(ledgerFrame.frameId);
  }
  if (changeLine) {
    const change = await proseFrame(ctx, pg, [48, 464, 480, 520], [
      { text: changeLine, style: STYLE.bodySmall },
    ]);
    elements.push(change.frameId);
  }
  if (localeLine) {
    const locale = await proseFrame(ctx, pg, [48, 530, 480, 596], [
      { text: localeLine, style: STYLE.bodySmall },
    ]);
    elements.push(locale.frameId);
  }

  elements.push(
    await marginNote(
      ctx,
      pg,
      "The price-band RULE this page planned (D-13: a data condition " +
        "applying a named cell style through the engine's evaluate_rule and " +
        "the minted rule cell style) is engine-shipped but has no editor " +
        "surface — the bindings panel authors variable, image and barcode " +
        "kinds only, so no rule binding can be defined here and none is " +
        "faked. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 180",
      "preview stepper (resolve_at, of-N bound)",
      "captureDataSet / applyDataSet — payload commands",
      "refresh: resolveBindings + refreshFields, measured",
      "change report baseline · locale probe",
    ]),
  );

  return {
    title: "Data sets and the refresh",
    covers,
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
