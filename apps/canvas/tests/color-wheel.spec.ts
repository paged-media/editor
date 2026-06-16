// Panel-gallery pass — the Color Wheel panel (brand kit
// color-wheel.jsx, fully live). Covers: wheel + value-track drag
// updating the synced HEX readout, RGB/CMYK field round-trips,
// harmony switching (palette size follows the harmony's offset
// set), palette click-to-select, and "Add to Swatches" landing
// the harmony palette as real swatches through ONE batched
// createSwatch (single undo restores the prior count).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

async function loadFixture(page: Page) {
  await page.setInputFiles('input[type="file"]', FIXTURE);
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

async function swatchCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { collection: (n: string) => Promise<unknown[]> };
        };
      }
    ).__canvas;
    return (await c.client.collection("swatches")).length;
  });
}

function hexField(page: Page) {
  return page.locator('[data-wheel-field="HEX"]');
}

test.describe("Panel gallery — Color Wheel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadFixture(page);
    await openPanel(page, "paged.color-wheel");
    await expect(
      page.locator('[data-color-wheel-panel="ready"]'),
    ).toBeVisible();
  });

  test("AC-CW-1 — wheel renders: disc, value track, model tabs, Triadic palette @feat:editor-shell.panels.color-wheel @level:gesture", async ({
    page,
  }) => {
    await expect(page.locator("[data-wheel-disc]")).toBeVisible();
    await expect(page.locator("[data-wheel-value-track]")).toBeVisible();
    // Default field model is HEX with a #RRGGBB value.
    await expect(hexField(page)).toHaveValue(/^#[0-9A-F]{6}$/);
    // Default harmony Triadic → 3 palette swatches.
    await expect(page.locator("[data-wheel-palette-swatch]")).toHaveCount(3);
  });

  test("AC-CW-2 — dragging the disc and the value track moves the colour @feat:editor-shell.panels.color-wheel @level:happy", async ({
    page,
  }) => {
    const before = await hexField(page).inputValue();
    const disc = page.locator("[data-wheel-disc]");
    const box = (await disc.boundingBox())!;
    // Drag to the right edge (high saturation, ~90° hue).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    const afterWheel = await hexField(page).inputValue();
    expect(afterWheel).not.toBe(before);

    // Value track: drag to the bottom → near-black.
    const track = page.locator("[data-wheel-value-track]");
    const tbox = (await track.boundingBox())!;
    await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + 4);
    await page.mouse.down();
    // Overshoot past the bottom — pointer capture keeps the events
    // on the track and the component clamps v to 0.
    await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height + 20, {
      steps: 4,
    });
    await page.mouse.up();
    const afterTrack = await hexField(page).inputValue();
    expect(afterTrack).not.toBe(afterWheel);
    // v == 0 → black regardless of hue.
    expect(afterTrack).toBe("#000000");
  });

  test("AC-CW-3 — HEX → RGB → CMYK field round-trip stays in sync @feat:editor-shell.panels.color-wheel @level:happy", async ({
    page,
  }) => {
    // Author a pure red via the HEX field.
    await hexField(page).fill("#FF0000");
    await hexField(page).press("Enter");
    // RGB tab shows 255/0/0.
    await page.locator('[data-wheel-model="RGB"]').click();
    await expect(page.locator('[data-wheel-field="R"]')).toHaveValue("255");
    await expect(page.locator('[data-wheel-field="G"]')).toHaveValue("0");
    await expect(page.locator('[data-wheel-field="B"]')).toHaveValue("0");
    // CMYK tab shows the naive conversion 0/100/100/0.
    await page.locator('[data-wheel-model="CMYK"]').click();
    await expect(page.locator('[data-wheel-field="C"]')).toHaveValue("0");
    await expect(page.locator('[data-wheel-field="M"]')).toHaveValue("100");
    await expect(page.locator('[data-wheel-field="Y"]')).toHaveValue("100");
    await expect(page.locator('[data-wheel-field="K"]')).toHaveValue("0");
    // Editing K to 100 drives the colour to black.
    await page.locator('[data-wheel-field="K"]').fill("100");
    await page.locator('[data-wheel-field="K"]').press("Enter");
    await page.locator('[data-wheel-model="HEX"]').click();
    await expect(hexField(page)).toHaveValue("#000000");
  });

  test("AC-CW-4 — harmony switching resizes the palette; swatch click selects @feat:editor-shell.panels.color-wheel @level:gesture", async ({
    page,
  }) => {
    await page.locator('[data-wheel-harmony="Complementary"]').click();
    await expect(page.locator("[data-wheel-palette-swatch]")).toHaveCount(2);
    await page.locator('[data-wheel-harmony="Monochromatic"]').click();
    await expect(page.locator("[data-wheel-palette-swatch]")).toHaveCount(5);
    await page.locator('[data-wheel-harmony="Tetradic"]').click();
    await expect(page.locator("[data-wheel-palette-swatch]")).toHaveCount(4);
    // Clicking a non-main palette swatch adopts it as the colour.
    const target = page.locator('[data-wheel-palette-swatch="2"]');
    const targetHex = (await target.getAttribute("title"))!;
    await target.click();
    await expect(hexField(page)).toHaveValue(targetHex);
  });

  test("AC-CW-5 — Add to Swatches lands the palette as ONE undoable batch @feat:editor-shell.panels.color-wheel @level:happy", async ({
    page,
  }) => {
    const before = await swatchCount(page);
    // Triadic default → 3 swatches in one batch mutation.
    await page.locator("[data-wheel-add-palette]").click();
    await expect.poll(() => swatchCount(page)).toBe(before + 3);
    // Single undo removes the whole palette (Operation::Batch).
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.undo();
    });
    await expect.poll(() => swatchCount(page)).toBe(before);
  });
});
