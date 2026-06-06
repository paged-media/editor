import { test, type Page } from "@playwright/test";
import { openCanvas, snapshotPagePng } from "../fidelity/canvas-driver";
import { elementPageRectPt, loadFixture } from "./harness/fixtures";
import { diffPngPixels } from "./harness/pixel-diff";
import { mutate } from "./harness/ui";

interface StoryRangeRef {
  kind: "storyRange";
  id: { story_id: string; start: number; end: number };
}

async function snap(page: Page, pageId: string, pageWidthPt: number): Promise<Buffer> {
  const widthPx = 420;
  const dpi = (widthPx * 72) / pageWidthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

test("diag para render", async ({ page }) => {
  await openCanvas(page);
  const fx = await loadFixture(page, "text");
  const story = fx.firstStory!;
  const range: StoryRangeRef = {
    kind: "storyRange",
    id: { story_id: story.selfId, start: 0, end: Math.min(story.characterCount, 4) },
  };
  const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
  const pageInfo = fx.pages[frame.pageIndex];
  console.log("STORY chars:", story.characterCount);

  for (const path of ["paragraphLeftIndent", "paragraphRightIndent"]) {
    for (const val of [24, 120]) {
      const base = await snap(page, pageInfo.pageId, pageInfo.widthPt);
      await mutate(page, {
        op: "setElementProperty",
        args: { elementId: range, path, value: { type: "length", value: val } },
      } as any);
      await page.waitForTimeout(300);
      const after = await snap(page, pageInfo.pageId, pageInfo.widthPt);
      const d = diffPngPixels(base, after);
      console.log(`${path}=${val}: changed=${d.changed} bbox=${JSON.stringify(d.bbox)} dims=${d.width}x${d.height}`);
      // reset
      await mutate(page, {
        op: "setElementProperty",
        args: { elementId: range, path, value: { type: "length", value: 0 } },
      } as any);
      await page.waitForTimeout(200);
    }
  }
});
