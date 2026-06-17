// Concept 3 — PDF export: the protocol-26 session wire driven from
// the main thread (begin → one page per call → finish, with real
// progress + cancellation), then the File ▸ Export PDF… dialog.
//
// Layer 1 talks to `__canvas.client` directly (the wire contract the
// dialog builds on); Layer 2 exercises the menu → dialog → download
// path through the DOM.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const FIXTURE_MULTI = `${REPO_ROOT}/corpus/generated/geometry.idml`;

async function loadFixture(page: Page, path = FIXTURE) {
  await page.setInputFiles('input[type="file"]', path);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

// Minimal client view used by the wire-layer evaluates.
interface WireClient {
  beginPdfExport: (
    o: Record<string, unknown>,
  ) => Promise<{ session: number; pageCount: number }>;
  exportPdfPage: (s: number) => Promise<{ done: number; total: number }>;
  finishPdfExport: (
    s: number,
  ) => Promise<{ bytes: Uint8Array; diagnostics: string[] }>;
  cancelPdfExport: (s: number) => Promise<void>;
  exportPdf: (
    o: Record<string, unknown>,
    hooks?: {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    },
  ) => Promise<{ bytes: Uint8Array; diagnostics: string[] }>;
}

const client = () =>
  (globalThis as unknown as { __canvas: { client: WireClient } }).__canvas
    .client;

test.describe("Concept 3 — PDF export wire (protocol 26)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadFixture(page, FIXTURE_MULTI);
  });

  test("begin → page×N → finish produces a PDF with monotone progress @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: unknown } })
        .__canvas.client as {
        beginPdfExport: (
          o: object,
        ) => Promise<{ session: number; pageCount: number }>;
        exportPdfPage: (s: number) => Promise<{ done: number; total: number }>;
        finishPdfExport: (
          s: number,
        ) => Promise<{ bytes: Uint8Array; diagnostics: string[] }>;
      };
      const { session, pageCount } = await c.beginPdfExport({});
      const progress: number[] = [];
      for (let i = 0; i < pageCount; i++) {
        const { done, total } = await c.exportPdfPage(session);
        progress.push(done);
        if (total !== pageCount) throw new Error("total drifted");
      }
      const { bytes, diagnostics } = await c.finishPdfExport(session);
      const head = Array.from(bytes.slice(0, 8))
        .map((b) => String.fromCharCode(b))
        .join("");
      const tail = Array.from(bytes.slice(-32))
        .map((b) => String.fromCharCode(b))
        .join("");
      return {
        pageCount,
        progress,
        head,
        tailHasEof: tail.includes("%%EOF"),
        size: bytes.length,
        diagnostics,
      };
    });
    expect(result.pageCount).toBeGreaterThan(1);
    // Monotone 1..N, one page per call.
    expect(result.progress).toEqual(
      Array.from({ length: result.pageCount }, (_, i) => i + 1),
    );
    expect(result.head).toMatch(/^%PDF-1\.[67]/);
    expect(result.tailHasEof).toBe(true);
    expect(result.size).toBeGreaterThan(500);
  });

  test("high-level exportPdf reports progress per page @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: unknown } })
        .__canvas.client as {
        exportPdf: (
          o: object,
          hooks?: { onProgress?: (d: number, t: number) => void },
        ) => Promise<{ bytes: Uint8Array }>;
      };
      const ticks: Array<[number, number]> = [];
      const { bytes } = await c.exportPdf(
        {},
        { onProgress: (d, t) => ticks.push([d, t]) },
      );
      return { ticks, size: bytes.length };
    });
    // 0/N seed plus one tick per page, all sharing the same total.
    expect(result.ticks.length).toBeGreaterThan(2);
    expect(result.ticks[0][0]).toBe(0);
    const total = result.ticks[0][1];
    expect(result.ticks.at(-1)).toEqual([total, total]);
    expect(result.size).toBeGreaterThan(500);
  });

  test("cancel drops the session; further page calls reject @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:edge", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: unknown } })
        .__canvas.client as {
        beginPdfExport: (
          o: object,
        ) => Promise<{ session: number; pageCount: number }>;
        exportPdfPage: (s: number) => Promise<{ done: number; total: number }>;
        cancelPdfExport: (s: number) => Promise<void>;
      };
      const { session } = await c.beginPdfExport({});
      await c.exportPdfPage(session); // one page in-flight, then bail
      await c.cancelPdfExport(session);
      // Cancel is idempotent.
      await c.cancelPdfExport(session);
      try {
        await c.exportPdfPage(session);
        return { rejected: false };
      } catch (err) {
        return {
          rejected: true,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    });
    expect(result.rejected).toBe(true);
    expect(result.message).toContain("unknown export session");
  });

  test("AbortSignal cancels between pages with AbortError @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: unknown } })
        .__canvas.client as {
        exportPdf: (
          o: object,
          hooks?: {
            onProgress?: (d: number, t: number) => void;
            signal?: AbortSignal;
          },
        ) => Promise<{ bytes: Uint8Array }>;
      };
      const controller = new AbortController();
      try {
        await c.exportPdf(
          {},
          {
            signal: controller.signal,
            onProgress: (done) => {
              // Abort as soon as the first page lands.
              if (done >= 1) controller.abort();
            },
          },
        );
        return { aborted: false, name: "" };
      } catch (err) {
        return {
          aborted: true,
          name: err instanceof DOMException ? err.name : "not-domexception",
        };
      }
    });
    expect(result.aborted).toBe(true);
    expect(result.name).toBe("AbortError");
  });

  test("X-4 without any profile fails at begin @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({ page }) => {
    const message = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: unknown } })
        .__canvas.client as {
        beginPdfExport: (o: object) => Promise<unknown>;
      };
      try {
        await c.beginPdfExport({ standard: "pdfx4" });
        return "no-error";
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    // The fixture loads without a CMYK profile, so X-4 must refuse.
    expect(message).toContain("output intent");
  });
});

test.describe("Concept 3 — Export PDF dialog", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadFixture(page);
  });

  async function openDialog(page: Page) {
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "File" })
      .click();
    await page.getByRole("menuitem", { name: "Export PDF…" }).click();
    await expect(page.locator("[data-export-dialog]")).toBeVisible();
  }

  test("File ▸ Export PDF… opens the dialog @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({ page }) => {
    await openDialog(page);
    await expect(page.locator("[data-export-status]")).toHaveAttribute(
      "data-export-status",
      "idle",
    );
  });

  test("X-4 without a profile shows validation and disables Export @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    await openDialog(page);
    await page.locator("[data-export-standard]").selectOption("pdfx4");
    await expect(page.locator("[data-export-validation]")).toBeVisible();
    await expect(page.locator("[data-export-confirm]")).toBeDisabled();
    // Switching to PDF 1.7 clears the gate.
    await page.locator("[data-export-standard]").selectOption("pdf17");
    await expect(page.locator("[data-export-validation]")).toHaveCount(0);
    await expect(page.locator("[data-export-confirm]")).toBeEnabled();
  });

  test("PDF 1.7 export completes and downloads <docname>.pdf @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    await openDialog(page);
    await page.locator("[data-export-standard]").selectOption("pdf17");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-export-confirm]").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.locator("[data-export-dialog]")).toHaveAttribute(
      "data-export-status",
      "done",
    );
  });
});
