// E2E op suite — Bullets & Numbering panel list-authoring round-trips
// (W2.4, 2026-06-06). Protocol v28 lands the list-authoring text
// paths; the Bullets & Numbering panel flipped list type + bullet
// glyph + numbering format seam→live. Each path is `Value::Text`
// carrying the IDML enum string (`NoList` / `BulletList` /
// `NumberedList`), the bullet glyph itself, or the numbering-format
// expression (`^#.^t`). Content-scope StoryRange (paragraph paths
// round to whole paragraphs). Apply → assert model → undo → restored.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

interface StoryRangeRef {
  kind: "storyRange";
  id: { story_id: string; start: number; end: number };
}

function storyRange(
  storyId: string,
  start: number,
  end: number,
): StoryRangeRef {
  return { kind: "storyRange", id: { story_id: storyId, start, end } };
}

async function readRangeProp(
  page: Page,
  ref: StoryRangeRef,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, p }) => {
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
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

test.describe("E2E bullets & numbering ops", () => {
  let fx: LoadedFixture;
  let range: StoryRangeRef;
  let pageInfo: { pageId: string; widthPt: number };
  let region: PtRect;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text");
    expect(fx.firstStory, "text fixture has a story").toBeTruthy();
    const story = fx.firstStory!;
    const end = Math.max(1, Math.min(story.characterCount, 4));
    range = storyRange(story.selfId, 0, end);
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    pageInfo = fx.pages[frame.pageIndex];
    region = (await elementPageRectPt(page, frame.ref))!;
  });

  test("AC-E2E-BN-bullet — list type Bullet + bullet glyph land; undo clears @feat:editor-shell.panels.bullets-numbering @level:gesture", async ({
    page,
  }) => {
    // List type + bullet glyph together: a marker only inserts when
    // the paragraph is a bullet list, so set the type then the glyph.
    // The model carries the IDML enum + the codepoint; undo clears
    // both overrides back to none.
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      // The engine DOES composite the leading bullet marker (verified:
      // ~3.2k px change on the `text` fixture), so the render gate is
      // live — the glyph paints, undo (×2: glyph then list-type) clears
      // it byte-identically.
      undoSteps: 2,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphListType",
            value: { type: "text", value: "BulletList" },
          },
        });
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphBulletCharacter",
            value: { type: "text", value: "•" }, // •
          },
        });
      },
      expectModel: async () => {
        const lt = (await readRangeProp(page, range, "paragraphListType")) as {
          type: string;
          value: string;
        } | null;
        expect(lt?.type).toBe("text");
        expect(lt?.value).toBe("BulletList");
        const ch = (await readRangeProp(
          page,
          range,
          "paragraphBulletCharacter",
        )) as { type: string; value: string } | null;
        expect(ch?.type).toBe("text");
        expect(ch?.value).toBe("•");
      },
      expectRestored: async () => {
        const lt = (await readRangeProp(page, range, "paragraphListType")) as {
          value: string;
        } | null;
        // Cleared override reads back as the empty string (no enum).
        expect(lt == null || lt.value === "").toBe(true);
      },
    });
  });

  test("AC-E2E-BN-numbering — numbering format lands; undo clears @feat:editor-shell.panels.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      noRenderChange: true,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphNumberingFormat",
            value: { type: "text", value: "^#.^t" },
          },
        });
      },
      expectModel: async () => {
        const fmt = (await readRangeProp(
          page,
          range,
          "paragraphNumberingFormat",
        )) as { type: string; value: string } | null;
        expect(fmt?.type).toBe("text");
        expect(fmt?.value).toBe("^#.^t");
      },
      expectRestored: async () => {
        const fmt = (await readRangeProp(
          page,
          range,
          "paragraphNumberingFormat",
        )) as { value: string } | null;
        expect(fmt == null || fmt.value === "").toBe(true);
      },
    });
  });
});
