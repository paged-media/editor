// SDK Phase 3 — element-scope declarative panels.
//
// Stroke + Object/Transform panels rendered as catalog compositions
// over the existing frame-level apply arms (FrameStrokeWeight,
// FrameStrokeColor, FrameBounds, FrameOpacity). Element-scope
// bindings — they resolve against the current single element
// selection.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const TEXT_FRAME_ID = "ua365e1";

interface ElementIdShape {
  kind: string;
  id: string;
}

interface CanvasGlobal {
  client: {
    setElementSelection: (
      ids: ElementIdShape[],
      mode: string,
    ) => Promise<ElementIdShape[]>;
  };
  // The React `SelectionContext` state setter — without calling
  // this the binding hook reads stale [] from the context. The
  // worker-side setElementSelection updates the worker; this
  // updates the main-thread mirror that React panels read.
  setElementSelection: (ids: ElementIdShape[]) => void;
}

async function selectFrame(page: import("@playwright/test").Page, id: string) {
  await page.evaluate(
    async ({ id }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const target = { kind: "textFrame", id };
      const ids = await c.client.setElementSelection([target], "replace");
      c.setElementSelection(ids);
    },
    { id },
  );
}

/** The three property panels (Character, Stroke, Object) share the
 *  "properties" group in dockview — they're tabs in the same
 *  container, so only one is rendered at a time. The default
 *  active tab depends on layout-persistence + insertion order;
 *  tests explicitly activate the tab they're asserting on. */
async function activateTab(
  page: import("@playwright/test").Page,
  panelId: string,
) {
  // Cockpit — panels open as right-dock tabs through the registry.
  await openPanel(page, panelId);
}

test.describe("Phase 3 — element-scope declarative panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-STROKE-1 — Stroke panel mounts; shows em-dash placeholders when no selection", async ({
    page,
  }) => {
    await activateTab(page, "paged.stroke");
    await expect(page.locator('[data-stroke-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-stroke-panel="ready"] [data-section="Stroke"]'),
    ).toBeVisible();
    // 3 fields: Weight + Color + End cap (toggle-group). All show
    // em-dash with no selection.
    const mixed = page.locator('[data-stroke-panel="ready"] [data-mixed]');
    await expect(mixed).toHaveCount(3);
  });

  test("AC-STROKE-2 — selecting a frame populates the Stroke panel fields", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "paged.stroke");
    // After selecting a TextFrame, Weight + Color resolve (no
    // em-dash). The End cap row stays em-dash because TextFrame
    // doesn't carry the `end_cap` field at the parse layer
    // (Rectangle / Oval / Polygon / GraphicLine do). One honest
    // placeholder — the Stroke panel reflects the kind-specific
    // surface rather than pretending the field is universal.
    await expect(
      page.locator('[data-stroke-panel="ready"] [data-mixed]'),
    ).toHaveCount(1);
    // Weight is a LengthInput; the input is visible.
    await expect(
      page.locator('[data-stroke-panel="ready"] input').first(),
    ).toBeVisible();
  });

  test("AC-OBJECT-1 — Object panel mounts; em-dash placeholders when no selection", async ({
    page,
  }) => {
    await activateTab(page, "paged.object-transform");
    await expect(
      page.locator('[data-object-transform-panel="ready"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-object-transform-panel="ready"] [data-section="Object"]',
      ),
    ).toBeVisible();
    // 3 live fields: X+Y, W+H (both derived from frameBounds) and
    // Opacity — all em-dash with no selection. The rotate/scale
    // seams render disabled controls, not mixed sentinels.
    const mixed = page.locator(
      '[data-object-transform-panel="ready"] [data-mixed]',
    );
    await expect(mixed).toHaveCount(3);
  });

  test("AC-OBJECT-2 — selecting a frame populates Bounds + Opacity", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "paged.object-transform");
    await expect(
      page.locator('[data-object-transform-panel="ready"] [data-mixed]'),
    ).toHaveCount(0);
    // 5 LIVE inputs: X, Y, W, H (the frameBounds projection) +
    // Opacity. The rotation/scale seams are disabled inputs.
    await expect(
      page.locator(
        '[data-object-transform-panel="ready"] input:not([disabled])',
      ),
    ).toHaveCount(5);
    await expect(
      page.locator('[data-object-transform-panel="ready"] input[disabled]'),
    ).toHaveCount(3);
  });

  test("AC-OBJECT-3 — multi-selection with differing bounds shows mixed", async ({
    page,
  }) => {
    // Select two frames with different bounds — Bounds should
    // collapse to mixed (em-dash), Opacity should also be mixed
    // unless they happen to share the value.
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              setElementSelection: (
                ids: { kind: string; id: string }[],
                mode: string,
              ) => Promise<{ kind: string; id: string }[]>;
            };
            setElementSelection: (ids: { kind: string; id: string }[]) => void;
          };
        }
      ).__canvas;
      const ids = await c.client.setElementSelection(
        [
          { kind: "textFrame", id: "ua365e1" },
          { kind: "rectangle", id: "ueccee2" },
        ],
        "replace",
      );
      c.setElementSelection(ids);
    });
    await activateTab(page, "paged.object-transform");
    // The two frames have different bounds → Bounds field is mixed
    // → em-dash. Opacity may or may not be mixed depending on
    // fixture; assert at least 1 mixed appears (Bounds).
    await expect
      .poll(
        async () =>
          await page
            .locator('[data-object-transform-panel="ready"] [data-mixed]')
            .count(),
      )
      .toBeGreaterThanOrEqual(1);
  });
});
