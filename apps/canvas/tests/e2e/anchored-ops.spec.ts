// E2E op suite — W2.12 anchored-object position round-trips (the
// Anchored Object panel's W1.16 AnchoredObjectSetting surface,
// protocol v35). An anchored frame carries ten `anchored*`
// PropertyEntries; the panel reads them back and drives the position.
// Each path is element-scope `setElementProperty`. Apply → assert
// model read-back → assert the anchored geometry MOVED (page rect
// changes when the custom offset moves) → undo restores.
//
// The `anchored.idml` generated fixture's anchored TextFrame
// (`ucbd39a`) starts at AnchoredPosition="InlinePosition",
// SpineRelative=true, LockPosition=false, AnchorXoffset/Yoffset=0.

import { expect, test, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "../fidelity/canvas-driver";
import { elementPageRectPt, loadFixture } from "./harness/fixtures";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/anchored.idml`;
const ANCHORED_REF = { kind: "textFrame", id: "ucbd39a" };
// The page-level text frame that displays the anchored object's parent
// story (`u600df2`) — the anchored frame `ucbd39a` is nested INSIDE the
// text flow, so it carries no page-level `elementGeometry` of its own;
// its render lands in this host frame's region.
const HOST_REF = { kind: "textFrame", id: "u052e4b" };

async function readAnchored(
  page: Page,
  path: string,
): Promise<{ type: string; value: unknown } | null> {
  return page.evaluate(
    async ({ ref, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(ref);
      return (
        (props?.entries.find((e) => e.path === p)?.value as {
          type: string;
          value: unknown;
        } | null) ?? null
      );
    },
    { ref: ANCHORED_REF, p: path },
  );
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

test.describe("E2E anchored-object (W2.12) ops", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-E2E-ANCH-readback — the anchored frame surfaces its live settings", async ({
    page,
  }) => {
    const pos = await readAnchored(page, "anchoredPosition");
    expect(pos?.type).toBe("text");
    expect(pos?.value).toBe("InlinePosition");
    const spine = await readAnchored(page, "anchoredSpineRelative");
    expect(spine?.type).toBe("bool");
    expect(spine?.value).toBe(true);
    const lock = await readAnchored(page, "anchoredLockPosition");
    expect(lock?.value).toBe(false);
    const xo = await readAnchored(page, "anchoredXOffset");
    expect(xo?.type).toBe("length");
  });

  test("AC-E2E-ANCH-mode — position mode + offsets land and undo restores", async ({
    page,
  }) => {
    // Switch to custom (Anchored) position, then push X/Y offsets —
    // the model reflects each write and undo walks them back.
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: ANCHORED_REF,
        path: "anchoredPosition",
        value: { type: "text", value: "Anchored" },
      },
    });
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: ANCHORED_REF,
        path: "anchoredXOffset",
        value: { type: "length", value: 24 },
      },
    });
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: ANCHORED_REF,
        path: "anchoredYOffset",
        value: { type: "length", value: -12 },
      },
    });

    expect((await readAnchored(page, "anchoredPosition"))?.value).toBe(
      "Anchored",
    );
    expect((await readAnchored(page, "anchoredXOffset"))?.value).toBe(24);
    expect((await readAnchored(page, "anchoredYOffset"))?.value).toBe(-12);

    // Undo Y, X, then position — each restores its prior model value.
    await undo(page);
    expect((await readAnchored(page, "anchoredYOffset"))?.value).toBe(0);
    await undo(page);
    expect((await readAnchored(page, "anchoredXOffset"))?.value).toBe(0);
    await undo(page);
    expect((await readAnchored(page, "anchoredPosition"))?.value).toBe(
      "InlinePosition",
    );
  });

  test("AC-E2E-ANCH-geometry — a custom anchored offset MOVES the rendered geometry; undo restores byte-identically", async ({
    page,
  }) => {
    // The anchored frame is nested in text, so `elementGeometry`
    // returns null for it directly — its placement is observed through
    // the HOST frame's render. Put the object in custom (Anchored)
    // position, then push a large Y offset: the host frame's region
    // must repaint (the anchored object moved). Undo restores it
    // byte-identically (engine guarantee).
    const fx = await loadFixture(page, {
      label: "anchored",
      absPath: FIXTURE,
    });
    const hostFrame = fx.frames.find((f) => f.ref.id === HOST_REF.id)!;
    expect(hostFrame, "the anchored object's host frame is present").toBeTruthy();
    const pageInfo = fx.pages[hostFrame.pageIndex];
    const region = (await elementPageRectPt(page, HOST_REF)) as PtRect;

    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: ANCHORED_REF,
        path: "anchoredPosition",
        value: { type: "text", value: "Anchored" },
      },
    });

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      undoSteps: 1,
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: ANCHORED_REF,
            path: "anchoredYOffset",
            value: { type: "length", value: 80 },
          },
        });
      },
      expectModel: async () => {
        expect((await readAnchored(page, "anchoredYOffset"))?.value).toBe(80);
      },
      expectRestored: async () => {
        expect((await readAnchored(page, "anchoredYOffset"))?.value).toBe(0);
      },
    });
  });
});
