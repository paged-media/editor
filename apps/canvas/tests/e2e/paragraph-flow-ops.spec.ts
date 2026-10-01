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


// E2E op suite — protocol 64's paragraph flow controls, driven through
// the PANELS (2026-10-01). Core v0.64.0 made the keep options, the
// break-before rule, span/split columns and the list-marker overrides
// settable paragraph paths, and added `setFlowGrowRule` (Smart Text
// Reflow per story). The editor grew the controls InDesign users look
// for: Paragraph ▸ Keep options / Span columns, the Bullets & Numbering
// list fields, and the Stories inspector's Smart text reflow.
//
// Every test sets ONE control through its real UI and asserts three
// things: the model readback changed (elementProperties on the
// paragraph), the LAYOUT moved (caret geometry — which frame a
// paragraph's first line lands in, and where — plus the op sandwich's
// pixel diff), and undo restores both (byte-identical render).
//
// Fixture: `text-overset`'s threaded chain — story `ue3375e` flows
// through two 360×40 pt frames (`uf13304` → `u1bd24e`), ten one-line
// paragraphs, three in the first frame. Resolved by SHAPE (the story
// whose chain has two links), never by story-table position.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich } from "./harness/op-sandwich";
import {
  fillRowMetric,
  mutate,
  openPanel,
  setCaret,
  togglePill,
} from "./harness/ui";

interface StoryRangeRef {
  kind: "storyRange";
  id: { story_id: string; start: number; end: number };
}

interface Chain {
  storyId: string;
  frames: string[];
  pageId: string;
  pageWidthPt: number;
}

interface Caret {
  frameId: string | null;
  xPt: number;
  topPt: number;
}

const PARA = '[data-paragraph-panel="ready"]';
const BULLETS = '[data-bullets-panel="ready"]';

// Paragraph starts in the threaded story (one line each).
const P0 = 0;
const P1 = 45;
const P2 = 86;

function range(storyId: string, start: number, end = start + 1): StoryRangeRef {
  return { kind: "storyRange", id: { story_id: storyId, start, end } };
}

type CanvasClientGlobal = {
  __canvas: {
    client: {
      frameChain: (s: string) => Promise<Array<{ frameId: string }>>;
      caretGeometry: (sel: {
        storyId: string;
        start: number;
        end: number;
      }) => Promise<Caret | null>;
      elementProperties: (id: unknown) => Promise<{
        entries: Array<{ path: string; value: unknown }>;
      } | null>;
      documentMeta: () => Promise<{ pageCount: number }>;
      collection: (n: string) => Promise<Array<Record<string, unknown>>>;
      undo: () => Promise<unknown>;
    };
  };
};

async function threadedChain(page: Page, fx: LoadedFixture): Promise<Chain> {
  const found = await page.evaluate(async (stories) => {
    const c = (globalThis as unknown as CanvasClientGlobal).__canvas.client;
    for (const s of stories) {
      const links = await c.frameChain(s.selfId);
      if (links.length === 2) {
        return { storyId: s.selfId, frames: links.map((l) => l.frameId) };
      }
    }
    return null;
  }, fx.stories);
  expect(found, "text-overset carries a two-frame threaded story").toBeTruthy();
  const head = fx.frames.find((f) => f.ref.id === found!.frames[0])!;
  const pageInfo = fx.pages[head.pageIndex];
  return { ...found!, pageId: pageInfo.pageId, pageWidthPt: pageInfo.widthPt };
}

async function caretAt(page: Page, storyId: string, offset: number): Promise<Caret> {
  const cg = await page.evaluate(
    async ({ storyId, offset }) =>
      (globalThis as unknown as CanvasClientGlobal).__canvas.client.caretGeometry({
        storyId,
        start: offset,
        end: offset,
      }),
    { storyId, offset },
  );
  expect(cg, `caret geometry at ${storyId}@${offset}`).toBeTruthy();
  return cg!;
}

async function readProp(page: Page, ref: StoryRangeRef, path: string): Promise<unknown> {
  return page.evaluate(
    async ({ id, p }) => {
      const c = (globalThis as unknown as CanvasClientGlobal).__canvas.client;
      const props = await c.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

async function setProp(page: Page, ref: StoryRangeRef, path: string, value: unknown) {
  const reply = (await mutate(page, {
    op: "setElementProperty",
    args: { elementId: ref, path, value },
  })) as { kind: string };
  expect(reply.kind, `setup write ${path}`).toBe("mutationApplied");
}

async function openSection(page: Page, root: string, title: string) {
  const toggle = page.locator(
    `${root} [data-section="${title}"] > [data-section-toggle]`,
  );
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** The kit select under a field label — an 84px row or a stacked one. */
function rowSelect(page: Page, root: string, label: string) {
  return page
    .locator(
      `${root} :is(div.grid:has(> span:text-is("${label}")), div.mb-px:has(> div:text-is("${label}"))) select`,
    )
    .first();
}

/** The metric above a cluster sub-label ("Start lines", "Space after"…). */
async function fillClusterMetric(page: Page, root: string, sublabel: string, value: number) {
  const input = page
    .locator(`${root} div.flex-col:has(> span:text-is("${sublabel}")) input`)
    .first();
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await input.fill(String(value));
  await input.press("Enter");
}

test.describe("E2E paragraph flow (protocol 64) — Paragraph panel", () => {
  let chain: Chain;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "text-overset");
    chain = await threadedChain(page, fx);
    await openPanel(page, "paged.paragraph");
    await expect(page.locator(PARA)).toBeVisible();
  });

  /** Sandwich one UI write on the chain's page. */
  async function sandwich(
    page: Page,
    o: {
      at: number;
      apply: () => Promise<void>;
      expectModel: () => Promise<void>;
      expectRestored?: () => Promise<void>;
    },
  ) {
    await opSandwich(page, {
      pageId: chain.pageId,
      pageWidthPt: chain.pageWidthPt,
      containment: false,
      dumpModel: () => dumpElement(page, range(chain.storyId, o.at)),
      apply: o.apply,
      expectModel: o.expectModel,
      expectRestored: o.expectRestored,
    });
  }

  test("AC-E2E-FLOW-startParagraph — Start paragraph: In next frame moves the paragraph's first line to the next frame @feat:editor-shell.panels.paragraph @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    const before = await caretAt(page, chain.storyId, P1);
    expect(before.frameId).toBe(chain.frames[0]);
    await setCaret(page, chain.storyId, P1, P1 + 1);
    await openSection(page, PARA, "Keep options");
    await sandwich(page, {
      at: P1,
      apply: async () => {
        await rowSelect(page, PARA, "Start paragraph").selectOption("NextFrame");
      },
      expectModel: async () => {
        expect(await readProp(page, range(chain.storyId, P1), "paragraphStartParagraph")).toEqual({
          type: "text",
          value: "NextFrame",
        });
        const after = await caretAt(page, chain.storyId, P1);
        expect(after.frameId, "paragraph 2 now starts in the second frame").toBe(chain.frames[1]);
        // The paragraph before it stays put.
        expect((await caretAt(page, chain.storyId, P0)).frameId).toBe(chain.frames[0]);
        await expect(rowSelect(page, PARA, "Start paragraph")).toHaveValue("NextFrame");
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P1)).frameId).toBe(chain.frames[0]);
        expect(await readProp(page, range(chain.storyId, P1), "paragraphStartParagraph")).toEqual({
          type: "text",
          value: "",
        });
      },
    });
  });

  test("AC-E2E-FLOW-keepWithNext — Keep with next 2 lines pulls the paragraph into the next frame with its follower @feat:editor-shell.panels.paragraph @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    // Paragraph 3 is the last line of frame 1; paragraph 4 opens frame 2.
    expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[0]);
    await setCaret(page, chain.storyId, P2, P2 + 1);
    await openSection(page, PARA, "Keep options");
    await sandwich(page, {
      at: P2,
      apply: async () => {
        await fillRowMetric(page, PARA, "Keep with next", 2);
      },
      expectModel: async () => {
        // A line COUNT on the wire (Value::Length), not a boolean.
        expect(await readProp(page, range(chain.storyId, P2), "paragraphKeepWithNext")).toEqual({
          type: "length",
          value: 2,
        });
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[1]);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[0]);
      },
    });
  });

  /** Lengthen paragraph 3 so it breaks across the two frames: its first
   *  line ends frame 1, its second opens frame 2. */
  async function splitParagraphAcrossFrames(page: Page): Promise<number> {
    const reply = (await mutate(page, {
      op: "insertText",
      args: {
        storyId: chain.storyId,
        offset: 122,
        text: " Extra words here wrap this paragraph onto a second line.",
      },
    })) as { kind: string };
    expect(reply.kind).toBe("mutationApplied");
    const lastChar = 178;
    expect((await caretAt(page, chain.storyId, P2)).frameId, "setup: first line in frame 1").toBe(
      chain.frames[0],
    );
    expect((await caretAt(page, chain.storyId, lastChar)).frameId, "setup: last line in frame 2").toBe(
      chain.frames[1],
    );
    return lastChar;
  }

  test("AC-E2E-FLOW-keepLinesTogether — Keep lines together moves a split paragraph whole into the next frame @feat:editor-shell.panels.paragraph @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    await splitParagraphAcrossFrames(page);
    await setCaret(page, chain.storyId, P2, P2 + 1);
    await openSection(page, PARA, "Keep options");
    await sandwich(page, {
      at: P2,
      apply: async () => {
        await togglePill(page, PARA, "Keep lines together");
      },
      expectModel: async () => {
        expect(await readProp(page, range(chain.storyId, P2), "paragraphKeepLinesTogether")).toEqual({
          type: "bool",
          value: true,
        });
        // Two lines, start count 2 (the default): the orphan line moves.
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[1]);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[0]);
      },
    });
  });

  test("AC-E2E-FLOW-keepStartEnd — Start / End lines of 1 let a kept paragraph split again @feat:editor-shell.panels.paragraph @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    await splitParagraphAcrossFrames(page);
    const r = range(chain.storyId, P2);
    await setProp(page, r, "paragraphKeepLinesTogether", { type: "bool", value: true });
    await setProp(page, r, "paragraphKeepLastLines", { type: "length", value: 1 });
    expect((await caretAt(page, chain.storyId, P2)).frameId, "setup: kept whole").toBe(chain.frames[1]);
    await setCaret(page, chain.storyId, P2, P2 + 1);
    await openSection(page, PARA, "Keep options");
    await sandwich(page, {
      at: P2,
      apply: async () => {
        await fillClusterMetric(page, PARA, "Start lines", 1);
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphKeepFirstLines")).toEqual({ type: "length", value: 1 });
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[0]);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[1]);
      },
    });
    // And the End-lines field writes its own path.
    await fillClusterMetric(page, PARA, "End lines", 2);
    await expect
      .poll(async () => readProp(page, r, "paragraphKeepLastLines"))
      .toEqual({ type: "length", value: 2 });
  });

  test("AC-E2E-FLOW-keepAllLines — All lines in paragraph overrides Start / End counts @feat:editor-shell.panels.paragraph @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    await splitParagraphAcrossFrames(page);
    const r = range(chain.storyId, P2);
    await setProp(page, r, "paragraphKeepLinesTogether", { type: "bool", value: true });
    await setProp(page, r, "paragraphKeepFirstLines", { type: "length", value: 1 });
    await setProp(page, r, "paragraphKeepLastLines", { type: "length", value: 1 });
    expect((await caretAt(page, chain.storyId, P2)).frameId, "setup: split allowed").toBe(chain.frames[0]);
    await setCaret(page, chain.storyId, P2, P2 + 1);
    await openSection(page, PARA, "Keep options");
    await sandwich(page, {
      at: P2,
      apply: async () => {
        await togglePill(page, PARA, "All lines in paragraph");
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphKeepAllLinesTogether")).toEqual({ type: "bool", value: true });
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[1]);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P2)).frameId).toBe(chain.frames[0]);
      },
    });
  });

  /** Two columns in the head frame — the span/split stage. */
  async function twoColumns(page: Page) {
    const reply = (await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: { kind: "textFrame", id: chain.frames[0] },
        path: "textFrameColumnCount",
        value: { type: "length", value: 2 },
      },
    })) as { kind: string };
    expect(reply.kind).toBe("mutationApplied");
  }

  test("AC-E2E-FLOW-spanColumns — Paragraph layout: Span columns lays the paragraph across both columns @feat:editor-shell.panels.paragraph @feat:layout-model.text-columns @level:happy", async ({
    page,
  }) => {
    await twoColumns(page);
    // In a 2-column frame paragraph 1 wraps: offset 30 sits on its
    // second line, back at the left of column 1.
    const before = await caretAt(page, chain.storyId, 30);
    await setCaret(page, chain.storyId, P0, P0 + 1);
    await openSection(page, PARA, "Span columns");
    await sandwich(page, {
      at: P0,
      apply: async () => {
        await rowSelect(page, PARA, "Paragraph layout").selectOption("SpanColumns");
      },
      expectModel: async () => {
        expect(await readProp(page, range(chain.storyId, P0), "paragraphSpanColumnType")).toEqual({
          type: "text",
          value: "SpanColumns",
        });
        // Spanning the full width, the paragraph is one line again:
        // offset 30 moves up onto the first line, past column 1.
        const after = await caretAt(page, chain.storyId, 30);
        expect(after.topPt).toBeLessThan(before.topPt);
        expect(after.xPt).toBeGreaterThan(before.xPt);
      },
      expectRestored: async () => {
        const back = await caretAt(page, chain.storyId, 30);
        expect(back.topPt).toBeCloseTo(before.topPt, 3);
        expect(back.xPt).toBeCloseTo(before.xPt, 3);
      },
    });
  });

  test("AC-E2E-FLOW-spanCount — Columns: All, and Span space after pushes the next paragraph down @feat:editor-shell.panels.paragraph @feat:layout-model.text-columns @level:happy", async ({
    page,
  }) => {
    await twoColumns(page);
    const r = range(chain.storyId, P0);
    await setProp(page, r, "paragraphSpanColumnType", { type: "text", value: "SpanColumns" });
    await setCaret(page, chain.storyId, P0, P0 + 1);
    await openSection(page, PARA, "Span columns");
    // Columns = All — a model write (the frame has only two columns, so
    // "All" and the default span cover the same width: no layout move
    // to assert, which is the honest reading of this fixture).
    await rowSelect(page, PARA, "Columns").selectOption("All");
    await expect
      .poll(async () => readProp(page, r, "paragraphSpanSplitColumnCount"))
      .toEqual({ type: "text", value: "All" });
    await expect(rowSelect(page, PARA, "Columns")).toHaveValue("All");

    const before = await caretAt(page, chain.storyId, P1);
    await sandwich(page, {
      at: P0,
      apply: async () => {
        await fillClusterMetric(page, PARA, "Space after", 12);
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphSpanColumnMinSpaceAfter")).toEqual({
          type: "length",
          value: 12,
        });
        const after = await caretAt(page, chain.storyId, P1);
        expect(after.topPt, "the span's space after pushes paragraph 2 down").toBeGreaterThan(
          before.topPt + 6,
        );
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P1)).topPt).toBeCloseTo(before.topPt, 3);
      },
    });
  });

  test("AC-E2E-FLOW-spanSpaceBefore — Span space before opens room above a spanning paragraph @feat:editor-shell.panels.paragraph @feat:layout-model.text-columns @level:happy", async ({
    page,
  }) => {
    await twoColumns(page);
    // Span paragraph 2 (not the frame's first, where space before is
    // suppressed at the top of a frame).
    const r = range(chain.storyId, P1);
    await setProp(page, r, "paragraphSpanColumnType", { type: "text", value: "SpanColumns" });
    const before = await caretAt(page, chain.storyId, P1);
    await setCaret(page, chain.storyId, P1, P1 + 1);
    await openSection(page, PARA, "Span columns");
    await sandwich(page, {
      at: P1,
      apply: async () => {
        await fillClusterMetric(page, PARA, "Space before", 18);
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphSpanColumnMinSpaceBefore")).toEqual({
          type: "length",
          value: 18,
        });
        const after = await caretAt(page, chain.storyId, P1);
        expect(
          after.topPt !== before.topPt || after.frameId !== before.frameId,
          `space before moved the span (before ${JSON.stringify(before)}, after ${JSON.stringify(after)})`,
        ).toBe(true);
      },
      expectRestored: async () => {
        const back = await caretAt(page, chain.storyId, P1);
        expect(back.frameId).toBe(before.frameId);
        expect(back.topPt).toBeCloseTo(before.topPt, 3);
      },
    });
  });

  test("AC-E2E-FLOW-splitColumns — Split column + gutters divide the paragraph into sub-columns @feat:editor-shell.panels.paragraph @feat:layout-model.text-columns @level:happy", async ({
    page,
  }) => {
    const r = range(chain.storyId, P0);
    // Single-column frame; paragraph 1 is one line until it is split.
    const before = await caretAt(page, chain.storyId, 30);
    await setCaret(page, chain.storyId, P0, P0 + 1);
    await openSection(page, PARA, "Span columns");
    await setProp(page, r, "paragraphSpanSplitColumnCount", { type: "text", value: "2" });
    await expect(rowSelect(page, PARA, "Columns")).toHaveValue("2");
    await sandwich(page, {
      at: P0,
      apply: async () => {
        await rowSelect(page, PARA, "Paragraph layout").selectOption("SplitColumns");
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphSpanColumnType")).toEqual({
          type: "text",
          value: "SplitColumns",
        });
        // Offset 30 now sits in the second sub-column.
        const after = await caretAt(page, chain.storyId, 30);
        expect(after.xPt).not.toBeCloseTo(before.xPt, 1);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, 30)).xPt).toBeCloseTo(before.xPt, 3);
      },
    });

    // Inside gutter: the second sub-column moves right.
    await setProp(page, r, "paragraphSpanColumnType", { type: "text", value: "SplitColumns" });
    const split = await caretAt(page, chain.storyId, 30);
    await sandwich(page, {
      at: P0,
      apply: async () => {
        await fillClusterMetric(page, PARA, "Inside gutter", 40);
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphSplitColumnInsideGutter")).toEqual({
          type: "length",
          value: 40,
        });
        expect((await caretAt(page, chain.storyId, 30)).xPt).toBeGreaterThan(split.xPt);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, 30)).xPt).toBeCloseTo(split.xPt, 3);
      },
    });

    // Outside gutter: the first sub-column is inset from the frame edge.
    const head = await caretAt(page, chain.storyId, P0);
    await sandwich(page, {
      at: P0,
      apply: async () => {
        await fillClusterMetric(page, PARA, "Outside gutter", 30);
      },
      expectModel: async () => {
        expect(await readProp(page, r, "paragraphSplitColumnOutsideGutter")).toEqual({
          type: "length",
          value: 30,
        });
        expect((await caretAt(page, chain.storyId, P0)).xPt).toBeGreaterThan(head.xPt + 20);
      },
      expectRestored: async () => {
        expect((await caretAt(page, chain.storyId, P0)).xPt).toBeCloseTo(head.xPt, 3);
      },
    });
  });
});

test.describe("E2E paragraph flow (protocol 64) — Bullets & Numbering list fields", () => {
  let chain: Chain;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "text-overset");
    chain = await threadedChain(page, fx);
    await openPanel(page, "paged.bullets-numbering");
    await expect(page.locator(BULLETS)).toBeVisible();
  });

  async function listOnFirstParagraph(page: Page, type: "NumberedList" | "BulletList") {
    await setProp(page, range(chain.storyId, P0, P1 - 1), "paragraphListType", {
      type: "text",
      value: type,
    });
    await setCaret(page, chain.storyId, P0, P0 + 1);
  }

  async function listSandwich(
    page: Page,
    o: { apply: () => Promise<unknown>; path: string; expected: unknown; restored: unknown },
  ) {
    const r = range(chain.storyId, P0);
    await opSandwich(page, {
      pageId: chain.pageId,
      pageWidthPt: chain.pageWidthPt,
      containment: false,
      dumpModel: () => dumpElement(page, r),
      apply: async () => {
        await o.apply();
      },
      expectModel: async () => {
        expect(await readProp(page, r, o.path)).toEqual(o.expected);
      },
      expectRestored: async () => {
        expect(await readProp(page, r, o.path)).toEqual(o.restored);
      },
    });
  }

  async function fillField(page: Page, testId: string, value: string) {
    const f = page.locator(`${BULLETS} [data-bullets-field="${testId}"]`);
    await expect(f).toBeEnabled();
    await f.fill(value);
    await f.press("Enter");
  }

  test("AC-E2E-FLOW-numberExpression — Number expression rewrites the marker @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "NumberedList");
    await listSandwich(page, {
      apply: () => fillField(page, "numbering-expression", "(^#)^t"),
      path: "paragraphNumberingExpression",
      expected: { type: "text", value: "(^#)^t" },
      restored: { type: "text", value: "" },
    });
  });

  test("AC-E2E-FLOW-numberingStyle — Style picks the counter style (i, ii, iii) @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "NumberedList");
    // A start of 4 makes the counter style visible: "4" vs "iv".
    await setProp(page, range(chain.storyId, P0), "paragraphNumberingContinue", { type: "bool", value: false });
    await setProp(page, range(chain.storyId, P0), "paragraphNumberingStartAt", { type: "length", value: 4 });
    await listSandwich(page, {
      apply: () =>
        page
          .locator(`${BULLETS} [data-bullets-field="numbering-format"]`)
          .selectOption("i, ii, iii, iv..."),
      path: "paragraphNumberingFormat",
      expected: { type: "text", value: "i, ii, iii, iv..." },
      restored: { type: "text", value: "" },
    });
  });

  test("AC-E2E-FLOW-numberingStartAt — Mode: Start at + Start at 5 restarts the count @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "NumberedList");
    const r = range(chain.storyId, P0);
    // Mode is a model write; restarting at the default 1 repaints nothing.
    await page
      .locator(`${BULLETS} [data-bullets-field="numbering-mode"]`)
      .selectOption("restart");
    await expect
      .poll(async () => readProp(page, r, "paragraphNumberingContinue"))
      .toEqual({ type: "bool", value: false });
    await listSandwich(page, {
      apply: async () => {
        const f = page.locator(`${BULLETS} input[aria-label="numbering-start-at"]`);
        await expect(f).toBeEnabled();
        await f.fill("5");
        await f.press("Enter");
      },
      path: "paragraphNumberingStartAt",
      expected: { type: "length", value: 5 },
      restored: { type: "length", value: null },
    });
    // Mode back to the style default clears the override (Text "").
    await page
      .locator(`${BULLETS} [data-bullets-field="numbering-mode"]`)
      .selectOption("");
    await expect
      .poll(async () => readProp(page, r, "paragraphNumberingContinue"))
      .toEqual({ type: "text", value: "" });
  });

  test("AC-E2E-FLOW-bulletTextAfter — Text after replaces the tab after the bullet @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "BulletList");
    await listSandwich(page, {
      apply: () => fillField(page, "bullets-text-after", "  ::  "),
      path: "paragraphBulletsTextAfter",
      expected: { type: "text", value: "  ::  " },
      restored: { type: "text", value: "" },
    });
  });

  /** A character style big enough to SEE on a marker. */
  async function markerStyle(page: Page): Promise<string> {
    const made = (await mutate(page, {
      op: "createCharacterStyle",
      args: { name: "Marker big" },
    })) as { kind: string };
    expect(made.kind).toBe("mutationApplied");
    const id = await page.evaluate(async () => {
      const c = (globalThis as unknown as CanvasClientGlobal).__canvas.client;
      const rows = await c.collection("characterStyles");
      return (rows.find((r) => r.name === "Marker big")?.selfId as string) ?? null;
    });
    expect(id).toBeTruthy();
    const sized = (await mutate(page, {
      op: "setStyleProperty",
      args: {
        collection: "character",
        styleId: id,
        path: "characterFontSize",
        value: { type: "length", value: 24 },
      },
    })) as { kind: string };
    expect(sized.kind).toBe("mutationApplied");
    return id!;
  }

  test("AC-E2E-FLOW-bulletCharStyle — Bullet char style styles the marker @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "BulletList");
    const style = await markerStyle(page);
    const select = page.locator(`${BULLETS} [data-bullets-field="bullets-char-style"] select`);
    await expect(select.locator(`option[value="${style}"]`)).toHaveCount(1);
    await listSandwich(page, {
      apply: () => select.selectOption(style),
      path: "paragraphBulletsCharacterStyle",
      expected: { type: "text", value: style },
      restored: { type: "text", value: "" },
    });
  });

  test("AC-E2E-FLOW-numberCharStyle — Number char style styles the marker @feat:editor-shell.panels.bullets-numbering @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    await listOnFirstParagraph(page, "NumberedList");
    const style = await markerStyle(page);
    const select = page.locator(`${BULLETS} [data-bullets-field="numbering-char-style"] select`);
    await expect(select.locator(`option[value="${style}"]`)).toHaveCount(1);
    await listSandwich(page, {
      apply: () => select.selectOption(style),
      path: "paragraphNumberingCharacterStyle",
      expected: { type: "text", value: style },
      restored: { type: "text", value: "" },
    });
  });
});

test.describe("E2E paragraph flow (protocol 64) — Smart text reflow", () => {
  test("AC-E2E-FLOW-smartReflow — Max added pages caps the grown chain; Add pages while overset grows it until the story fits; undo drops them @feat:editor-shell.panels.stories @feat:stories-text.overset @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "text-overset");
    const chain = await threadedChain(page, fx);
    // Enough overset to need several generated pages.
    const filler = Array.from({ length: 400 }, (_, i) => `Overset line ${i} keeps the story running.`).join(" ");
    const ins = (await mutate(page, {
      op: "insertText",
      args: { storyId: chain.storyId, offset: 0, text: filler + " " },
    })) as { kind: string };
    expect(ins.kind).toBe("mutationApplied");

    const meta = () =>
      page.evaluate(async () =>
        (globalThis as unknown as CanvasClientGlobal).__canvas.client.documentMeta(),
      );
    const overset = () =>
      page.evaluate(async (sid) => {
        const c = (globalThis as unknown as CanvasClientGlobal).__canvas.client;
        const rows = await c.collection("stories");
        return Boolean(rows.find((r) => r.selfId === sid)?.overset);
      }, chain.storyId);
    const basePages = (await meta()).pageCount;
    expect(await overset()).toBe(true);

    await openPanel(page, "paged.stories");
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    await setCaret(page, chain.storyId, 0, 0);
    const inspector = page.locator(`[data-story-reflow="${chain.storyId}"]`);
    await expect(inspector).toBeVisible();
    const pill = inspector.locator('[data-toggle-switch="story-reflow-grow"]');
    // No read-back on the wire: the state starts UNKNOWN, not "off".
    await expect(pill).toHaveAttribute("data-mixed", "");

    // Max added pages = 1: the rule goes on with a cap — one generated
    // page, and the story still oversets past it.
    const max = inspector.locator('input[aria-label="story-reflow-max-pages"]');
    await max.fill("1");
    await max.press("Enter");
    await expect(pill).toHaveAttribute("data-on", "true");
    await expect.poll(async () => (await meta()).pageCount).toBe(basePages + 1);
    await expect.poll(overset).toBe(true);

    // Undo the capped rule: the generated page is gone, and the panel
    // admits it no longer knows the rule.
    await page.evaluate(async () => {
      await (globalThis as unknown as CanvasClientGlobal).__canvas.client.undo();
    });
    await expect.poll(async () => (await meta()).pageCount).toBe(basePages);
    await expect(pill).toHaveAttribute("data-mixed", "");

    // The pill alone: uncapped, the chain grows until the story fits.
    await pill.click();
    await expect(pill).toHaveAttribute("data-on", "true");
    await expect.poll(async () => (await meta()).pageCount).toBeGreaterThan(basePages + 1);
    await expect.poll(overset).toBe(false);

    // Undo the rule: the generated pages are gone and the story oversets.
    await page.evaluate(async () => {
      await (globalThis as unknown as CanvasClientGlobal).__canvas.client.undo();
    });
    await expect.poll(async () => (await meta()).pageCount).toBe(basePages);
    await expect.poll(overset).toBe(true);
  });
});
