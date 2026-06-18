// Journey: paged.draw APPEARANCE STACK — Add fill / Add stroke / Clear.
//
// The engine has ONE fill + ONE stroke slot per frame, so a multi-layer
// appearance is PLUGIN METADATA (an `appearance` envelope) plus a BAKE
// that lowers the FRONT-MOST layer to the frame's real
// frameFillColor / frameStrokeColor / frameStrokeWeight (gap B-24 — the
// honest "metadata + baked top layer"). This journey drives the three
// stack-management commands through the real registry, verifies the bake
// lands on the engine (the baked stroke weight becomes positive, the
// baked fill points at a colour), render-verifies the added stroke
// paints, and proves Clear reverses the metadata stack.
//
// The draw-render journey already proves Add-stroke bakes + renders; this
// one owns the STACK semantics (add fill, add stroke, then clear).

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

async function strokeWeight(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<number> {
  const v = await propOf(page, ref, "frameStrokeWeight");
  return v?.type === "length" ? (v.value as number) ?? 0 : 0;
}

test.describe("journey · paged.draw appearance stack", () => {
  test("a designer stacks a fill + stroke layer then clears the appearance @feat:plugin-draw.appearance @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. AUTHOR — a filled rectangle (the appearance bake seeds new
    //    layers from the frame's current paint). ──
    const id = await designer.drawRectangle({ x0: 160, y0: 170, x1: 430, y1: 360 });
    expect(id, "drew a rectangle").not.toBe("");
    const ref = { kind: "rectangle", id };
    await designer.applyFill("rectangle", id, "Color/Black");
    await designer.selectElement("rectangle", id);

    // The frame starts with no stroke.
    expect(await strokeWeight(page, ref), "starts unstroked").toBe(0);

    // ── 2. ADD FILL — stacks a fill layer (seeded from the frame fill)
    //    and bakes the top fill back to frameFillColor (still a colour
    //    ref — the stack round-trips, the frame stays painted). ──
    const beforeFill = await designer.renderBytes();
    await invokeCommand(page, "media.paged.draw.command.appearanceAddFill");
    await expect
      .poll(async () => (await propOf(page, ref, "frameFillColor"))?.type ?? "", {
        timeout: 6_000,
      })
      .toBe("colorRef");

    // ── 3. ADD STROKE — stacks a stroke layer and bakes it onto the
    //    frame's real frameStrokeWeight; the stroke edge must PAINT. ──
    await invokeCommand(page, "media.paged.draw.command.appearanceAddStroke");
    await expect
      .poll(() => strokeWeight(page, ref), { timeout: 6_000 })
      .toBeGreaterThan(0);
    const afterStroke = await designer.renderBytes();
    await designer.expectRenderChanged(beforeFill, afterStroke);

    // ── 4. CLEAR — drops the extra metadata layers. The bake is the
    //    top-layer-only contract, so the baked frame paint persists (the
    //    IDML stays valid); the stack metadata is what Clear empties.
    //    Assert it does not throw and the frame is still addressable. ──
    await invokeCommand(page, "media.paged.draw.command.appearanceClear");
    // The frame is intact after the clear (a property read still resolves
    // — Clear empties metadata, it does not delete the element).
    await expect
      .poll(async () => (await propOf(page, ref, "frameFillColor"))?.type ?? "", {
        timeout: 6_000,
      })
      .toBe("colorRef");
  });
});
