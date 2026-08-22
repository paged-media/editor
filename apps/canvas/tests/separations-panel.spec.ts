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

// §21 advanced prepress — Separations & Ink Limit panel acceptance.
//
// The panel carries TWO readings that fail for different reasons, and
// every test here exists to keep them apart:
//
//  * the SWATCH lane is exact palette arithmetic
//    (`SwatchSummary.totalAreaCoveragePct`) and needs no profile, no
//    render and no resolution;
//  * the PLATE lane is the rendered `inkCoverage` collection.
//
// One thing was MEASURED here rather than assumed, and it is the
// opposite of what the panel's own prose leads you to expect: no CMYK
// profiles ship bundled (see `color-settings-panel.tsx` — the ECI
// artefacts are licence-gated), yet `separationAvailable` comes back
// TRUE for the generated fixtures and Black reports real area. A named
// working profile is what the CHROMATIC plates need; K decomposes
// without one. So the plate lane IS exercised here (AC-SEP-4) and the
// no-profile branch is the one this suite cannot reach — it needs a
// registered .icc, which is a Color Settings fixture, not this file's.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  openCanvas,
  loadIdml,
  cmykProfileAvailable,
} from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

type Handle = {
  client: {
    mutate: (op: unknown) => Promise<unknown>;
  };
  setMode: (m: string) => void;
};

async function openSeparations(page: import("@playwright/test").Page) {
  // Prepress mode docks Separations on the RIGHT, where panels are
  // tabs — Ink Manager is first, so the mode switch alone leaves this
  // one behind it. Raise it explicitly.
  await page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          setMode: (m: string) => void;
          openPanel: (id: string) => void;
        };
      }
    ).__canvas;
    c.setMode("prepress");
  });
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { openPanel: (id: string) => void } }
    ).__canvas.openPanel("paged.separations");
  });
  await expect(page.locator("[data-separations-panel]")).toBeVisible();
}

/** Mint a process CMYK swatch whose channels sum to `c+m+y+k` percent. */
async function mintCmyk(
  page: import("@playwright/test").Page,
  name: string,
  value: [number, number, number, number],
) {
  await page.evaluate(
    async ([n, v]) => {
      const c = (globalThis as unknown as { __canvas: Handle }).__canvas;
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: n as string,
            space: "CMYK",
            value: v as number[],
            model: "Process",
          },
        },
      });
    },
    [name, value] as const,
  );
}

test.describe("§21 — Separations & Ink Limit panel", () => {
  test("AC-SEP-1 — a rich black over the press limit is named, with its exact coverage @feat:editor-shell.panels.separations @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openSeparations(page);

    // A plain fixture carries no over-limit ink.
    await expect(
      page.locator('[data-status-pill="swatch-limit-state"]'),
    ).toHaveText("Within limit");

    // 80+70+70+100 = 320% — over every preset in the list.
    await mintCmyk(page, "Rich Black 320", [80, 70, 70, 100]);

    const row = page.locator("[data-swatch-over-limit]").filter({
      hasText: "Rich Black 320",
    });
    await expect(row).toBeVisible();
    // Exact palette arithmetic — not a sampled estimate.
    await expect(row).toContainText("320%");
    await expect(
      page.locator('[data-status-pill="swatch-limit-state"]'),
    ).toHaveText("1 over");
  });

  test("AC-SEP-2 — changing the press preset re-thresholds the stored reading, with no re-render @feat:editor-shell.panels.separations @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openSeparations(page);

    // 270% sits BETWEEN the presets: within sheet-fed coated (300),
    // over uncoated (260) and newsprint (240). That is what makes it
    // a threshold test rather than a "does it filter" test.
    await mintCmyk(page, "Between 270", [70, 60, 60, 80]);

    const row = page.locator("[data-swatch-over-limit]").filter({
      hasText: "Between 270",
    });

    // Default limit is 300 → within.
    await expect(row).toHaveCount(0);
    await expect(
      page.locator('[data-status-pill="swatch-limit-state"]'),
    ).toHaveText("Within limit");

    await page.locator('[data-ink-limit-preset="260"]').click();
    await expect(page.locator('[data-ink-limit-preset="260"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(row).toBeVisible();

    // Back up again — the reading is re-read, not re-measured, so it
    // returns to exactly the prior state.
    await page.locator('[data-ink-limit-preset="300"]').click();
    await expect(row).toHaveCount(0);
  });

  test("AC-SEP-3 — swatches with no ink decomposition are counted, never silently treated as ink-free @feat:editor-shell.panels.separations @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openSeparations(page);

    // An RGB swatch separates at the RIP against the output intent, so
    // its ink limit is unknowable here. The panel must SAY so.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: Handle }).__canvas;
      await c.client.mutate({
        op: "createSwatch",
        args: {
          spec: {
            name: "Screen RGB",
            space: "RGB",
            value: [10, 120, 240],
            model: "Process",
          },
        },
      });
    });

    const note = page.locator("[data-swatch-unseparable]");
    await expect(note).toBeVisible();
    await expect(note).toContainText("separate at the RIP");
    // It is NOT reported as a limit violation.
    await expect(
      page.locator('[data-status-pill="swatch-limit-state"]'),
    ).toHaveText("Within limit");
  });

  test("AC-SEP-4 — the plate lane reports the job's plates and a per-page reading that jumps to its page @feat:editor-shell.panels.separations @level:happy", async ({
    page,
  }) => {
    // Everything below describes a document with a CMYK working profile
    // ACTIVE. The profile the driver registers is read from an Adobe
    // installation directory, which exists on a designer's Mac and on no
    // CI runner, and FOGRA39 is ECI-licensed so it cannot be committed
    // to make that uniform. Without this guard the test asserted "an
    // Adobe install is present" as though it were editor behaviour, and
    // failed every CI run for it while passing on the machine it was
    // written on. AC-SEP-1..3 and AC-SEP-5 cover the panel's
    // profile-independent behaviour and still run everywhere.
    test.skip(
      !cmykProfileAvailable(),
      "no CMYK working profile on this machine — the plate lane has nothing to separate",
    );
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openSeparations(page);

    // Measured: this fixture's designmap declares FOGRA39 and the editor
    // has it registered, so a CMYK working profile IS active and Black is
    // the only plate carrying area. The "activate a profile" affordance
    // must therefore not be showing.
    await expect(page.locator("[data-separations-unavailable]")).toHaveCount(0);
    await expect(page.locator("[data-separations-no-plates]")).toHaveCount(0);

    const black = page.locator('[data-job-plate="black"]');
    await expect(black).toBeVisible();
    await expect(black).toContainText("process");
    // Empty plates are excluded from the job list — a plate nothing
    // uses is not a plate the operator has to hang.
    await expect(page.locator('[data-job-plate="cyan"]')).toHaveCount(0);

    // One reading per page, and clicking one navigates to it.
    const rows = page.locator("[data-page-coverage]");
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    // The caveat is the honesty rule for every number above it: a low
    // "measured" share means the page reading describes only part of
    // the page — it does NOT mean the page is ink-free.
    const caveat = page.locator("[data-separations-caveat]");
    await expect(caveat).toContainText("unknown here, not ink-free");
    await expect(caveat).toContainText("72 dpi");
  });

  test("AC-SEP-5 — the plate-preview seam names what the canvas cannot do and what ships instead @feat:editor-shell.panels.separations @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openSeparations(page);

    // Isolating a plate on the canvas is NOT wired (Vello keeps no
    // page-level ink-plane state). The panel must not imply otherwise,
    // and must point at the lane that does work.
    const seam = page.locator("[data-separations-preview-seam]");
    await expect(seam).toBeVisible();
    await expect(seam).toContainText("not wired");
    await expect(seam).toContainText("paged-inspect --separations");
  });
});
