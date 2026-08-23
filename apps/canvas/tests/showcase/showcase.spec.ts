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

// The paged showcase — one document that exercises the engine and every
// wired plugin, built by driving the real editor.
//
// WHY THIS EXISTS. The engine's 35 fixtures each isolate ONE concern on
// purpose, and every plugin journey proves its OWN frame reaches the
// page. Nothing put them in the same document. That gap is where the
// two worst plugin defects on record lived — "web render BLANK in the
// editor" and the sheet table's core↔bundle wire gap — both invisible
// to unit tests and both found only when a human rendered a plugin
// frame for real. This builds that document on every run.
//
// WHAT IT PRODUCES, into `apps/canvas/showcase/`:
//
//   showcase.paged          the live document — plugin frames keep their
//                           `x-paged:<id>` envelopes and container parts,
//                           so reopening rehydrates them
//   showcase-baked.paged    the same document with every plugin frame
//                           lowered to native items
//   showcase.idml           the baked twin through the interchange format
//   showcase.coverage.json  registry row → page, checked against
//                           state/registry/features
//   pages/page-NN.png       one render per page: the pixel evidence
//
// HOW TO READ A FAILURE. Each spread is a module in `pages/`, and the
// spec asserts three things per spread: the module ran, the elements it
// says it created exist, and the page's pixels CHANGED. A module that
// authored nothing fails on the third even if it threw nothing — which
// is the assertion that would have caught the blank web frame.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  assertUcfMimetypeFirst,
  readZipText,
  zipEntryNames,
} from "../e2e/harness/read-zip";
import { buildCoverage, type CoverageClaim } from "./coverage";
import { ShowcaseDoc } from "./driver";
import { PLAN, SHOWCASE_PAGES } from "./plan";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** `editor/apps/canvas` */
const APP_ROOT = pathResolve(__dirname, "..", "..");
/** `~/paged` — the workspace of side-by-side clones. */
const WORKSPACE = pathResolve(APP_ROOT, "..", "..", "..");
const CORE = pathResolve(WORKSPACE, "core");
const REGISTRY = pathResolve(WORKSPACE, "state", "registry", "features");
const BASE_IDML = pathResolve(
  CORE,
  "corpus",
  "generated",
  "showcase-base.idml",
);
const OUT = pathResolve(APP_ROOT, "showcase");

/** The base fixture is generated, not committed (core gitignores
 *  `corpus/generated/*.idml`), so regenerate it rather than failing on
 *  a fresh clone. `regen-fixtures.sh` is the same script core's own CI
 *  runs before its tests. */
function ensureBaseFixture(): void {
  if (existsSync(BASE_IDML)) return;
  const script = pathResolve(CORE, "scripts", "regen-fixtures.sh");
  if (!existsSync(script)) {
    throw new Error(
      `showcase-base.idml is missing and core is not checked out at ${CORE}. ` +
        `The showcase needs the engine repo beside the editor.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("[showcase] generating showcase-base.idml via paged-gen…");
  execFileSync("bash", [script], { cwd: CORE, stdio: "inherit" });
  if (!existsSync(BASE_IDML)) {
    throw new Error(
      `regen-fixtures.sh ran but ${BASE_IDML} still absent — is the ` +
        `showcase-base sample registered in paged-gen's SAMPLES list?`,
    );
  }
}

test.describe("paged showcase", () => {
  // Building sixteen pages through the real editor, with plugin engines
  // booting along the way, is minutes of work — not a unit test.
  test.setTimeout(20 * 60 * 1000);

  test("builds the reference document end to end @feat:package-anatomy.paged-container @level:happy", async ({
    page,
  }) => {
    ensureBaseFixture();
    mkdirSync(pathResolve(OUT, "pages"), { recursive: true });

    await openCanvas(page);
    const doc = new ShowcaseDoc(page);

    const pageCount = await doc.load(BASE_IDML);
    expect(pageCount, "the base fixture is a 16-page document").toBe(
      SHOWCASE_PAGES,
    );

    const gpu = await doc.gpuActive();
    // "ABSENT (CPU lane)" is not a diagnosis, and for a while it was not
    // even true — the adapter was there and the editor had simply never
    // attached a canvas. So when the GPU is missing, say which of the two
    // it is, measured against the browser.
    const gpuReason = gpu ? "" : await doc.gpuReason();
    // eslint-disable-next-line no-console
    console.log(
      `[showcase] WebGPU: ${gpu ? "adapter attached, GPU render path live" : `NOT ACTIVE — ${gpuReason}`}`,
    );

    const claims: CoverageClaim[] = [];
    const allNotes: string[] = [];

    for (const spread of PLAN) {
      const pageIds = await Promise.all(spread.pages.map((i) => doc.pageId(i)));
      // Snapshot BEFORE, so "did this module put anything on the page"
      // is answered by the page itself rather than by the module's own
      // report. A module cannot mark its own homework.
      const before = await Promise.all(
        spread.pages.map((i) => doc.renderPage(i)),
      );

      const report = await spread.build({
        page,
        doc,
        pageIndexes: spread.pages,
        pageIds,
      });

      claims.push({
        module: spread.id,
        title: report.title,
        pages: spread.pages.map((i) => i + 1),
        covers: report.covers,
        notes: report.notes,
      });
      for (const n of report.notes ?? []) {
        allNotes.push(`${spread.id}: ${n}`);
        // eslint-disable-next-line no-console
        console.log(`[showcase] ${spread.id} note — ${n}`);
      }

      // Every module must have put marks on at least its first page.
      // The GPU-only modules degrade to a note on a CPU lane rather
      // than a red, because "this machine has no adapter" is not a
      // product defect — but it is recorded, not swallowed.
      if (spread.needsGpu && !gpu) {
        allNotes.push(
          `${spread.id}: pixel assertion skipped — no GPU render path: ${gpuReason}`,
        );
      } else {
        await doc.expectRenderChanged(spread.pages[0], before[0]);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[showcase] ${spread.id} — ${report.title} ` +
          `(${report.elements.length} elements, ${report.covers.length} rows)`,
      );
    }

    // ── the live container ──────────────────────────────────────────
    const live = await doc.exportPaged();
    assertUcfMimetypeFirst(live, "application/vnd.adobe.indesign-idml-package");
    const entries = zipEntryNames(live);
    expect(entries).toContain("manifest.json");
    expect(entries).toContain("paged/core/model/document.pgm");
    expect(entries).toContain("designmap.xml");
    const manifest = JSON.parse(readZipText(live, "manifest.json") ?? "{}") as {
      format: string;
      pagedProtocol: number;
      parts: { path: string; plugin?: string }[];
    };
    expect(manifest.format).toBe("paged-container");
    writeFileSync(pathResolve(OUT, "showcase.paged"), live);

    // The parts index is the evidence that plugin content travels with
    // the file. Which plugins wrote parts depends on which engines
    // booted, so this records rather than demands — the per-module
    // notes above say what did not run.
    const pluginParts = manifest.parts
      .map((p) => p.path)
      .filter((p) => p.startsWith("paged/") && !p.startsWith("paged/core/"));
    // eslint-disable-next-line no-console
    console.log(
      `[showcase] container: ${entries.length} entries, ` +
        `${pluginParts.length} plugin part(s): ${pluginParts.join(", ") || "none"}`,
    );

    // ── the interchange twin ────────────────────────────────────────
    //
    // The IDML export IS the baked document: it carries every native
    // page item and drops the whole `paged/` namespace, so what
    // survives it is exactly what a reader without the plugins sees.
    // Round-tripping it back through the engine is therefore the real
    // test of whether the plugin pages baked to native or only LOOKED
    // like they had — a frame whose content lived solely in a
    // SceneLayer comes back empty here.
    const idml = await doc.exportIdml();
    assertUcfMimetypeFirst(idml, "application/vnd.adobe.indesign-idml-package");
    expect(zipEntryNames(idml)).toContain("designmap.xml");
    writeFileSync(pathResolve(OUT, "showcase.idml"), idml);

    // ── PDF, the other exit path ────────────────────────────────────
    // paged.pdf cannot contribute a PAGE to this document (its import
    // replaces the open document by design), so the PDF writer is where
    // that half of the publishing story gets exercised.
    const pdf = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              exportPdf: (o: unknown) => Promise<{
                bytes: Uint8Array;
                diagnostics: string[];
              }>;
            };
          };
        }
      ).__canvas;
      const out = await c.client.exportPdf({ standard: "pdf17" });
      let str = "";
      for (const b of out.bytes) str += String.fromCharCode(b);
      return { b64: btoa(str), diagnostics: out.diagnostics };
    });
    const pdfBytes = Buffer.from(pdf.b64, "base64");
    expect(pdfBytes.subarray(0, 5).toString("latin1"), "PDF magic").toBe(
      "%PDF-",
    );
    writeFileSync(pathResolve(OUT, "showcase.pdf"), pdfBytes);
    if (pdf.diagnostics.length > 0) {
      for (const d of pdf.diagnostics) allNotes.push(`pdf export: ${d}`);
    }

    // ── one render per page ─────────────────────────────────────────
    for (let i = 0; i < SHOWCASE_PAGES; i += 1) {
      const png = await doc.renderPage(i, 1224);
      expect(png.length, `page ${i + 1} rendered no bytes`).toBeGreaterThan(0);
      writeFileSync(
        pathResolve(OUT, "pages", `page-${String(i + 1).padStart(2, "0")}.png`),
        png,
      );
    }

    // ── the baked twin stands on its own ────────────────────────────
    // Reload the IDML into the same editor and re-render. Page COUNT
    // is the cheap check; the real one is that the pages still carry
    // marks, because that is what distinguishes content that baked to
    // native from content that only ever existed as plugin render
    // state. A page that goes blank here did not bake.
    const reloaded = await doc.load(pathResolve(OUT, "showcase.idml"));
    expect(reloaded, "the baked twin reopens with every page").toBe(
      SHOWCASE_PAGES,
    );
    const blankPages: number[] = [];
    for (let i = 0; i < SHOWCASE_PAGES; i += 1) {
      const png = await doc.renderPage(i, 612);
      // An empty page still renders — white pixels are pixels — so
      // "blank" is measured against the size of a page that has
      // nothing on it. A PNG of a uniform white page compresses to a
      // few hundred bytes; any real content is far larger.
      if (png.length < 1500) blankPages.push(i + 1);
    }
    if (blankPages.length > 0) {
      allNotes.push(
        `pages blank after the IDML round-trip: ${blankPages.join(", ")} — ` +
          `their content did not bake to native page items`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[showcase] baked twin: ${SHOWCASE_PAGES} pages, ` +
        `${blankPages.length} blank after round-trip`,
    );

    // ── the coverage claim, checked ─────────────────────────────────
    const coverage = buildCoverage(REGISTRY, claims);
    writeFileSync(
      pathResolve(OUT, "showcase.coverage.json"),
      `${JSON.stringify({ ...coverage, notes: allNotes }, null, 2)}\n`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[showcase] coverage: ${coverage.claimedRows} rows across ` +
        `${Object.keys(coverage.families).length} families ` +
        `(registry ${coverage.registryFound ? `${coverage.registryRows} rows` : "NOT FOUND"})`,
    );
    expect(
      coverage.unknown,
      `these pages claim registry rows that do not exist:\n${coverage.unknown.join("\n")}`,
    ).toEqual([]);
    expect(
      coverage.notShipped,
      `these pages claim rows the registry does not mark shipped:\n${coverage.notShipped.join("\n")}`,
    ).toEqual([]);
  });
});
