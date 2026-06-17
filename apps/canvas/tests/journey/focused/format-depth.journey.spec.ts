// Journey: format depth across frames, text, paths and the spread.
//
// One pass that exercises the scattered "deeper aspect" edits a designer
// makes through the inspector and the structure: frame opacity, character
// leading / font style / fill, paragraph text-wrap, deleting text, a ruler
// guide, a geometric-bounds resize, path point set/remove, inserting a line
// and an oval, a pathfinder union, and an undo round-trip. Collect-failures
// reports exactly which mutations didn't land.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const collection = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (
        globalThis as unknown as {
          __canvas: {
            client: { collection: (c: string) => Promise<Array<{ selfId: string }>> };
          };
        }
      ).__canvas.client.collection(n),
    name,
  );
const undoOnce = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo(),
  );

test.describe("journey · format depth", () => {
  test("frame/text/path/spread depth edits all land @feat:effects-transparency.opacity @feat:typography.leading @feat:typography.font-selection @feat:color-swatches.character-fill @feat:stories-text.text-wrap @feat:stories-text.text.delete @feat:layout-model.guides @feat:geometry-coordinates.geometric-bounds @feat:geometry-coordinates.bezier-path-geometry @feat:geometry-coordinates.path-topology-ops @feat:frames-paths.line.insert @feat:frames-paths.shape-tools @feat:frames-paths.pathfinder-boolean @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const { pageIds } = await designer.handle();
    const pageId = pageIds[0];

    const fail: string[] = [];
    const applies = async (feat: string, m: unknown, ok = (_r: { kind?: string }) => true) => {
      try {
        const r = (await mutate(page, m)) as { kind?: string };
        if (r.kind !== "mutationApplied" || !ok(r)) fail.push(feat);
      } catch (e) {
        fail.push(`${feat} (${String(e).slice(0, 45)})`);
      }
    };

    // A frame with text → its story range for character/paragraph edits.
    const { frameId, storyId } = await designer.addTextFrame({ x0: 70, y0: 90, x1: 460, y1: 220 });
    await designer.placeCaret(storyId!, 0);
    const text = "Heading copy";
    await designer.typeText(text);
    await expect.poll(() => designer.storyChars(storyId!), { timeout: 6000 }).toBeGreaterThanOrEqual(text.length);
    await designer.selectText(storyId!, 0, text.length);
    const range = { kind: "storyRange", id: { story_id: storyId, start: 0, end: text.length } };
    const frameRef = { kind: "textFrame", id: frameId };

    const rectId = await designer.drawRectangle({ x0: 300, y0: 260, x1: 470, y1: 380 });
    const rectRef = { kind: "rectangle", id: rectId };

    // FRAME OPACITY
    await applies("effects-transparency.opacity", {
      op: "setElementProperty",
      args: { elementId: rectRef, path: "frameOpacity", value: { type: "length", value: 35 } },
    });
    // CHARACTER LEADING
    await applies("typography.leading", {
      op: "setElementProperty",
      args: { elementId: range, path: "characterLeading", value: { type: "length", value: 18 } },
    });
    // FONT SELECTION (style)
    await applies("typography.font-selection", {
      op: "setElementProperty",
      args: { elementId: range, path: "characterFontStyle", value: { type: "text", value: "Bold" } },
    });
    // CHARACTER FILL
    await applies("color-swatches.character-fill", {
      op: "setElementProperty",
      args: { elementId: range, path: "characterFillColor", value: { type: "colorRef", value: "Color/Black" } },
    });
    // TEXT WRAP (on the text frame)
    await applies("stories-text.text-wrap", {
      op: "setElementProperty",
      args: { elementId: frameRef, path: "frameTextWrapMode", value: { type: "text", value: "BoundingBoxTextWrap" } },
    });
    // DELETE TEXT
    await applies("stories-text.text.delete", {
      op: "deleteRange",
      args: { storyId, start: 0, end: 3 },
    });

    // GUIDE on the spread
    try {
      const spreads = await collection(page, "spreads");
      await applies("layout-model.guides", {
        op: "insertGuide",
        args: { spreadId: spreads[0]!.selfId, orientation: "horizontal", position: 120 },
      });
    } catch {
      fail.push("layout-model.guides (no spread)");
    }

    // GEOMETRIC BOUNDS (resize the rect)
    await applies("geometry-coordinates.geometric-bounds", {
      op: "resizeFrame",
      args: { frameId: rectId, bounds: [260, 300, 410, 500] },
    });

    // PATH point set + remove (a drawn path)
    const pathId = await designer.drawPath([
      [120, 430],
      [200, 470],
      [280, 430],
    ]);
    const pathRef = { kind: "polygon", id: pathId };
    await applies("geometry-coordinates.bezier-path-geometry", {
      op: "pathPointSet",
      args: { elementId: pathRef, index: 0, role: "anchor", position: [130, 440] },
    });
    await applies("geometry-coordinates.path-topology-ops", {
      op: "pathPointRemove",
      args: { elementId: pathRef, index: 1 },
    });

    // INSERT a line + an oval
    await applies("frames-paths.line.insert", {
      op: "insertLine",
      args: { pageId, start: [10, 10], end: [120, 120] },
    });
    await applies("frames-paths.shape-tools", {
      op: "insertOval",
      args: { pageId, bounds: [20, 20, 120, 90] },
    });

    // PATHFINDER union of two rectangles
    try {
      const a = await designer.drawRectangle({ x0: 90, y0: 500, x1: 200, y1: 600 });
      const b = await designer.drawRectangle({ x0: 160, y0: 540, x1: 280, y1: 640 });
      await applies("frames-paths.pathfinder-boolean", {
        op: "pathfinderBoolean",
        args: { kept: { kind: "rectangle", id: a }, others: [{ kind: "rectangle", id: b }], kind: "union" },
      });
    } catch (e) {
      fail.push(`frames-paths.pathfinder-boolean (${String(e).slice(0, 45)})`);
    }

    // UNDO round-trip — the last mutation reverses cleanly.
    try {
      const r = (await undoOnce(page)) as { kind?: string };
      if (r.kind !== "undoApplied" && r.kind !== "mutationApplied") fail.push("round-tripping.undo-redo");
    } catch (e) {
      fail.push(`round-tripping.undo-redo (${String(e).slice(0, 45)})`);
    }

    expect(fail, `format-depth edits that did not land: ${fail.join(" | ")}`).toEqual([]);
  });
});
