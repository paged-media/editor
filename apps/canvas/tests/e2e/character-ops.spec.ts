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

/** Resolve the story + character-count at a given page index. The
 *  generated `text` fixture stacks one body story per page in designmap
 *  (= page) order, so `paged.stories()[i]` is page `i`'s body story.
 *  The W2.1 typography pages append after the original 13 — see the
 *  paged-gen `text` sample. */
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

  test("AC-E2E-CHAR-fontStyle — characterFontStyle lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterFontStyle",
      value: { type: "text", value: "Bold" },
      assertValue: (v) => expect((v as { value: string }).value).toBe("Bold"),
    });
  });

  test("AC-E2E-CHAR-case — characterCase (AllCaps) lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
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

  test("AC-E2E-CHAR-hscale — characterHorizontalScale lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterHorizontalScale",
      value: { type: "length", value: 130 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(130),
    });
  });

  test("AC-E2E-CHAR-vscale — characterVerticalScale lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterVerticalScale",
      value: { type: "length", value: 130 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(130),
    });
  });

  test("AC-E2E-CHAR-skew — characterSkew lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    // characterSkew (false-italic slant) applies in core's glyph compose
    // (render-honor batch, core 27f7d0a — tan(skew)·sy folded into the
    // glyph affine `c` term) — a 12° skew over the run produces a pixel
    // delta, so the FORWARD render gate is ENFORCED. Aftercare-B: core's
    // characterSkew cache fix landed, so undo now restores byte-
    // identically; the undo PIXEL check is HARD again (no relaxation),
    // and the dedicated strict-undo test below is a normal test.
    await charSandwich(page, {
      path: "characterSkew",
      value: { type: "length", value: 12 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(12),
    });
  });

  // STRICT undo byte-identity check for characterSkew. Aftercare-B: the
  // engine skew cache fix landed, so this is a normal test (was
  // `test.fail` while undo left a ~58 px residual) — undo now restores
  // the page byte-identically.
  test(
    "AC-E2E-CHAR-skew-undo — characterSkew undo restores byte-identically (engine determinism follow-up) @feat:editor-shell.panels.character @level:happy",
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

  test("AC-E2E-CHAR-baseline — characterBaselineShift lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterBaselineShift",
      value: { type: "length", value: 3 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(3),
    });
  });

  test("AC-E2E-CHAR-underline — characterUnderline lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterUnderline",
      value: { type: "bool", value: true },
      assertValue: (v) => expect((v as { value: boolean }).value).toBe(true),
    });
  });

  test("AC-E2E-CHAR-strikethru — characterStrikethru lands + repaints @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    await charSandwich(page, {
      path: "characterStrikethru",
      value: { type: "bool", value: true },
      assertValue: (v) => expect((v as { value: boolean }).value).toBe(true),
    });
  });

  // ── W2.1 typography-content flips ────────────────────────────────
  // The `text` fixture gained dedicated host pages (paged-gen `text`
  // sample) so these paths produce a render delta a single edit can
  // prove. Each sandwiches against its own page's story (not the page-0
  // pangram), addressing the WHOLE story so the kern pair / superscript
  // digit is in the selection.

  test("AC-E2E-CHAR-kerning — characterKerningMethod (None) shifts kern-pair glyphs @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    // Page "text · kern · pairs" (idx 13) is "AVATAR To Wave Yes Tom" —
    // AV / To / Wa / Ye carry large negative kern values in Inter's
    // GPOS, so flipping KerningMethod=None drops the kern and shifts the
    // glyphs (verified render delta + byte-identical undo on 0.35.1).
    const story = await storyAtPage(page, 13);
    const r = storyRange(story.selfId, 0, story.characterCount);
    const frame = fx.frames.find((f) => f.pageIndex === 13)!;
    const pi = fx.pages[13];
    const region13 = (await elementPageRectPt(page, frame.ref))!;
    await opSandwich(page, {
      pageId: pi.pageId,
      pageWidthPt: pi.widthPt,
      region: region13,
      containment: false,
      dumpModel: () => dumpElement(page, r),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: r,
            path: "characterKerningMethod",
            value: { type: "text", value: "None" },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readRangeProp(page, r, "characterKerningMethod")) as {
              value: string;
            }
          ).value,
        ).toBe("None");
      },
    });
  });

  test("AC-E2E-CHAR-position — characterPosition (Superscript) lifts the run @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    // Page "text · superscript · digit" (idx 14) is "E = mc2 and 1st …".
    // Superscript lifts + shrinks the selected glyphs in core's compose
    // (verified render delta + byte-identical undo on 0.35.1 — despite
    // the scene struct's stale "not yet honoured" comment).
    const story = await storyAtPage(page, 14);
    const r = storyRange(story.selfId, 0, story.characterCount);
    const frame = fx.frames.find((f) => f.pageIndex === 14)!;
    const pi = fx.pages[14];
    const region14 = (await elementPageRectPt(page, frame.ref))!;
    await opSandwich(page, {
      pageId: pi.pageId,
      pageWidthPt: pi.widthPt,
      region: region14,
      containment: false,
      dumpModel: () => dumpElement(page, r),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: r,
            path: "characterPosition",
            value: { type: "text", value: "Superscript" },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readRangeProp(page, r, "characterPosition")) as {
              value: string;
            }
          ).value,
        ).toBe("Superscript");
      },
    });
  });

  // ── NOT fixture-shaped — engine/harness gaps (W2.1 investigation) ──
  // Each was probed against the live 0.35.1 wasm with dedicated fixture
  // content + the right font registered; the blocker is an engine or
  // harness capability, not missing fixture content. Kept as fixme with
  // the precise blocker so they flip the day core/the harness closes it.

  // characterFontFamily round-trips in the MODEL (elementProperties
  // reports the new family) but the renderer does NOT re-resolve the run
  // to the switched family — it stays on the loadDocument fallback face.
  // A `text · family · second` page + registering a 2nd face still paints
  // identically after the switch. ENGINE/HARNESS GAP: the live
  // font-family mutation isn't consulted by the layout font resolver.
  test.fixme("AC-E2E-CHAR-fontFamily — characterFontFamily (runtime family switch not re-resolved by the renderer) @feat:editor-shell.panels.character @level:happy", async () => {});
  // 0.35.2 punch-list fix: the characterLigatures READ + undo contract.
  // Two of the old blockers are closed: elementProperties now reports
  // ligatures default-ON (`true`) for an un-touched run, and the toggle
  // round-trips through undo (toggle→false applies, undo restores true).
  // We assert that read/undo contract here — NOT a render delta: the
  // harness default font (Inter) has NO `liga` table, so flipping the
  // ligature feature shapes IDENTICAL glyphs (verified: 0 px delta).
  // Asserting a render change would require a liga-bearing load fallback
  // (e.g. Cormorant on a `text · liga · fi-ffi` page) the harness doesn't
  // register; that render half stays a documented FIXTURE gap, owned by
  // `renderGap: true` (zero-pixel assertion) so it flips loudly the day a
  // liga font is registered and the toggle starts repainting.
  test("AC-E2E-CHAR-ligatures — characterLigatures reads default-ON + round-trips undo (0.35.2) @feat:editor-shell.panels.character @level:happy", async ({
    page,
  }) => {
    // Default-ON read: an un-touched run reports ligatures `true`.
    expect(
      (
        (await readRangeProp(page, range, "characterLigatures")) as {
          value: boolean;
        }
      ).value,
      "characterLigatures defaults ON",
    ).toBe(true);
    // Toggle→false lands in the model and round-trips through undo. The
    // render gate is the honest zero-pixel one (Inter has no liga table),
    // and the sandwich's model dump + byte-identical undo prove the round
    // trip restores ligatures to the default-ON state.
    await charSandwich(page, {
      path: "characterLigatures",
      value: { type: "bool", value: false },
      assertValue: (v) => expect((v as { value: boolean }).value).toBe(false),
      renderGap: true,
    });
  });
  // characterLanguage only changes output via a hyphenation break, which
  // (see paragraph-ops AC-E2E-PARA-hyphenation) produces no render delta
  // on 0.35.1 even in a narrow column with a long word. ENGINE GAP:
  // gated on the hyphenation-toggle render gap.
  test.fixme("AC-E2E-CHAR-language — characterLanguage (gated on the hyphenation-render engine gap) @feat:editor-shell.panels.character @level:happy", async () => {});
  // characterOtfFeatures is an opaque tag string with no panel write
  // surface — no `setElementProperty` value shape to drive. ENGINE GAP.
  test.fixme("AC-E2E-CHAR-otf — characterOtfFeatures (opaque tag string; no panel write surface yet) @feat:editor-shell.panels.character @level:happy", async () => {});
});
