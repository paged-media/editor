// Journey: paged.draw LIVE CORNERS — Rounded / Inverse / Bevel / Fancy /
// None presets on a selected rectangle.
//
// Each preset command commits ONE batch of eight setElementProperty
// writes (four frameCornerOption* + four frameCornerRadius*) to the
// rectangle — one undoable step — and stamps a `liveCorners` marker into
// the plugin's metadata envelope (the baked IDML corners are always
// valid). This journey drives the real command surface, reads the baked
// corner option/radius back through the typed inspector, AND
// render-verifies that rounding a FILLED square's corners visibly changes
// the page (the corner ink is removed). The engine apply arm is
// Rectangle-only (gap B-23) — this journey targets a rectangle, which is
// exactly what the command supports.
//
// A negative control runs first: the blank page is render-stable.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

async function invokeCommand(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  await page.evaluate((cmdId) => {
    const cmd = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: {
              invoke?: (id: string) => Promise<void>;
              execute?: (id: string) => Promise<void>;
              run?: (id: string) => Promise<void>;
            };
          };
        };
      }
    ).__canvas.registries.commands;
    const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
    return fn?.call(cmd, cmdId);
  }, id);
}

/** Read one typed property entry off a rectangle. */
async function propOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
  path: string,
): Promise<{ type: string; value?: unknown } | null> {
  return page.evaluate(
    async ({ r, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries?: Array<{
                  path: string;
                  value?: { type: string; value?: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(r).catch(() => null);
      for (const e of props?.entries ?? []) {
        if (e.path === p) return e.value ?? null;
      }
      return null;
    },
    { r: ref, p: path },
  );
}

const TOP_LEFT_OPTION = "frameCornerOptionTopLeft";
const TOP_LEFT_RADIUS = "frameCornerRadiusTopLeft";

test.describe("journey · paged.draw live corners", () => {
  test("a designer cycles corner styles on a filled rectangle through the live-corner preset commands @feat:plugin-draw.live-corners @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. AUTHOR — a FILLED rectangle (so the squared corners carry ink
    //    that rounding visibly removes). ──
    const id = await designer.drawRectangle({ x0: 170, y0: 170, x1: 430, y1: 360 });
    expect(id, "drew a rectangle").not.toBe("");
    const ref = { kind: "rectangle", id };
    await designer.applyFill("rectangle", id, "Color/Black");
    await designer.selectElement("rectangle", id);

    // Capture the square baseline.
    const squareA = await designer.renderBytes();

    // ── 2. ROUNDED — bakes RoundedCorner + a 12pt radius on all four
    //    corners; the corner ink is carved away → the page changes. ──
    await invokeCommand(page, "media.paged.draw.command.cornersRounded");
    await expect
      .poll(async () => (await propOf(page, ref, TOP_LEFT_OPTION))?.value ?? "", {
        timeout: 6_000,
      })
      .toBe("RoundedCorner");
    await expect
      .poll(async () => {
        const v = await propOf(page, ref, TOP_LEFT_RADIUS);
        return v?.type === "length" ? (v.value as number) ?? 0 : 0;
      }, { timeout: 6_000 })
      .toBeGreaterThan(0);
    const rounded = await designer.renderBytes();
    await designer.expectRenderChanged(squareA, rounded);

    // ── 3. BEVEL / INVERSE / FANCY — assert each preset bakes its IDML
    //    corner-option token (the wire shape, read off the engine). ──
    for (const [cmd, token] of [
      ["media.paged.draw.command.cornersBevel", "BeveledCorner"],
      ["media.paged.draw.command.cornersInverseRounded", "InverseRoundedCorner"],
      ["media.paged.draw.command.cornersFancy", "FancyCorner"],
    ] as const) {
      await invokeCommand(page, cmd);
      await expect
        .poll(async () => (await propOf(page, ref, TOP_LEFT_OPTION))?.value ?? "", {
          timeout: 6_000,
        })
        .toBe(token);
    }

    // ── 4. NONE — squares the corners back (empty option text + 0
    //    radius), restoring the square silhouette. ──
    await invokeCommand(page, "media.paged.draw.command.cornersNone");
    await expect
      .poll(async () => (await propOf(page, ref, TOP_LEFT_OPTION))?.value ?? "<unset>", {
        timeout: 6_000,
      })
      // The None preset writes empty option text (the apply layer's
      // is_empty() arm maps it to CornerOption::None).
      .toBe("");
    await expect
      .poll(async () => {
        const v = await propOf(page, ref, TOP_LEFT_RADIUS);
        return v?.type === "length" ? (v.value as number) ?? -1 : -1;
      }, { timeout: 6_000 })
      .toBe(0);
  });
});
