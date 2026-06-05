// E2E op suite — export spot-checks. The strongest "applied to the
// IDML document" proof of all: an edit must change the EXPORTED PDF,
// not just the on-screen canvas. Each check exports page 1 of a
// fixture, rasterises it with pdftoppm, applies a visible mutation,
// re-exports, and asserts the page-1 raster changed — with a
// determinism guard (two exports of the same document rasterise
// identically) so the comparison is meaningful.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { diffPngPixels } from "./harness/pixel-diff";
import { mutate } from "./harness/ui";

function pdftoppmAvailable(): boolean {
  try {
    execFileSync("pdftoppm", ["-h"], { stdio: "pipe" });
    return true;
  } catch {
    try {
      execFileSync("which", ["pdftoppm"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}

async function exportPdfBytes(page: Page): Promise<Buffer> {
  const arr = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            exportPdf: (o: object) => Promise<{ bytes: Uint8Array }>;
          };
        };
      }
    ).__canvas.client;
    const { bytes } = await c.exportPdf({});
    return Array.from(bytes);
  });
  return Buffer.from(arr);
}

/** Rasterise PDF page 1 to a PNG buffer via pdftoppm. */
function rasterPage1(pdf: Buffer, tag: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "e2e-export-"));
  const pdfPath = join(dir, `${tag}.pdf`);
  writeFileSync(pdfPath, pdf);
  const outPrefix = join(dir, tag);
  execFileSync(
    "pdftoppm",
    [
      "-png",
      "-f",
      "1",
      "-l",
      "1",
      "-r",
      "96",
      "-singlefile",
      pdfPath,
      outPrefix,
    ],
    { stdio: "pipe" },
  );
  return readFileSync(`${outPrefix}.png`);
}

async function makeSwatch(page: Page, value: number[]): Promise<string> {
  await mutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name: "e2e export",
        space: "RGB",
        value,
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    },
  });
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    return sw[sw.length - 1].selfId;
  });
}

test.describe("E2E export verification", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    test.skip(!pdftoppmAvailable(), "pdftoppm not installed");
    await openCanvas(page);
    fx = await loadFixture(page, "gradients");
  });

  test("AC-E2E-EXPORT-1 — a fill edit changes the exported PDF page 1", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const rect = fx.firstRectangle!;
    expect(rect, "gradients fixture has a rectangle on page 1").toBeTruthy();

    const base = rasterPage1(await exportPdfBytes(page), "base");
    // Determinism guard: a second export of the unchanged document
    // must rasterise identically, so any later diff is the edit.
    const base2 = rasterPage1(await exportPdfBytes(page), "base2");
    const guard = diffPngPixels(base, base2);
    expect(
      guard.changed,
      "two exports of the same document rasterised differently — export is non-deterministic",
    ).toBe(0);

    // Recolour the first rectangle to a vivid solid.
    const red = await makeSwatch(page, [235, 25, 35]);
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameFillColor",
        value: { type: "colorRef", value: red },
      },
    });

    const after = rasterPage1(await exportPdfBytes(page), "after");
    const diff = diffPngPixels(base, after);
    expect(
      diff.changed,
      "the fill edit did not change the exported PDF page",
    ).toBeGreaterThan(0);

    // Undo the edit + the swatch; the document returns to baseline and
    // re-exports identically (the edit was fully reversible in print).
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.undo();
      await c.client.undo();
    });
    const restored = rasterPage1(await exportPdfBytes(page), "restored");
    expect(
      diffPngPixels(base, restored).changed,
      "exported PDF not restored after undo",
    ).toBe(0);
  });
});
