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

// E2E caret navigation suite (W2.11) — gestures.md SEL-05 + the caret
// sections. Proves arrow / Home / End keyboard navigation moves the
// text caret across LINES (not just chars), Shift+arrow extends the
// range, and Type-tool multi-click escalates selection granularity.
//
// Seam: drives the REAL keyboard handler (`useTextEditing`, a window
// keydown listener) and the REAL viewport pointer path (ViewportCanvas
// double-/triple-click). Caret movement is read back through the
// engine's authoritative geometry replies (`client.caretGeometry` /
// `client.selectionGeometry`) and the content-selection mirror on
// `__canvas`, so an assertion fails the same way the user would see it
// (caret on the wrong line).
//
// WIRE STATE (protocol v35): the caret-nav query family is fully wired —
//   requestCaretNav       {storyId, offset, direction: "up"|"down"} → {offset?}
//   requestLineBounds      {storyId, offset}  → {bounds?}  (W0.6)
//   requestWordBounds      {storyId, offset}  → {bounds?}  (v31, UAX-29)
//   requestParagraphBounds {storyId, offset}  → {bounds?}  (v35, W1.23)
// caretNavResult is OFFSET-ONLY: the engine owns the InDesign desired-x
// "goal column", we just apply the returned offset. The granularity
// ladder is now char → word (double-click, requestWordBounds) →
// paragraph (triple-click, requestParagraphBounds) — see ViewportCanvas
// `applyTextGranularity`. Triple-click spans every wrapped line of the
// paragraph (the v35 query is independent of line bounds), so CARET-NAV-7
// below is a live assertion, not a fixme.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { setCaret } from "./harness/ui";
import { loadViaReactPath, screenPoint, activateTool } from "./harness/viewport";

// ── small readers over the debug bridge ──────────────────────────────

interface CaretGeo {
  pageId: string;
  xPt: number;
  topPt: number;
  heightPt: number;
}
interface SelRect {
  pageId: string;
  topPt: number;
}
interface Sel {
  storyId: string;
  start: number;
  end: number;
  affinity?: boolean;
}

/** Engine-authoritative caret rect for an explicit selection. */
async function caretGeo(page: Page, sel: Sel): Promise<CaretGeo | null> {
  return page.evaluate(async (s) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { caretGeometry: (s: unknown) => Promise<unknown> } };
      }
    ).__canvas;
    return (await c.client.caretGeometry(s)) as CaretGeo | null;
  }, sel);
}

/** Per-line selection rects for an explicit range selection. */
async function selRects(page: Page, sel: Sel): Promise<SelRect[]> {
  return page.evaluate(async (s) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { selectionGeometry: (s: unknown) => Promise<unknown[]> };
        };
      }
    ).__canvas;
    return (await c.client.selectionGeometry(s)) as SelRect[];
  }, sel);
}

/** The live content-selection mirror the keyboard handler writes to. */
async function currentSelection(page: Page): Promise<Sel | null> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { contentSelection: Sel | null } })
        .__canvas.contentSelection,
  );
}

/** Story character count via the stories() listing. */
async function storyChars(page: Page, id: string): Promise<number> {
  return page.evaluate(async (storyId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.stories()");
    const stories = JSON.parse(r.output[0] ?? "[]") as Array<{
      selfId: string;
      characterCount: number;
    }>;
    return stories.find((s) => s.selfId === storyId)?.characterCount ?? -1;
  }, id);
}

/** Engine-authoritative UAX-29 word extent (story-local bytes) for the
 *  word containing `offset`. Mirrors the wire `requestWordBounds`. */
async function wordBoundsAt(
  page: Page,
  storyId: string,
  offset: number,
): Promise<{ start: number; end: number } | null> {
  return page.evaluate(
    async ({ storyId, offset }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              wordBounds: (
                id: string,
                off: number,
              ) => Promise<{ start: number; end: number } | null>;
            };
          };
        }
      ).__canvas;
      return c.client.wordBounds(storyId, offset);
    },
    { storyId, offset },
  );
}

/** Line extent (story offsets) for the line containing `offset`. */
async function lineBoundsAt(
  page: Page,
  storyId: string,
  offset: number,
): Promise<{ lineStart: number; lineEnd: number } | null> {
  return page.evaluate(
    async ({ storyId, offset }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              lineBounds: (
                id: string,
                off: number,
              ) => Promise<{ lineStart: number; lineEnd: number } | null>;
            };
          };
        }
      ).__canvas;
      return c.client.lineBounds(storyId, offset);
    },
    { storyId, offset },
  );
}

/** Engine-authoritative paragraph extent (story-local bytes) for the
 *  paragraph containing `offset`. Mirrors the wire `requestParagraphBounds`
 *  (v35). The synthetic inter-paragraph `\n` is the boundary and is NOT
 *  inside the span. */
async function paragraphBoundsAt(
  page: Page,
  storyId: string,
  offset: number,
): Promise<{ start: number; end: number } | null> {
  return page.evaluate(
    async ({ storyId, offset }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              paragraphBounds: (
                id: string,
                off: number,
              ) => Promise<{ start: number; end: number } | null>;
            };
          };
        }
      ).__canvas;
      return c.client.paragraphBounds(storyId, offset);
    },
    { storyId, offset },
  );
}

/** Move keyboard focus off any input so the window keydown handler in
 *  `useTextEditing` runs (it ignores events targeting form fields). */
async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body) el.blur?.();
  });
}

/** True when the story spans >1 line — the precondition for vertical
 *  nav. Compares the caret y at offset 0 vs. near the story end. */
async function isMultiLine(page: Page, storyId: string): Promise<boolean> {
  const chars = await storyChars(page, storyId);
  if (chars <= 1) return false;
  const a = await caretGeo(page, { storyId, start: 0, end: 0 });
  const b = await caretGeo(page, {
    storyId,
    start: Math.max(1, chars - 1),
    end: Math.max(1, chars - 1),
  });
  if (!a || !b) return false;
  return b.topPt - a.topPt > 0.5;
}

test.describe("W2.11 caret navigation", () => {
  let fx: LoadedFixture;
  let storyId: string;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text");
    expect(fx.firstStory, "text fixture has a story").toBeTruthy();
    storyId = fx.firstStory!.selfId;
  });

  test("CARET-NAV-1 — ArrowDown moves the caret to the next line @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    if (!(await isMultiLine(page, storyId))) {
      test.fixme(true, "text fixture story is single-line — no vertical nav");
      return;
    }
    await setCaret(page, storyId, 0);
    await blurFocus(page);

    const before = await caretGeo(page, { storyId, start: 0, end: 0 });
    expect(before, "caret geometry at offset 0").toBeTruthy();

    await page.keyboard.press("ArrowDown");
    // The handler round-trips requestCaretNav → setSelection; poll the
    // mirror until the offset advances off line 0.
    await expect
      .poll(async () => (await currentSelection(page))?.start ?? 0, {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    const moved = await currentSelection(page);
    expect(moved).toBeTruthy();
    expect(moved!.start).toBe(moved!.end); // collapsed caret, not a range
    const after = await caretGeo(page, moved!);
    expect(after, "caret geometry after ArrowDown").toBeTruthy();
    // Engine-owned line metric: the caret dropped to a lower line.
    expect(after!.topPt).toBeGreaterThan(before!.topPt + 0.5);
  });

  test("CARET-NAV-2 — typing after ArrowDown inserts at the new line (op sandwich) @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    if (!(await isMultiLine(page, storyId))) {
      test.fixme(true, "text fixture story is single-line — no vertical nav");
      return;
    }
    await setCaret(page, storyId, 0);
    await blurFocus(page);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(async () => (await currentSelection(page))?.start ?? 0, {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    const sel = (await currentSelection(page))!;
    const offset = sel.start;
    const before = await storyChars(page, storyId);

    // Insert a marker glyph; it must land at the navigated offset, not
    // offset 0. Proof: char count grows by 1 AND a deleteRange at the
    // navigated offset removes exactly the inserted glyph (undo path).
    await page.keyboard.press("Q");
    await expect
      .poll(() => storyChars(page, storyId), { timeout: 5000 })
      .toBe(before + 1);

    // The caret advanced by the inserted glyph length.
    const advanced = await currentSelection(page);
    expect(advanced!.start).toBe(offset + 1);

    // Reverting the exact range restores the original count — confirms
    // the insert landed at `offset`, not elsewhere.
    await page.evaluate(
      async ({ storyId, start }) => {
        const c = (
          globalThis as unknown as {
            __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
          }
        ).__canvas;
        await c.client.mutate({
          op: "deleteRange",
          args: { storyId, start, end: start + 1 },
        });
      },
      { storyId, start: offset },
    );
    await expect
      .poll(() => storyChars(page, storyId), { timeout: 5000 })
      .toBe(before);
  });

  test("CARET-NAV-3 — Shift+ArrowDown extends the selection across two lines @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    if (!(await isMultiLine(page, storyId))) {
      test.fixme(true, "text fixture story is single-line — no vertical nav");
      return;
    }
    await setCaret(page, storyId, 0);
    await blurFocus(page);

    await page.keyboard.press("Shift+ArrowDown");
    await expect
      .poll(async () => {
        const s = await currentSelection(page);
        return s ? s.end - s.start : 0;
      }, { timeout: 5000 })
      .toBeGreaterThan(0);

    const sel = (await currentSelection(page))!;
    expect(sel.start).toBe(0); // anchor stayed put
    expect(sel.end).toBeGreaterThan(0); // focus moved down

    // The FOCUS caret moved to a lower visual line — the geometric proof
    // of vertical extension. We assert against the caret of the focus
    // offset, NOT the selection rects: Shift+ArrowDown can land the
    // focus exactly at the next line's START (zero glyphs selected on
    // that line), in which case `selectionGeometry` legitimately returns
    // only the first line's rect (it emits rects for lines with selected
    // glyphs). The caret top is the read-surface that distinguishes the
    // line, so compare the focus caret's top to the anchor's.
    const anchorCaret = await caretGeo(page, { storyId, start: 0, end: 0 });
    const focusCaret = await caretGeo(page, {
      storyId,
      start: sel.end,
      end: sel.end,
    });
    expect(anchorCaret, "anchor caret geometry").toBeTruthy();
    expect(focusCaret, "focus caret geometry").toBeTruthy();
    expect(
      focusCaret!.topPt - anchorCaret!.topPt,
      "Shift+ArrowDown moved the focus to a lower line",
    ).toBeGreaterThan(0.5);
    // And the selection paints at least one line's worth of glyphs.
    const rects = await selRects(page, sel);
    expect(rects.length, "selection rects").toBeGreaterThan(0);
  });

  test("CARET-NAV-4 — Home/End move the caret to the line start/end @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    const chars = await storyChars(page, storyId);
    expect(chars).toBeGreaterThan(1);
    // Place the caret at offset 1 — guaranteed INTERIOR to the first
    // line (every fixture line has many glyphs), so Home (→ line start)
    // and End (→ line end) land at DISTINCT offsets. `chars/2` can fall
    // exactly on a wrap boundary where Home and End collapse to the same
    // offset (font-substitution changes the wrap point run-to-run),
    // which made the `home < end` assertion flaky.
    const mid = 1;
    // The line-end offset is engine-authoritative — read it directly so
    // the End-key poll can wait for the caret to actually REACH it. The
    // earlier `start >= mid` poll could capture the pre-move caret (it was
    // already at offset 1, which trivially satisfies `>= 1`), racing the
    // async lineBounds reply and occasionally reading a stale offset for
    // both End and Home (the `home < end` flake).
    const lineEnd = (await lineBoundsAt(page, storyId, mid))!.lineEnd;
    expect(lineEnd, "line end strictly past the interior offset").toBeGreaterThan(
      mid,
    );

    await setCaret(page, storyId, mid);
    await blurFocus(page);

    // End → caret at the engine's line end (poll until it lands there).
    await page.keyboard.press("End");
    await expect
      .poll(async () => (await currentSelection(page))?.start ?? -1, {
        timeout: 5000,
      })
      .toBe(lineEnd);
    const endSel = (await currentSelection(page))!;
    expect(endSel.start).toBe(endSel.end);
    expect(endSel.start).toBeLessThanOrEqual(chars);

    // Home → caret at line start (strictly before the End offset; poll
    // until it has moved off the line-end).
    await page.keyboard.press("Home");
    await expect
      .poll(async () => (await currentSelection(page))?.start ?? Infinity, {
        timeout: 5000,
      })
      .toBeLessThan(endSel.start);
    const homeSel = (await currentSelection(page))!;
    expect(homeSel.start).toBe(homeSel.end);
    // Home lands at the line's first character; End is strictly later
    // unless the whole story is one empty line (excluded by chars > 1).
    expect(homeSel.start).toBeLessThan(endSel.start);
  });

  test("CARET-NAV-5 — double-click in text selects a range; typing replaces it @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    // REAL pointer path: mount the viewport, activate the Type tool,
    // and double-click on a glyph. WIRE GAP: without a word-bounds
    // query this resolves to the LINE (a non-empty range); the
    // strict single-word check is the fixme below.
    const rfx = await loadViaReactPath(page, "text");
    const rStory = rfx.firstStory!.selfId;
    await activateTool(page, "type");

    // Anchor on a real glyph: place a caret mid-story, read its page-pt
    // position from the engine, and convert to screen px to click there.
    const chars = await storyChars(page, rStory);
    const mid = Math.max(1, Math.floor(chars / 2));
    const geo = await caretGeo(page, { storyId: rStory, start: mid, end: mid });
    expect(geo, "caret geometry mid-story").toBeTruthy();
    // Nudge a few pt right of the caret leading edge so the hit lands
    // ON the glyph, and to its vertical middle.
    const pt = await screenPoint(
      page,
      geo!.xPt + 2,
      geo!.topPt + geo!.heightPt / 2,
    );

    await page.mouse.dblclick(pt.x, pt.y);

    // A range selection materialised (non-empty), with non-empty
    // geometry.
    await expect
      .poll(async () => {
        const s = await currentSelection(page);
        return s ? s.end - s.start : 0;
      }, { timeout: 6000 })
      .toBeGreaterThan(0);
    const sel = (await currentSelection(page))!;
    const rects = await selRects(page, sel);
    expect(rects.length, "double-click selection geometry").toBeGreaterThan(0);

    // Typing replaces the selected range: count delta = +1 − (range len).
    const rangeLen = sel.end - sel.start;
    const before = await storyChars(page, rStory);
    await page.keyboard.press("Z");
    await expect
      .poll(() => storyChars(page, rStory), { timeout: 5000 })
      .toBe(before - rangeLen + 1);
  });

  test("CARET-NAV-6 — double-click selects exactly the clicked word (requestWordBounds) @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    // Aftercare-A: protocol v31 exposes `requestWordBounds` (UAX-29
    // segmentation, story-local BYTE offsets). Double-click now selects
    // exactly the engine's word for the clicked offset — strictly
    // narrower than the line when the line has >1 word.
    const rfx = await loadViaReactPath(page, "text");
    const rStory = rfx.firstStory!.selfId;
    await activateTool(page, "type");

    const chars = await storyChars(page, rStory);
    const mid = Math.max(1, Math.floor(chars / 2));
    const geo = await caretGeo(page, { storyId: rStory, start: mid, end: mid });
    expect(geo, "caret geometry mid-story").toBeTruthy();

    // The engine's authoritative word + line extents at this offset.
    const word = await wordBoundsAt(page, rStory, mid);
    expect(word, "word bounds at mid offset").toBeTruthy();
    expect(word!.end).toBeGreaterThan(word!.start); // non-empty word
    const line = await lineBoundsAt(page, rStory, mid);
    expect(line, "line bounds at mid offset").toBeTruthy();
    // The word is contained within the line and (since the body copy is
    // multi-word) strictly narrower than the whole line.
    expect(word!.start).toBeGreaterThanOrEqual(line!.lineStart);
    expect(word!.end).toBeLessThanOrEqual(line!.lineEnd);
    expect(word!.end - word!.start).toBeLessThan(
      line!.lineEnd - line!.lineStart,
    );

    // Double-click on the glyph at `mid` → the selection is EXACTLY the
    // engine's word range (not the line).
    const pt = await screenPoint(
      page,
      geo!.xPt + 2,
      geo!.topPt + geo!.heightPt / 2,
    );
    await page.mouse.dblclick(pt.x, pt.y);

    await expect
      .poll(async () => {
        const s = await currentSelection(page);
        return s ? `${s.start}:${s.end}` : "";
      }, { timeout: 6000 })
      .toBe(`${word!.start}:${word!.end}`);

    // Engine contract: double-click on a WHITESPACE run selects the whole
    // whitespace run (UAX-29 segments runs of spaces as their own word).
    // Probe a space offset directly through the wire.
    const spaceOffset = await page.evaluate(
      async ({ storyId, hint }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                wordBounds: (
                  id: string,
                  off: number,
                ) => Promise<{ start: number; end: number } | null>;
              };
            };
          }
        ).__canvas;
        // Walk outward from the word end (typically a space follows a
        // word in the body copy) until a different word range appears.
        const base = await c.client.wordBounds(storyId, hint);
        if (!base) return null;
        for (let off = base.end; off < base.end + 8; off++) {
          const w = await c.client.wordBounds(storyId, off);
          if (w && (w.start !== base.start || w.end !== base.end)) {
            return { off, start: w.start, end: w.end };
          }
        }
        return null;
      },
      { storyId: rStory, hint: mid },
    );
    // A whitespace run between words resolves to its own non-empty range
    // disjoint from the original word (UAX-29 whitespace segmentation).
    expect(spaceOffset, "a distinct adjacent word/whitespace run").toBeTruthy();
    expect(spaceOffset!.end).toBeGreaterThan(spaceOffset!.start);
    expect(spaceOffset!.start).toBeGreaterThanOrEqual(word!.end);
  });

  test("CARET-NAV-6b — double-click on punctuation selects sensibly (UAX-29) @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    // Word-granularity edge case: a double-click landing on a punctuation
    // mark or a whitespace run must resolve to a sensible, non-empty range
    // via the wire (UAX-29 segments punctuation and whitespace as their
    // own breaks) — never an empty selection and never a crash. We probe
    // EVERY offset in the story through requestWordBounds and assert the
    // engine's contract holds at each one (this catches the punctuation /
    // whitespace edge cases without depending on which glyph the body copy
    // happens to put where).
    const chars = await storyChars(page, storyId);
    expect(chars).toBeGreaterThan(1);

    const probe = await page.evaluate(
      async ({ storyId, chars }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                wordBounds: (
                  id: string,
                  off: number,
                ) => Promise<{ start: number; end: number } | null>;
              };
            };
          }
        ).__canvas;
        const rows: Array<{ off: number; start: number; end: number } | null> =
          [];
        for (let off = 0; off < chars; off++) {
          const w = await c.client.wordBounds(storyId, off);
          rows.push(w ? { off, start: w.start, end: w.end } : null);
        }
        return rows;
      },
      { storyId, chars },
    );

    // Every interior offset resolves to a non-empty, well-formed range
    // whose span contains the probed offset (the word/punctuation/space
    // run the click lands in). No empty selections — a double-click always
    // yields a typeable range.
    for (const row of probe) {
      expect(row, "wordBounds resolved at every offset").toBeTruthy();
      expect(row!.end, `non-empty word at offset ${row!.off}`).toBeGreaterThan(
        row!.start,
      );
      expect(row!.start).toBeLessThanOrEqual(row!.off);
      expect(row!.end).toBeGreaterThanOrEqual(row!.off);
    }
  });

  test("CARET-NAV-7 — triple-click selects the whole paragraph across wrapped lines (requestParagraphBounds) @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    // W2.9: protocol v35 ships requestParagraphBounds (W1.23). Triple-
    // click now selects the WHOLE paragraph containing the offset —
    // spanning every wrapped visual line — strictly wider than the single
    // line a triple-click used to resolve to. Drives the REAL viewport
    // pointer path (ViewportCanvas multi-click run → applyTextGranularity).
    const rfx = await loadViaReactPath(page, "text");
    const rStory = rfx.firstStory!.selfId;
    await activateTool(page, "type");

    const chars = await storyChars(page, rStory);
    const mid = Math.max(1, Math.floor(chars / 2));
    const geo = await caretGeo(page, { storyId: rStory, start: mid, end: mid });
    expect(geo, "caret geometry mid-story").toBeTruthy();

    // The engine's authoritative paragraph + line extents at this offset.
    const para = await paragraphBoundsAt(page, rStory, mid);
    expect(para, "paragraph bounds at mid offset").toBeTruthy();
    expect(para!.end).toBeGreaterThan(para!.start); // non-empty paragraph
    const line = await lineBoundsAt(page, rStory, mid);
    expect(line, "line bounds at mid offset").toBeTruthy();
    // The paragraph CONTAINS the line, and (body copy wraps) is strictly
    // wider than the single line — the multi-line proof.
    expect(para!.start).toBeLessThanOrEqual(line!.lineStart);
    expect(para!.end).toBeGreaterThanOrEqual(line!.lineEnd);
    expect(
      para!.end - para!.start,
      "paragraph spans more than one wrapped line",
    ).toBeGreaterThan(line!.lineEnd - line!.lineStart);

    // The paragraph caret-spans >1 visual line — geometric multi-line
    // proof independent of the byte extents: the caret at the paragraph
    // start sits on a higher line than the caret at the paragraph end.
    const topCaret = await caretGeo(page, {
      storyId: rStory,
      start: para!.start,
      end: para!.start,
    });
    const botCaret = await caretGeo(page, {
      storyId: rStory,
      start: para!.end,
      end: para!.end,
    });
    expect(topCaret, "paragraph-start caret").toBeTruthy();
    expect(botCaret, "paragraph-end caret").toBeTruthy();
    expect(
      botCaret!.topPt - topCaret!.topPt,
      "paragraph spans multiple visual lines",
    ).toBeGreaterThan(0.5);

    // Triple-click on the glyph at `mid` → the selection is EXACTLY the
    // engine's paragraph range (not the line). Native `detail` is
    // unreliable for the 3rd click, so issue three discrete clicks at the
    // same point inside the multi-click window (matches ViewportCanvas's
    // own click-run tracking).
    const pt = await screenPoint(
      page,
      geo!.xPt + 2,
      geo!.topPt + geo!.heightPt / 2,
    );
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);

    await expect
      .poll(async () => {
        const s = await currentSelection(page);
        return s ? `${s.start}:${s.end}` : "";
      }, { timeout: 6000 })
      .toBe(`${para!.start}:${para!.end}`);
  });

  test("CARET-NAV-8 — typing replaces a triple-click paragraph selection @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:gesture", async ({
    page,
  }) => {
    // The paragraph range must behave like any other range selection:
    // typing one glyph deletes the whole paragraph and inserts the glyph
    // (count delta = +1 − paragraphLen). Drives the real pointer path for
    // the triple-click, then the real keyboard handler for the replace.
    const rfx = await loadViaReactPath(page, "text");
    const rStory = rfx.firstStory!.selfId;
    await activateTool(page, "type");

    const chars = await storyChars(page, rStory);
    const mid = Math.max(1, Math.floor(chars / 2));
    const geo = await caretGeo(page, { storyId: rStory, start: mid, end: mid });
    expect(geo, "caret geometry mid-story").toBeTruthy();
    const para = await paragraphBoundsAt(page, rStory, mid);
    expect(para, "paragraph bounds at mid offset").toBeTruthy();

    const pt = await screenPoint(
      page,
      geo!.xPt + 2,
      geo!.topPt + geo!.heightPt / 2,
    );
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);

    // Wait for the paragraph range to materialise on the mirror.
    await expect
      .poll(async () => {
        const s = await currentSelection(page);
        return s ? s.end - s.start : 0;
      }, { timeout: 6000 })
      .toBe(para!.end - para!.start);

    const sel = (await currentSelection(page))!;
    const rangeLen = sel.end - sel.start;
    const before = await storyChars(page, rStory);

    // Type a marker glyph — replace-on-type collapses the paragraph to it.
    await blurFocus(page);
    await page.keyboard.press("Z");
    await expect
      .poll(() => storyChars(page, rStory), { timeout: 5000 })
      .toBe(before - rangeLen + 1);

    // The caret collapsed to a single offset just past the inserted glyph.
    const after = (await currentSelection(page))!;
    expect(after.start).toBe(after.end);
    expect(after.start).toBe(sel.start + 1);
  });
});
