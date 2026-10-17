/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// W2.12 — Stories panel acceptance. The panel reads the live story
// list off the `stories` collection (StorySummary) and renders one row
// per story with its character + paragraph counts. Clicking a row sets a
// content selection at the story head. Aftercare-D: the overset badge is
// now covered by the `text-overset` fixture, whose body stories overflow
// their frames (StorySummary.overset = true).

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
const OVERSET_FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text-overset.idml`;

/** Load via the React file-input flow so `useDocument().handle`
 *  populates (the U6 reveal reads it for the page-layout math; the
 *  fidelity driver's direct `client.loadDocument` bypasses that React
 *  state). Same idiom as navigator-panel.spec. */
async function loadViaInput(page: Page, fixture: string): Promise<void> {
  await page.setInputFiles('input[type="file"]', fixture);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

// The Stories panel mounts in Content mode (cockpit panelSet) — drive
// the mode through the dev hook, the same path cockpit-panels.spec
// uses for the other mode-scoped panels.
async function openStories(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("content");
  });
}

test.describe("W2.12 — Stories panel", () => {
  test("AC-STORIES-1 — real story list renders from paged.stories() @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-story-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-STORIES-2 — clicking a story selects it (caret at head) @feat:editor-shell.panels.stories @level:gesture", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openStories(page);
    const first = page.locator("[data-story-list] [data-list-row]").first();
    await first.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    // The content selection landed in the React mirror the dev hook
    // re-publishes each render.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: { contentSelection: { storyId: string } | null };
              }
            ).__canvas.contentSelection?.storyId ?? null,
        ),
      )
      .not.toBeNull();
  });

  test("AC-STORIES-3 — an overset story shows the overset badge @feat:editor-shell.panels.stories @level:edge", async ({
    page,
  }) => {
    // Aftercare-D: `text-overset` ships body stories that overflow their
    // frames (page 1 short-frame, page 2 threaded chain), so
    // StorySummary.overset is true for them — exercises the per-row
    // [data-row-badge="overset"] + the [data-stories-overset-summary]
    // header count.
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-row-badge="overset"]').first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-stories-overset-summary]"),
    ).toBeVisible();
  });
});

// W2.7 — per-story FIELD INSPECTOR (matrix gaps 9/10). Selecting a row
// opens the inspector; its REAL fields (characters / paragraphs /
// overset) must match the `stories` wire collection exactly, and the
// richer kit fields are honest seams.

/** Read the live `StorySummary` collection straight off the wire. */
async function wireStories(
  page: import("@playwright/test").Page,
): Promise<Array<{ selfId: string; characterCount: number; paragraphCount: number; overset?: boolean }>> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<
              Array<{
                selfId: string;
                characterCount: number;
                paragraphCount: number;
                overset?: boolean;
              }>
            >;
          };
        };
      }
    ).__canvas;
    return c.client.collection("stories");
  });
}

test.describe("W2.7 — Stories field inspector", () => {
  test("AC-STORIES-INSP-1 — inspector counts match the wire StorySummary @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    // text-overset is a real MULTI-STORY fixture (4 stories).
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();

    const stories = await wireStories(page);
    expect(stories.length).toBeGreaterThan(1);

    // Click each story row and assert the inspector shows the wire's
    // exact char + paragraph counts for that story.
    const rows = page.locator("[data-story-list] [data-list-row]");
    await expect(rows).toHaveCount(stories.length);

    for (let i = 0; i < stories.length; i++) {
      await rows.nth(i).click();
      const inspector = page.locator(
        `[data-story-inspector="${stories[i].selfId}"]`,
      );
      await expect(inspector).toBeVisible();
      await expect(
        inspector.locator('[data-story-field-value="story-char-count"]'),
      ).toHaveText(String(stories[i].characterCount));
      await expect(
        inspector.locator('[data-story-field-value="story-para-count"]'),
      ).toHaveText(String(stories[i].paragraphCount));
      await expect(
        inspector.locator('[data-story-field-value="story-self-id"]'),
      ).toHaveText(stories[i].selfId);
    }
  });

  test("AC-STORIES-INSP-2 — an overset story's inspector shows Overset", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);

    const stories = await wireStories(page);
    const oversetIndex = stories.findIndex((s) => s.overset);
    expect(oversetIndex).toBeGreaterThanOrEqual(0);

    const rows = page.locator("[data-story-list] [data-list-row]");
    await rows.nth(oversetIndex).click();
    const inspector = page.locator(
      `[data-story-inspector="${stories[oversetIndex].selfId}"]`,
    );
    await expect(inspector).toBeVisible();
    // REAL overset field reads "yes" + the StatusPill reads "Overset".
    await expect(
      inspector.locator('[data-story-field-value="story-overset"]'),
    ).toHaveText("yes");
    await expect(
      inspector.locator('[data-status-pill="story-overset-status"]'),
    ).toContainText("Overset");
  });

  test("AC-STORIES-INSP-3 — words / preview are honest seams; the frame chain is real now @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);

    const stories = await wireStories(page);
    const rows = page.locator("[data-story-list] [data-list-row]");
    await rows.first().click();
    const inspector = page.locator(
      `[data-story-inspector="${stories[0].selfId}"]`,
    );
    await expect(inspector).toBeVisible();
    // The kit fields with no story-keyed wire read are seams, not
    // fabricated values. (The frame chain left this list — U6:
    // `requestFrameChain` is a real read now, consumed by the
    // row-click select/reveal covered in AC-STORIES-4.)
    for (const seam of ["story-seam-words", "story-seam-preview"]) {
      await expect(
        inspector.locator(`[data-story-seam="${seam}"]`),
      ).toContainText("not available yet");
    }
    await expect(
      inspector.locator('[data-story-seam="story-seam-frame-chain"]'),
    ).toHaveCount(0);
  });
});

// U6 — Stories panel → canvas. Clicking a story row element-selects
// the story's FIRST frame (via the v38 `requestFrameChain` door) and
// fit-navigates the camera onto it, in addition to the caret-at-head
// content selection.

test.describe("U6 — story row selects + reveals its first frame", () => {
  test("AC-STORIES-4 — click story row → element selection is the chain's first frame + the viewport contains its rect @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // File-input flow: the reveal needs `useDocument().handle`.
    await loadViaInput(page, FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();

    // The expected first frame, straight off the wire door the panel
    // consumes (rows render in `stories` collection order).
    const expected = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              collection: (n: string) => Promise<Array<{ selfId: string }>>;
              frameChain: (
                storyId: string,
              ) => Promise<Array<{ frameId: string }>>;
            };
          };
        }
      ).__canvas;
      const stories = await c.client.collection("stories");
      const links = await c.client.frameChain(stories[0].selfId);
      return { storyId: stories[0].selfId, frameId: links[0]?.frameId ?? null };
    });
    expect(expected.frameId).not.toBeNull();

    const readCamera = () =>
      page.evaluate(() =>
        (
          globalThis as unknown as {
            __canvas: {
              client: {
                camera: { read: () => { scale: number; tx: number; ty: number } };
              };
            };
          }
        ).__canvas.client.camera.read(),
      );
    const before = await readCamera();

    await page.locator("[data-story-list] [data-list-row]").first().click();

    // 1. The element selection mirror carries the chain's first frame.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sel = (
            globalThis as unknown as {
              __canvas: {
                elementSelection: Array<{ kind: string; id: unknown }>;
              };
            }
          ).__canvas.elementSelection;
          return sel.length === 1 && sel[0].kind === "textFrame"
            ? (sel[0].id as string)
            : null;
        }),
      )
      .toBe(expected.frameId);

    // 2. The camera landed on the frame: wait for the reveal's tween to
    // move the camera and come to rest. Judged earlier, the check read the
    // camera from before the reveal, which shows the whole page.
    let last: typeof before | null = null;
    await expect
      .poll(async () => {
        const cam = await readCamera();
        const same = (a: typeof before, b: typeof before) =>
          a.scale === b.scale && a.tx === b.tx && a.ty === b.ty;
        const settled = last !== null && same(cam, last) && !same(cam, before);
        last = cam;
        return settled;
      })
      .toBe(true);

    // Its doc-space rect (page rect from the vertical-stack layout math +
    // the frame's bounds through its transform, as the reveal and the
    // selection chrome place it) sits fully inside the canvas viewport.
    const placement = await page.evaluate(async (frameId) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            handle: {
              pageIds: string[];
              pageSizesPt: [number, number][];
            };
            client: {
              camera: {
                read: () => { scale: number; tx: number; ty: number };
              };
              elementGeometry: (
                ids: Array<{ kind: string; id: string }>,
              ) => Promise<
                Array<{
                  pageId?: string | null;
                  bounds: [number, number, number, number];
                  itemTransform?: [number, number, number, number, number, number] | null;
                }>
              >;
            };
          };
        }
      ).__canvas;
      const [g] = await c.client.elementGeometry([
        { kind: "textFrame", id: frameId },
      ]);
      if (!g || !g.pageId) return "no-geometry";
      const pageIndex = c.handle.pageIds.indexOf(g.pageId);
      if (pageIndex < 0) return "no-page";
      // Mirror layoutPages: vertical stack, 24pt gap.
      let y = 0;
      for (let i = 0; i < pageIndex; i++) {
        y += c.handle.pageSizesPt[i][1] + 24;
      }
      const [top, left, bottom, right] = g.bounds;
      const [a, b, cc, d, tx, ty] = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [px, py] of [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ]) {
        xs.push(a * px + cc * py + tx);
        ys.push(b * px + d * py + ty);
      }
      const r = {
        x: Math.min(...xs),
        y: y + Math.min(...ys),
        w: Math.max(Math.max(...xs) - Math.min(...xs), 1),
        h: Math.max(Math.max(...ys) - Math.min(...ys), 1),
      };
      const cam = c.client.camera.read();
      const el = document.querySelector<HTMLElement>("[data-paged-canvas]");
      if (!el) return "no-canvas";
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const x0 = r.x * cam.scale + cam.tx;
      const y0 = r.y * cam.scale + cam.ty;
      const x1 = (r.x + r.w) * cam.scale + cam.tx;
      const y1 = (r.y + r.h) * cam.scale + cam.ty;
      const slop = 1.5;
      return x0 >= -slop && y0 >= -slop && x1 <= vw + slop && y1 <= vh + slop
        ? "contained"
        : `outside ${JSON.stringify({ x0, y0, x1, y1, vw, vh })}`;
    }, expected.frameId as string);
    expect(placement).toBe("contained");
  });
});
