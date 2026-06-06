// E2E op suite — Tabs panel whole-list round-trips (W2.4,
// 2026-06-06). Protocol v28's `paragraphTabStops` path replaces the
// paragraph's entire `<TabList>` in one op
// (`Value::TabStops(TabStopSpec[])`, the gradient-feather stop-list
// precedent — `Value` has no per-element list-edit form, so the panel
// commits the FULL new stop list per change). Each op is the exact
// `setElementProperty` mutation the bound editor emits, addressed at
// the content selection's StoryRange (paragraph paths round the range
// to whole paragraphs in the apply layer). Apply → assert model
// (positions / alignments) → undo → assert restored (the original
// empty list).

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

interface TabStopSpec {
  position: number;
  alignment?: string | null;
  alignmentCharacter?: string | null;
  leader?: string | null;
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

test.describe("E2E tabs ops", () => {
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

  test("AC-E2E-TABS-list — a 2-stop list lands + reads back; undo restores empty", async ({
    page,
  }) => {
    // Two stops: a left stop at 36 pt and a right stop at 144 pt with
    // a dot leader. The whole list is one `Value::TabStops`. The
    // default `text` fixture paragraph carries no tab stops, so undo
    // restores the empty list.
    const stops: TabStopSpec[] = [
      { position: 36, alignment: "LeftAlign", leader: null, alignmentCharacter: null },
      { position: 144, alignment: "RightAlign", leader: ".", alignmentCharacter: null },
    ];
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      // No tabbed glyph on the minimal fixture line repositions, so
      // the render gate is relaxed — the model round-trip is the
      // proof. (A tabbed multi-column fixture would show a reflow.)
      noRenderChange: true,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphTabStops",
            value: { type: "tabStops", value: stops },
          },
        });
      },
      expectModel: async () => {
        const v = (await readRangeProp(page, range, "paragraphTabStops")) as {
          type: string;
          value: TabStopSpec[];
        } | null;
        expect(v?.type).toBe("tabStops");
        expect(v?.value).toHaveLength(2);
        expect(v?.value[0].position).toBe(36);
        expect(v?.value[0].alignment).toBe("LeftAlign");
        expect(v?.value[1].position).toBe(144);
        expect(v?.value[1].alignment).toBe("RightAlign");
        expect(v?.value[1].leader).toBe(".");
      },
      expectRestored: async () => {
        // Undo clears the whole list back to the original empty tab
        // list (the snapshot returns either an empty TabStops value or
        // null when there is no override).
        const v = (await readRangeProp(page, range, "paragraphTabStops")) as {
          type: string;
          value: TabStopSpec[];
        } | null;
        expect(v == null || v.value.length === 0).toBe(true);
      },
    });
  });
});
