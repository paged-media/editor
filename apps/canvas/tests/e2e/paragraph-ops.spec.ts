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

// E2E op suite — Paragraph panel property round-trips (W2.1,
// 2026-06-06). Protocol v28 lands the paragraph layout
// PropertyPaths; the Paragraph panel flipped these seam→live (and
// added the bespoke rule-above/rule-below disclosure over the
// whole-struct `Value::ParagraphRule`). Each path is the exact
// `setElementProperty` mutation the bound control emits, addressed
// at the content selection's StoryRange (paragraph paths round the
// range to whole paragraphs in the apply layer). Apply → assert
// model → undo → assert restored.

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

/** Story at a given page index — see character-ops for the rationale
 *  (`paged.stories()[i]` is page `i`'s body story in the `text`
 *  fixture). */
async function storyAtPage(
  page: Page,
  pageIndex: number,
): Promise<{ selfId: string; characterCount: number }> {
  return page.evaluate(async (i) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              src: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const json = await c.client
      .executeScript("paged.stories()")
      .then((r) => r.output[0] ?? "[]");
    const stories = JSON.parse(json) as Array<{
      selfId: string;
      characterCount: number;
    }>;
    return stories[i];
  }, pageIndex);
}

test.describe("E2E paragraph ops", () => {
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

  /** Paragraph property sandwich — re-layout reflows the paragraph
   *  inside the frame box, so containment is relaxed. */
  async function paraSandwich(
    page: Page,
    o: {
      path: string;
      value: unknown;
      assertValue: (v: unknown) => void;
      /** KNOWN engine render gap — the paragraph path round-trips on the
       *  wire (model + undo asserted) but core's paragraph compose
       *  doesn't consume it yet, so the page repaints with NO pixel
       *  delta. Asserting zero render flips loudly the day core wires
       *  the layout effect. */
      renderGap?: boolean;
    },
  ) {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      noRenderChange: o.renderGap ?? false,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: { elementId: range, path: o.path, value: o.value },
        });
      },
      expectModel: async () => {
        o.assertValue(await readRangeProp(page, range, o.path));
      },
    });
  }

  test("AC-E2E-PARA-leftIndent — paragraphLeftIndent lands + repaints @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // Indents now honoured by core's paragraph compose (render-honor
    // batch, core 27f7d0a) — a 24pt left indent shifts the run and
    // produces a pixel delta. Model + undo stay hard; the render gate
    // is now ENFORCED (renderGap dropped).
    await paraSandwich(page, {
      path: "paragraphLeftIndent",
      value: { type: "length", value: 24 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(24),
    });
  });

  test("AC-E2E-PARA-rightIndent — paragraphRightIndent lands + repaints @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // Same as the left indent — core now honours the right indent
    // (render-honor batch, core 27f7d0a); render gate ENFORCED.
    await paraSandwich(page, {
      path: "paragraphRightIndent",
      value: { type: "length", value: 24 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(24),
    });
  });

  test("AC-E2E-PARA-dropCapChars — paragraphDropCapCharacters lands + repaints @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // A drop cap needs both a character count and a line span; set
    // them together (lines first so the chars edit produces the cap).
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "batch",
          args: {
            ops: [
              {
                op: "setElementProperty",
                args: {
                  elementId: range,
                  path: "paragraphDropCapLines",
                  value: { type: "length", value: 3 },
                },
              },
              {
                op: "setElementProperty",
                args: {
                  elementId: range,
                  path: "paragraphDropCapCharacters",
                  value: { type: "length", value: 1 },
                },
              },
            ],
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readRangeProp(
              page,
              range,
              "paragraphDropCapCharacters",
            )) as {
              value: number;
            }
          ).value,
        ).toBe(1);
        expect(
          (
            (await readRangeProp(page, range, "paragraphDropCapLines")) as {
              value: number;
            }
          ).value,
        ).toBe(3);
      },
    });
  });

  test("AC-E2E-PARA-ruleAbove — paragraphRuleAbove struct lands + repaints @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // Whole-struct ParagraphRule value (the bespoke disclosure's
    // write). The struct round-trips on the wire (model + undo
    // asserted) AND core now draws the rule line (render-honor batch,
    // core 27f7d0a — the resolver captures the instance rule). The pixel
    // gate is ENFORCED (noRenderChange dropped). The rule MUST carry a
    // colour to paint a visible bar: core's own render-honor test sets
    // `RuleAboveColor="Color/Black"`, and an instance rule with no
    // colour resolves to no paint (0 px delta) — so we set the
    // guaranteed `Color/Black` swatch and a heavier weight for a clean
    // delta above the first line.
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, range),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: range,
            path: "paragraphRuleAbove",
            value: {
              type: "paragraphRule",
              value: {
                on: true,
                weight: 4,
                offset: 2,
                color: "Color/Black",
              },
            },
          },
        });
      },
      expectModel: async () => {
        const v = (await readRangeProp(page, range, "paragraphRuleAbove")) as {
          type: string;
          value: { on?: boolean; weight?: number } | null;
        } | null;
        expect(v?.type).toBe("paragraphRule");
        expect(v?.value?.on).toBe(true);
        expect(v?.value?.weight).toBe(4);
      },
    });
  });

  // ── W2.1 multi-paragraph flip ────────────────────────────────────

  test("AC-E2E-PARA-ruleBelow — paragraphRuleBelow draws a rule in the inter-paragraph gap @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // Page "text · para · multi-trailing" (idx 16) stacks two paragraphs
    // with SpaceAfter, so a coloured RuleBelow on the first paragraph
    // paints a visible bar in the gap above the second — the
    // trailing-space case the single-paragraph fixmes lacked. Targets the
    // FIRST paragraph (range [0,4]); a coloured + heavier rule clears the
    // threshold (verified render delta + byte-identical undo on 0.35.1).
    const story = await storyAtPage(page, 16);
    const r = storyRange(story.selfId, 0, Math.min(4, story.characterCount));
    const frame = fx.frames.find((f) => f.pageIndex === 16)!;
    const pi = fx.pages[16];
    const region16 = (await elementPageRectPt(page, frame.ref))!;
    await opSandwich(page, {
      pageId: pi.pageId,
      pageWidthPt: pi.widthPt,
      region: region16,
      containment: false,
      dumpModel: () => dumpElement(page, r),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: r,
            path: "paragraphRuleBelow",
            value: {
              type: "paragraphRule",
              value: { on: true, weight: 4, offset: 2, color: "Color/Black" },
            },
          },
        });
      },
      expectModel: async () => {
        const v = (await readRangeProp(page, r, "paragraphRuleBelow")) as {
          type: string;
          value: { on?: boolean; weight?: number } | null;
        } | null;
        expect(v?.type).toBe("paragraphRule");
        expect(v?.value?.on).toBe(true);
        expect(v?.value?.weight).toBe(4);
      },
    });
  });

  // ── NOT fixture-shaped — engine gaps (W2.1 investigation) ─────────
  // Each was probed against the live 0.35.1 wasm with dedicated fixture
  // content; the blocker is an engine capability, not fixture content.

  // paragraphHyphenation sets `para.hyphenation` (model + undo OK) and
  // the composer reads it, but toggling it produced NO render delta on
  // 0.35.1 across every content tried: a 130pt narrow column with a long
  // word ("text · wrap · hyphenation" page), the wide pangram, and a
  // LeftJustified paragraph. Ragged Knuth-Plass picks equally-good
  // non-hyphenated breaks, and the narrow column overflows the long word
  // rather than hyphenating. ENGINE GAP: the hyphenation toggle does not
  // change the composed line breaks for any fixture-shaped content.
  test.fixme("AC-E2E-PARA-hyphenation — paragraphHyphenation (toggle produces no composed-break delta on 0.35.1) @feat:editor-shell.panels.paragraph @level:happy", async () => {});
  // keep_lines_together / keep_with_next round-trip through mutate but
  // are NOT consumed by paged-compose/paged-text for frame-break
  // decisions (stored on structs, never read in the break logic).
  // Verified: no render delta even on the threaded/overset fixture.
  // ENGINE GAP: keep-options not honoured in layout.
  test.fixme("AC-E2E-PARA-keepLines — paragraphKeepLinesTogether (not consumed by the composer's frame-break logic)", async () => {});
  test.fixme("AC-E2E-PARA-keepNext — paragraphKeepWithNext (not consumed by the composer's frame-break logic)", async () => {});
});
