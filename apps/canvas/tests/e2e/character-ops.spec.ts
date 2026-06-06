// E2E op suite — Character panel property round-trips (W2.1,
// 2026-06-06). Protocol v28 lands the character formatting
// PropertyPaths; the Character panel flipped these seam→live. Each
// path is the exact `setElementProperty` mutation the bound leaf
// emits, addressed at the content selection's StoryRange — the same
// arm `characterFontSize` already proved. Apply → assert model →
// undo → assert restored, with the render gate proving the edit
// reached the rendered text.
//
// StoryRange addressing mirrors the binding hook
// (packages/shell/src/catalog/binding-hook.ts): an ElementId of
// `{ kind: "storyRange", id: { story_id, start, end } }`.

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

/** Read one PropertyEntry's value off a StoryRange. */
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

test.describe("E2E character ops", () => {
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

  /** Character property sandwich. Content-scope text edits reflow
   *  inside the frame box, so containment is relaxed (the proof is
   *  "the frame repainted" + the model round-trip). */
  async function charSandwich(
    page: Page,
    o: {
      path: string;
      value: unknown;
      assertValue: (v: unknown) => void;
      /** KNOWN engine render gap — the property round-trips on the wire
       *  (model + undo asserted) but core's text compose doesn't consume
       *  it yet, so the page repaints with NO pixel delta. Asserting
       *  zero render flips loudly the day core wires the glyph effect. */
      renderGap?: boolean;
      /** KNOWN engine undo non-determinism — the forward render gate
       *  stays HARD (the edit paints) and model-restore stays HARD, but
       *  the undo PIXEL byte-identity is relaxed with this logged reason.
       *  A dedicated `test.fail` owns the strict undo check so it flips
       *  loudly the day core makes the undo byte-identical. */
      undoNonDeterministic?: string;
    },
  ) {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      noRenderChange: o.renderGap ?? false,
      skipUndoPixelCheck: o.undoNonDeterministic,
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

  test("AC-E2E-CHAR-fontStyle — characterFontStyle lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterFontStyle",
      value: { type: "text", value: "Bold" },
      assertValue: (v) => expect((v as { value: string }).value).toBe("Bold"),
    });
  });

  test("AC-E2E-CHAR-case — characterCase (AllCaps) lands + repaints", async ({
    page,
  }) => {
    // AllCaps re-cases the glyph run → a guaranteed visible change on
    // any lowercase-bearing fixture text.
    await charSandwich(page, {
      path: "characterCase",
      value: { type: "text", value: "AllCaps" },
      assertValue: (v) =>
        expect((v as { value: string }).value).toBe("AllCaps"),
    });
  });

  test("AC-E2E-CHAR-hscale — characterHorizontalScale lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterHorizontalScale",
      value: { type: "length", value: 130 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(130),
    });
  });

  test("AC-E2E-CHAR-vscale — characterVerticalScale lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterVerticalScale",
      value: { type: "length", value: 130 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(130),
    });
  });

  test("AC-E2E-CHAR-skew — characterSkew lands + repaints", async ({
    page,
  }) => {
    // characterSkew (false-italic slant) now applies in core's glyph
    // compose (render-honor batch, core 27f7d0a — tan(skew)·sy folded
    // into the glyph affine `c` term) — a 12° skew over the run produces
    // a pixel delta, so the FORWARD render gate is now ENFORCED
    // (renderGap dropped). HOWEVER undo does NOT restore byte-identically
    // (~58 px residual in a tiny bbox around the sheared glyphs — the
    // skew compose interacts with the layout cache so the revert isn't
    // pixel-exact). That is a newly-surfaced engine undo-determinism gap,
    // distinct from the render-honor fix. The undo PIXEL check is relaxed
    // with a logged reason (model-restore stays hard); the dedicated
    // `test.fail` below owns the strict undo check so it flips loudly the
    // day core makes the skew undo byte-identical.
    await charSandwich(page, {
      path: "characterSkew",
      value: { type: "length", value: 12 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(12),
      undoNonDeterministic:
        "characterSkew undo leaves ~58 px residual (skew compose vs layout cache) — core determinism follow-up",
    });
  });

  // Owns the STRICT undo byte-identity check for characterSkew that the
  // test above relaxes. `test.fail` = expected-to-fail today; it flips
  // GREEN (and Playwright reports it as an unexpected pass to fix) the
  // day core makes the skew undo byte-identical, forcing the relaxation
  // above to be removed.
  test.fail(
    "AC-E2E-CHAR-skew-undo — characterSkew undo restores byte-identically (engine determinism follow-up)",
    async ({ page }) => {
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
              path: "characterSkew",
              value: { type: "length", value: 12 },
            },
          });
        },
        expectModel: async () => {
          expect(
            (
              (await readRangeProp(page, range, "characterSkew")) as {
                value: number;
              }
            ).value,
          ).toBe(12);
        },
      });
    },
  );

  test("AC-E2E-CHAR-baseline — characterBaselineShift lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterBaselineShift",
      value: { type: "length", value: 3 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(3),
    });
  });

  test("AC-E2E-CHAR-underline — characterUnderline lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterUnderline",
      value: { type: "bool", value: true },
      assertValue: (v) => expect((v as { value: boolean }).value).toBe(true),
    });
  });

  test("AC-E2E-CHAR-strikethru — characterStrikethru lands + repaints", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterStrikethru",
      value: { type: "bool", value: true },
      assertValue: (v) => expect((v as { value: boolean }).value).toBe(true),
    });
  });

  // ── render-gate-risky on the minimal `text` fixture ──────────────
  // These paths round-trip in the MODEL but may not produce a visible
  // glyph delta on the default fixture text (so the sandwich's
  // "changed inside" render gate could fail). They flip to live
  // sandwiches once a fixture with the right content (a font family
  // with a distinct style/optical-kern table, ligature pairs, an
  // applied non-default language hyphenation dictionary) exists.

  test.fixme("AC-E2E-CHAR-fontFamily — characterFontFamily (needs a 2nd embedded family to repaint)", async () => {});
  test.fixme("AC-E2E-CHAR-kerning — characterKerningMethod (Optical needs kern-pair content to repaint)", async () => {});
  test.fixme("AC-E2E-CHAR-position — characterPosition (Superscript needs digit/glyph content to repaint)", async () => {});
  test.fixme("AC-E2E-CHAR-language — characterLanguage (no visible delta without a hyphenation break)", async () => {});
  test.fixme("AC-E2E-CHAR-ligatures — characterLigatures (needs a ligature pair like 'fi' in the run)", async () => {});
  test.fixme("AC-E2E-CHAR-otf — characterOtfFeatures (opaque tag string; no panel write surface yet)", async () => {});
});
