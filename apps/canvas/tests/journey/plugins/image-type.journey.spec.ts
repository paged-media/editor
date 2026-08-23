// JOURNEY · paged.image RASTER TYPE
//
// The tool that turns a string into pixels in a layer: harfrust shapes
// the run, skrifa draws the outlines, ab_glyph_rasterizer fills them,
// and the coverage composites as an ordinary masked solid fill.
//
// LANE SPLIT, the same one the retouch and selection journeys draw. The
// PIXELS are GPU-only — the composite is a registered WGSL dispatch and
// no CPU blend path ships — so a pixel assertion here would skip on CI
// and prove nothing about the lane that actually runs. The shaping and
// rasterizing half is CPU and is proven in `image-js/src/text.rs` and in
// the bundle's own `type.spec.ts`, where a real face can be handed to
// the door the way the host hands one over.
//
// What this journey is for is everything that is NOT engine-bound, and
// two of those things are the reason raster type is worth a journey at
// all rather than a unit test:
//
//   1. That the tool is REACHABLE — registered on the rail and
//      activatable. A tool that a bundle spec can see but a designer
//      cannot reach is exactly the failure a bundle spec cannot see.
//   2. That the tool's SCOPE is stated where a designer is standing.
//      This one paints pixels and is not the host's text frame, and a
//      designer who learns that by discovering their type is not
//      editable has learned it the expensive way.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const TYPE_TOOL = "media.paged.image.tool.type";

async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

test.describe("journey · paged.image raster type", () => {
  test("the type tool registers, and the panel states that it paints pixels @feat:image.editor.raster-type @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    await designer.importImage({ name: "type-sample.png" });
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("type-sample.png"));

    // ── 1. THE TOOL IS REACHABLE. ──
    await designer.runCommand(`paged.tool.activate.${TYPE_TOOL}`);

    // ── 2. THE CONTROLS EXIST and start empty, with the empty state
    //    telling the user what to do rather than sitting blank. ──
    const text = page.locator("[data-image-type-text]");
    await expect(text).toBeVisible();
    await expect(text).toHaveValue("");
    await expect(text).toHaveAttribute(
      "placeholder",
      /click the canvas/i,
    );
    await expect(page.locator("[data-image-type-family]")).toBeVisible();

    // ── 3. THE SCOPE SENTENCE. The one thing a designer must learn
    //    BEFORE they set a headline in here and later try to edit it. ──
    const note = page.locator("[data-image-type-note]");
    await expect(note).toContainText("BASELINE");
    await expect(note).toContainText("shaped by the font");

    await expect(
      page.getByText("paints PIXELS, not a text object"),
    ).toBeVisible();
    await expect(page.getByText("use the host's text frame")).toBeVisible();

    // ── 4. WHERE FACES COME FROM. The offline-by-construction promise,
    //    said on screen and not only in a commit message. ──
    await expect(
      page.getByText("nothing is ever fetched from the network"),
    ).toBeVisible();
  });

  test("typing a string and clicking the canvas does not throw @feat:image.editor.raster-type @level:gesture", async ({
    page,
  }) => {
    // The GESTURE half. What is asserted is deliberately modest and
    // honest about its lane: the click reaches the tool and the app
    // survives it. Whether GLYPHS LANDED is a pixel question and lives
    // on the GPU lane and in the Rust tests.
    //
    // It is still worth having. The gesture crosses page space → image
    // space → the wasm door, and a wrong transform or a missing
    // capability throws in the browser and nowhere else.
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    await designer.importImage({ name: "type-gesture.png" });
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("type-gesture.png"));

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const status = () =>
      page.evaluate(
        () => document.querySelector("[data-image-status]")?.textContent ?? "",
      );

    await designer.runCommand(`paged.tool.activate.${TYPE_TOOL}`);
    await page.locator("[data-image-type-text]").fill("Paged");

    // The status BEFORE the click — non-empty already, from the ingest.
    // Recorded because "the status line is non-empty" would otherwise
    // pass without the click doing anything at all, which is the shape
    // of assertion this campaign keeps having to delete.
    const before = await status();
    expect(before).not.toBe("");

    const box = await page.locator("canvas").first().boundingBox();
    expect(box, "the canvas is on screen").not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Every path through `paintText` writes its own sentence, so the
    // status must land in the TYPE lane's vocabulary — a result, or one
    // of the three stated reasons there is none. This fails if the click
    // never reaches the tool, which is the whole point of the test.
    await expect
      .poll(status, { timeout: 15_000 })
      .toMatch(
        /Type set in|Type failed|serves no fonts|carries no bytes for/,
      );
    expect(await status(), "the click changed the status line").not.toBe(
      before,
    );

    expect(errors, "the type gesture raised no page error").toEqual([]);
  });
});
