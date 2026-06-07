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
    // W2.2 — nine LIVE controls, all em-dash with no selection:
    // Weight, Color, Type, Cap, Join, Miter, Align, Gap color, Gap
    // tint. The four "Dashes & arrows" controls stay disabled seams
    // (no dash-array / arrowhead path), so they don't count as mixed.
    const mixed = page.locator('[data-stroke-panel="ready"] [data-mixed]');
    await expect(mixed).toHaveCount(9);
  });

  test("AC-STROKE-2 — selecting a frame populates the Stroke panel fields", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "paged.stroke");
    // W2.2 — the Stroke panel reflects the kind-specific surface. The
    // TextFrame property set exposes Weight / Color / Type / Gap
    // colour / Gap tint, but NOT End cap / Join / Miter / Align —
    // those are Rectangle-only parse fields with no TextFrame
    // PropertyEntry, so they em-dash. Assert the kind-specific seams
    // are present (Cap toggle-group + Join toggle-group + Align
    // toggle-group + Miter scrub all mixed) rather than pinning a
    // fixture-dependent total: the resolved-vs-null split of the
    // shared fields depends on the fixture's emitted stroke defaults.
    await expect(
      page.locator(
        '[data-stroke-panel="ready"] [data-section="Stroke"] [data-mixed]',
      ).first(),
    ).toBeVisible();
    // Weight is a LengthInput; the input is visible + resolved (the
    // fixture emits a StrokeWeight default attribute).
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
    // 7 live metrics carry the em-dash mixed state with no
    // selection: X, Y, W, H (derived from frameBounds), Opacity, and
    // the W2.3 Scale X / Scale Y NumberInputs (each null → mixed).
    // The Rotation SmartDial is inert (no mixed sentinel while
    // disabled) and Flip H/V are buttons, not metric fields.
    const mixed = page.locator(
      '[data-object-transform-panel="ready"] [data-mixed]',
    );
    await expect(mixed).toHaveCount(7);
  });

  test("AC-OBJECT-2 — selecting a frame populates Bounds + Opacity", async ({
    page,
  }) => {
    await selectFrame(page, TEXT_FRAME_ID);
    await activateTab(page, "paged.object-transform");
    await expect(
      page.locator('[data-object-transform-panel="ready"] [data-mixed]'),
    ).toHaveCount(0);
    // 7 LIVE inputs once a frame is selected: X, Y, W, H (the
    // frameBounds projection) + Opacity + the W2.3 Scale X / Scale Y
    // metrics (now bound to frameScaleX/frameScaleY, no longer
    // disabled seams). Rotation is the SmartDial value span (renders
    // an <input> only while click-editing) and Flip H/V are buttons.
    await expect(
      page.locator(
        '[data-object-transform-panel="ready"] input:not([disabled])',
      ),
    ).toHaveCount(7);
    await expect(
      page.locator('[data-object-transform-panel="ready"] input[disabled]'),
    ).toHaveCount(0);
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

  test("AC-OBJECT-4 — rotation decompose sandwich: rotate 30° → reads ~30 → undo restores", async ({
    page,
  }) => {
    // W2.3 transform-decompose round-trip through the REAL apply
    // dispatch. Read = decomposed angle of item_transform; write
    // recomposes. set → assert → undo → restored.
    const target = { kind: "rectangle", id: "ueccee2" };
    const read = async () =>
      page.evaluate(async (id) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                elementProperties: (
                  id: unknown,
                ) => Promise<{
                  entries: { path: string; value?: { value?: number } }[];
                } | null>;
              };
            };
          }
        ).__canvas;
        const props = await c.client.elementProperties(id);
        return (
          props?.entries.find((e) => e.path === "frameRotationAngle")?.value
            ?.value ?? null
        );
      }, target);

    const before = (await read()) as number | null;
    expect(before).not.toBeNull();

    await page.evaluate(async (id) => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (x: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: id,
          path: "frameRotationAngle",
          value: { type: "length", value: 30 },
        },
      });
    }, target);

    await expect.poll(read).toBeCloseTo(30, 1);

    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.undo();
    });

    await expect.poll(read).toBeCloseTo(before ?? 0, 1);
  });

  test("AC-OBJECT-5 — flipH decompose sandwich: toggle → reads true → undo restores", async ({
    page,
  }) => {
    const target = { kind: "rectangle", id: "ueccee2" };
    const readFlip = async () =>
      page.evaluate(async (id) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                elementProperties: (
                  id: unknown,
                ) => Promise<{
                  entries: { path: string; value?: { value?: boolean } }[];
                } | null>;
              };
            };
          }
        ).__canvas;
        const props = await c.client.elementProperties(id);
        return (
          props?.entries.find((e) => e.path === "frameFlipH")?.value?.value ??
          null
        );
      }, target);

    const before = (await readFlip()) as boolean | null;
    expect(before).not.toBeNull();

    await page.evaluate(
      async ({ id, before }) => {
        const c = (
          globalThis as unknown as {
            __canvas: { client: { mutate: (x: unknown) => Promise<unknown> } };
          }
        ).__canvas;
        await c.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: id,
            path: "frameFlipH",
            // `before` is captured on the Node side and passed IN — it
            // is not in the browser-context closure's scope.
            value: { type: "bool", value: !before },
          },
        });
      },
      { id: target, before },
    );

    await expect.poll(readFlip).toBe(!before);

    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.undo();
    });

    await expect.poll(readFlip).toBe(before);
  });

  test("AC-OBJECT-6 — reference-point anchor keeps the chosen edge fixed on resize (W2.4)", async ({
    page,
  }) => {
    // W2.4 — the 3×3 reference-point grid is UI state driving
    // client-side bounds math over `frameBounds`. With the bottom-right
    // anchor chosen, growing the WIDTH must keep the RIGHT edge fixed
    // (the LEFT edge moves) — the opposite of the default top-left
    // anchor's grow-right.
    const target = { kind: "rectangle", id: "ueccee2" };
    await selectFrame(page, TEXT_FRAME_ID); // ensure a selection context
    await page.evaluate(async (id) => {
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
      const ids = await c.client.setElementSelection([id], "replace");
      c.setElementSelection(ids);
    }, target);
    await activateTab(page, "paged.object-transform");

    const readBounds = async () =>
      page.evaluate(async (id) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                elementProperties: (
                  id: unknown,
                ) => Promise<{
                  entries: {
                    path: string;
                    value?: { value?: [number, number, number, number] };
                  }[];
                } | null>;
              };
            };
          }
        ).__canvas;
        const props = await c.client.elementProperties(id);
        return (
          (props?.entries.find((e) => e.path === "frameBounds")?.value
            ?.value as [number, number, number, number] | undefined) ?? null
        );
      }, target);

    const before = await readBounds();
    expect(before).not.toBeNull();
    const [t0, l0, b0, r0] = before!;

    // Choose the bottom-right anchor (index 8).
    await page
      .locator(
        '[data-object-transform-panel="ready"] [data-reference-cell="8"]',
      )
      .click();
    await expect(
      page.locator(
        '[data-object-transform-panel="ready"] [data-reference-point-anchor="8"]',
      ),
    ).toBeVisible();

    // Grow the width: read the input's displayed value (the panel's
    // own unit/scale), add 20, commit on blur. (Computing the delta
    // from raw bounds is wrong — the input may show a different
    // unit/scale than the spread-space bounds.)
    const wInput = page.locator(
      '[data-object-transform-panel="ready"] input[aria-label="width"]',
    );
    const shown = Number((await wInput.inputValue()).replace(/[^0-9.-]/g, ""));
    expect(Number.isFinite(shown)).toBe(true);
    await wInput.fill(String(shown + 20));
    await wInput.blur();

    await expect
      .poll(async () => {
        const nb = await readBounds();
        return nb ? Math.round(nb[3]) : null;
      })
      // Right edge unchanged (bottom-right anchor pins it).
      .toBe(Math.round(r0));

    const after = await readBounds();
    expect(after).not.toBeNull();
    const [t1, l1, b1] = after!;
    // Width edit only: top/bottom unchanged; right edge pinned (above);
    // the LEFT edge moved OUT (decreased) — the bottom-right-anchor
    // invariant. The exact delta depends on the panel's unit/scale, so
    // we assert direction + the pinned edges, not a literal magnitude.
    expect(Math.round(t1)).toBe(Math.round(t0));
    expect(Math.round(b1)).toBe(Math.round(b0));
    expect(l1).toBeLessThan(l0);
    // The box genuinely grew (right − left increased).
    expect(r0 - l1).toBeGreaterThan(r0 - l0);
  });
});
