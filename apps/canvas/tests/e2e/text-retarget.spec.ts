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

// E2E — ADR 023: ONE Character/Paragraph panel that RETARGETS. The
// falsifiable test for the VALUE axis, the third and last proof consumer.
//
// WHY THIS IS A DIFFERENT PROOF FROM THE OTHER TWO, and not a third copy.
// ADR 023 requires three consumers of DIFFERENT SHAPE because one
// consumer only proves you built something shaped like its only caller:
//
//   · LAYERS   — an element COLLECTION addressed by ROW IDENTITY. A row
//     has ONE visibility; it cannot be mixed.
//   · SWATCHES — a DOCUMENT RESOURCE addressed by NOTHING
//     (`readCollection` takes no target). A list cannot be mixed either.
//   · CHARACTER/PARAGRAPH — SCALAR values addressed by a RANGE, whose
//     value over a multi-format selection is MIXED. This one. The ADR
//     says it is what constrains the value model, and the two things it
//     constrains are exactly what this spec asserts:
//       (a) MIXED must be reported, not resolved to a winner;
//       (b) `absent` must NOT fall through to core.
//
// (b) is not hypothetical here, and that is the point. The text caret is
// INDEPENDENT of the edit-context stack: entering a plugin's frame does
// not clear a caret left in a text frame. So every case below sets a
// REAL core content selection FIRST, with values chosen to be impossible
// to confuse with the workbook's, and then asserts the panel does not
// show them.
//
//   AC-TEXT-RETARGET-1  a core story range answers from CORE, and a
//                       multi-format range reports MIXED rather than
//                       picking one of its two font sizes;
//   AC-TEXT-RETARGET-2  double-clicking a lowered sheet frame enters
//                       paged.sheet's `sheet` context and the SAME
//                       panel is answered by media.paged.sheet with the
//                       WORKBOOK's cell font — while the core caret
//                       still holds a different one;
//   AC-TEXT-RETARGET-3  Esc pops and the panel returns to core.
//                       Retargeting, not a one-way switch;
//   AC-TEXT-MIXED-1     a sheet frame spanning two differently-styled
//                       cells reports MIXED through the provider;
//   AC-TEXT-ABSENT-1    a path a cell does not model (`characterLeading`,
//                       `paragraphRuleAbove`, `characterFillColor`) is
//                       ABSENT — a read-only seam, NOT the core caret's
//                       value, and NOT the mixed face;
//   AC-TEXT-READONLY-1  the whole panel is READ-ONLY over the sheet,
//                       because paged.sheet declares `writablePaths: []`.
//                       This is the assertion neither other consumer
//                       could make: Layers and Swatches write through
//                       `provides.ops`, which was declared all along.
//
// Neither host panel contains an `if (pluginId === …)` and neither does
// the platform seam they read through. `data-binding-source` is a DOM
// hook and a diagnostic; this spec is the only thing that reads it.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHARACTER_PANEL = "paged.character";
const PARAGRAPH_PANEL = "paged.paragraph";
const SHEET_PLUGIN = "media.paged.sheet";
const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";

/** The text-styles workbook. A1/A2 are bold 18pt Georgia; B1/B2 are
 *  italic 9pt Verdana; C1/C2 carry the workbook DEFAULT font and
 *  therefore no override at all.
 *
 *  Every one of those facts is pinned against the REAL wasm engine in
 *  plugin-sheets' own `engine-real.spec.ts`
 *  (`sheet_js_get_range_styled_resolves_cell_styles` does the same in
 *  Rust), so the two ends of the seam agree by test rather than by
 *  coincidence — the discipline the Swatches slice used for its minted
 *  palette id. A style-less fixture would make every assertion below
 *  vacuously true, which is the exact shape of a green test that proves
 *  nothing. */
const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/sheet-14-textstyles.xlsx",
);

/** Column A's authored font — what the panel must show over `A1:A2`. */
const A_SIZE_PT = 18;
const A_FAMILY = "Georgia";
const A_STYLE = "Bold";
/** Column B's — different on every facet, so an A+B range is genuinely
 *  mixed and not mixed by accident. */
const B_SIZE_PT = 9;

/** A font size no cell in the workbook carries, written onto the core
 *  story so "the panel changed" can never be true for the wrong reason —
 *  and so a fall-through would be VISIBLE rather than plausible. */
const CORE_SIZE_PT = 42;
const CORE_SIZE_PT_2 = 31;
/** Ditto for leading: the path the sheet answers `absent` for. If the
 *  seam ever fell through, THIS is what the panel would show. */
const CORE_LEADING_PT = 77;

interface ElementRef {
  kind: string;
  id: string;
}

interface StoryInfo {
  selfId: string;
  characterCount: number;
}

/** One composition-rendered control's platform verdict: WHO answered and
 *  WHAT kind of answer it was. Both live on the wrapper the catalog
 *  renderer already stamps — the leaf never learns either. */
async function bindingOf(
  page: Page,
  panel: string,
  path: string,
): Promise<{ source: string | null; state: string | null }> {
  const el = page.locator(`${panel} [data-control="${path}"]`).first();
  await expect(el).toHaveCount(1);
  return {
    source: await el.getAttribute("data-binding-source"),
    state: await el.getAttribute("data-binding-state"),
  };
}

/** The numeric value a LengthInput/NumberInput control is showing. Read
 *  from the DOM, not from the model: the whole question is what the USER
 *  sees. */
async function shownValue(
  page: Page,
  panel: string,
  path: string,
): Promise<string> {
  const input = page.locator(`${panel} [data-control="${path}"] input`).first();
  return (await input.inputValue()).trim();
}

/** Read a property straight off the engine — the ground truth the CORE
 *  half of the retarget must equal, independent of the panel. */
async function engineRangeProp(
  page: Page,
  story: string,
  start: number,
  end: number,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ story: s, start: a, end: b, path: p }) => {
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
      const props = await c.client.elementProperties({
        kind: "storyRange",
        id: { story_id: s, start: a, end: b },
      });
      const entry = props?.entries.find((e) => e.path === p);
      // `undefined` = the path is not modelled for this address at all;
      // `null` = modelled and MIXED (core's own convention).
      return entry === undefined ? "no-entry" : entry.value;
    },
    { story, start, end, path },
  );
}

/** The first story with text, via the script bridge. */
async function firstStory(page: Page): Promise<StoryInfo> {
  const story = await page.evaluate(async () => {
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
    const stories = JSON.parse(r.output[0] ?? "[]") as StoryInfo[];
    return stories.find((s) => s.characterCount > 8) ?? null;
  });
  expect(story).not.toBeNull();
  return story!;
}

/** Write one character property over a story sub-range through core's
 *  own op — the same mutation the panel's own commit sends. */
async function setRangeProp(
  page: Page,
  story: string,
  start: number,
  end: number,
  path: string,
  value: unknown,
): Promise<void> {
  await page.evaluate(
    async ({ story: s, start: a, end: b, path: p, value: v }) => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: {
            kind: "storyRange",
            id: { story_id: s, start: a, end: b },
          },
          path: p,
          value: v,
        },
      });
    },
    { story, start, end, path, value },
  );
}

/** Point the editor's CONTENT selection at a story range. The shell's own
 *  door — the same state a caret drag produces. */
async function setContentSelection(
  page: Page,
  story: string,
  start: number,
  end: number,
): Promise<void> {
  await page.evaluate(
    ({ story: s, start: a, end: b }) => {
      (
        globalThis as unknown as {
          __canvas: {
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas.setContentSelection({ storyId: s, start: a, end: b });
    },
    { story, start, end },
  );
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds. */
async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  [number, number, number, number, number, number] | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const px = a * cx + cc * cy + tx;
    const py = b * cx + d * cy + ty;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + px * cam.scale + cam.tx,
      y: wrap.top + py * cam.scale + cam.ty,
    };
  }, ref);
}

/** The single-selected element, via the worker. */
async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
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
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Import the fixture through the workbook panel's picker and lower a
 *  range to a page frame; resolves to the created frame's ref. */
async function importAndLower(page: Page, range: string): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
  await rangeInput.fill(range);
  await page.locator("[data-sheet-lower]").click();
  let frame: ElementRef | null = null;
  await expect
    .poll(
      async () => {
        frame = await selectedElement(page);
        return frame?.kind ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return frame!;
}

/** Enter paged.sheet's `sheet` context by double-clicking the lowered
 *  frame, then RE-RAISE `panel`.
 *
 *  Re-raising is what a user does, and it is here for the reason both
 *  earlier retarget specs record: entering a plugin context relayouts
 *  the right-hand dock and dockview unmounts inactive tabs, so a shared
 *  panel can be off screen at the exact moment it retargets. That
 *  `EditContextContribution.panelIds` fights a retargeting panel is an
 *  open ADR-023 follow-up, not something this spec papers over. */
async function enterSheetContext(
  page: Page,
  frame: ElementRef,
  panel: string,
): Promise<void> {
  const at = await elementScreenCenter(page, frame);
  expect(at).not.toBeNull();
  await page.mouse.dblclick(at!.x, at!.y);
  await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
    timeout: 10_000,
  });
  await openPanel(page, panel);
}

test.describe("E2E text-retarget (ADR 023 — the VALUE axis)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("text"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __canvas: { ready: boolean } })
                .__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.keyboard.press("Home");
    await page.waitForTimeout(1200);
  });

  test("AC-TEXT-RETARGET-1/2/3 — the SAME panel is answered by core, then by paged.sheet, then by core again", async ({
    page,
  }) => {
    // There is exactly ONE Character panel and ONE Paragraph panel in
    // the whole app — host panels and every loaded bundle's, in one
    // registry. Asserted against the registry rather than the DOM,
    // because "one panel" is a statement about panel IDENTITY, not about
    // how many nodes the dock happens to mount.
    const textPanels = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: {
              panels: { list: () => { id: string; title: string }[] };
            };
          };
        }
      ).__canvas.registries.panels
        .list()
        .filter((p) =>
          ["character", "paragraph"].includes(p.title.trim().toLowerCase()),
        )
        .map((p) => p.id)
        .sort(),
    );
    expect(textPanels).toEqual([CHARACTER_PANEL, PARAGRAPH_PANEL]);

    // --- core answers ---------------------------------------------------
    const story = await firstStory(page);
    await setRangeProp(page, story.selfId, 0, 4, "characterFontSize", {
      type: "length",
      value: CORE_SIZE_PT,
    });
    await setContentSelection(page, story.selfId, 0, 4);
    await openPanel(page, CHARACTER_PANEL);
    await expect(page.locator('[data-character-panel="ready"]')).toBeVisible();

    const panel = '[data-character-panel="ready"]';
    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 10_000,
      })
      .toEqual({ source: "core", state: "value" });
    // …and it is the ENGINE's value, read independently of the panel.
    expect(
      await engineRangeProp(page, story.selfId, 0, 4, "characterFontSize"),
    ).toEqual({ type: "length", value: CORE_SIZE_PT });
    expect(await shownValue(page, panel, "characterFontSize")).toContain(
      String(CORE_SIZE_PT),
    );

    // --- paged.sheet answers --------------------------------------------
    // Lower ONE styled cell: `A1` alone, so the answer is a definite
    // value rather than a collapse (the mixed case is AC-TEXT-MIXED-1).
    const frame = await importAndLower(page, "A1");
    await enterSheetContext(page, frame, CHARACTER_PANEL);
    // RE-ARM THE CORE CARET, deliberately, and this is the whole point of
    // the case rather than test hygiene. The double-click that entered
    // the frame also cleared the content selection, and a cleared core
    // selection would make "the panel does not show core's value"
    // trivially true. Setting it back puts a LIVE 42pt story range under
    // the panel WHILE paged.sheet owns it — which is the state the seam
    // has to get right, and which a user reaches by carrying a caret in
    // from a previous edit.
    await setContentSelection(page, story.selfId, 0, 4);

    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 15_000,
      })
      .toEqual({ source: SHEET_PLUGIN, state: "value" });
    // DIFFERENT content — this is what makes the retarget falsifiable
    // rather than decorative. And the two values cannot be confused:
    // 18pt is the workbook's, 42pt the core caret's.
    expect(await shownValue(page, panel, "characterFontSize")).toContain(
      String(A_SIZE_PT),
    );
    expect(await shownValue(page, panel, "characterFontSize")).not.toContain(
      String(CORE_SIZE_PT),
    );
    // The core caret STILL holds 42pt — the panel retargeted, the
    // selection did not move. This is the assertion that makes the
    // `absent` rule matter: falling through is not hypothetical, the
    // stale answer is right there.
    expect(
      await engineRangeProp(page, story.selfId, 0, 4, "characterFontSize"),
    ).toEqual({ type: "length", value: CORE_SIZE_PT });

    // The other two valued paths retarget with it.
    expect(await bindingOf(page, panel, "characterFontStyle")).toEqual({
      source: SHEET_PLUGIN,
      state: "value",
    });
    const family = page.locator(`${panel} [data-character-family]`);
    await expect(family).toHaveAttribute("data-binding-source", SHEET_PLUGIN);
    await expect(family).toHaveAttribute("data-binding-state", "value");
    await expect(family.locator("select")).toHaveValue(A_FAMILY);
    await expect(
      page.locator(`${panel} [data-control="characterFontStyle"] select`),
    ).toHaveValue(A_STYLE);

    // The registry agrees about who is active, and it is BORROWED from
    // the edit-context stack — no second notion of activation. TWO
    // providers on one context: the swatches one and this one.
    const active = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __bindingProviders: {
            active: () => {
              plugin: string;
              contextType: string;
              provides: { writablePaths?: string[] };
            }[];
          };
        }
      ).__bindingProviders.active(),
    );
    expect(active.map((a) => [a.plugin, a.contextType])).toEqual([
      [SHEET_PLUGIN, "sheet"],
      [SHEET_PLUGIN, "sheet"],
    ]);

    // --- core answers again ---------------------------------------------
    // The SAME core selection is still live — nothing about it changed
    // while the provider owned the panel. Popping the context is enough
    // to hand it back, which is what "retargets" means as opposed to "a
    // one-way switch".
    await page.keyboard.press("Escape");
    await openPanel(page, CHARACTER_PANEL);
    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 10_000,
      })
      .toEqual({ source: "core", state: "value" });
    expect(await shownValue(page, panel, "characterFontSize")).toContain(
      String(CORE_SIZE_PT),
    );
  });

  test("AC-TEXT-MIXED-1 — MIXED, for CORE content and through the PROVIDER", async ({
    page,
  }) => {
    const panel = '[data-character-panel="ready"]';
    const story = await firstStory(page);

    // --- core: a genuinely multi-format range ---------------------------
    // Two different sizes over one story, then a selection spanning both.
    await setRangeProp(page, story.selfId, 0, 3, "characterFontSize", {
      type: "length",
      value: CORE_SIZE_PT,
    });
    await setRangeProp(page, story.selfId, 3, 6, "characterFontSize", {
      type: "length",
      value: CORE_SIZE_PT_2,
    });
    // The two sub-ranges really do disagree — otherwise "mixed" below
    // would be true for the wrong reason.
    expect(
      await engineRangeProp(page, story.selfId, 0, 3, "characterFontSize"),
    ).toEqual({ type: "length", value: CORE_SIZE_PT });
    expect(
      await engineRangeProp(page, story.selfId, 3, 6, "characterFontSize"),
    ).toEqual({ type: "length", value: CORE_SIZE_PT_2 });
    // Core's OWN mixed signal: the entry EXISTS and its value is null.
    // (`collapse_uniform` → `None`; the wire comment says exactly this.)
    // Note it is a different fact from "no entry", which the binding hook
    // used to collapse into the same em-dash.
    expect(
      await engineRangeProp(page, story.selfId, 0, 6, "characterFontSize"),
    ).toBeNull();

    await setContentSelection(page, story.selfId, 0, 6);
    await openPanel(page, CHARACTER_PANEL);
    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 10_000,
      })
      .toEqual({ source: "core", state: "mixed" });
    // The USER-visible half: no winner picked. Neither size is shown.
    const coreShown = await shownValue(page, panel, "characterFontSize");
    expect(coreShown).not.toContain(String(CORE_SIZE_PT));
    expect(coreShown).not.toContain(String(CORE_SIZE_PT_2));

    // --- provider: a range spanning two differently-styled cells --------
    // `A1:B1` — bold 18pt Georgia beside italic 9pt Verdana.
    const frame = await importAndLower(page, "A1:B1");
    await enterSheetContext(page, frame, CHARACTER_PANEL);
    // Re-arm the core caret inside the context (see AC-TEXT-ABSENT-1):
    // the last assertion below — that the panel does not fall back on
    // core's number when the provider says MIXED — needs core to HAVE a
    // number.
    await setContentSelection(page, story.selfId, 0, 6);
    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 15_000,
      })
      .toEqual({ source: SHEET_PLUGIN, state: "mixed" });
    const sheetShown = await shownValue(page, panel, "characterFontSize");
    expect(sheetShown).not.toContain(String(A_SIZE_PT));
    expect(sheetShown).not.toContain(String(B_SIZE_PT));
    // …and not the core caret's either. Mixed is mixed; it is never a
    // reason to go looking somewhere else for a number.
    expect(sheetShown).not.toContain(String(CORE_SIZE_PT));

    // Every valued path is mixed, not just the one — the cells differ on
    // face and family too.
    expect(await bindingOf(page, panel, "characterFontStyle")).toEqual({
      source: SHEET_PLUGIN,
      state: "mixed",
    });
    await expect(
      page.locator(`${panel} [data-character-family]`),
    ).toHaveAttribute("data-binding-state", "mixed");
  });

  test("AC-TEXT-ABSENT-1 — an owned-but-inapplicable path is a SEAM, never core's value", async ({
    page,
  }) => {
    const panel = '[data-character-panel="ready"]';
    const para = '[data-paragraph-panel="ready"]';
    const story = await firstStory(page);

    // Leave a LIVE core caret carrying values the sheet does not model.
    // If the seam fell through, these are precisely what the panel would
    // show — so the assertions below are falsifiable, not decorative.
    await setRangeProp(page, story.selfId, 0, 4, "characterLeading", {
      type: "length",
      value: CORE_LEADING_PT,
    });
    await setContentSelection(page, story.selfId, 0, 4);
    await openPanel(page, CHARACTER_PANEL);
    await expect
      .poll(() => bindingOf(page, panel, "characterLeading"), {
        timeout: 10_000,
      })
      .toEqual({ source: "core", state: "value" });
    expect(await shownValue(page, panel, "characterLeading")).toContain(
      String(CORE_LEADING_PT),
    );

    const frame = await importAndLower(page, "A1");
    await enterSheetContext(page, frame, CHARACTER_PANEL);
    // RE-ARM the caret INSIDE the context. Without this the double-click
    // that entered the frame has already cleared it, and "the panel does
    // not show 77pt" would be true because there is no 77pt anywhere —
    // the exact shape of a green test that proves nothing. With it, core
    // is sitting right there with an answer and the seam has to refuse
    // it. The two selections are independent by construction; nothing in
    // the editor makes entering a plugin context drop a caret.
    await setContentSelection(page, story.selfId, 0, 4);
    expect(
      await engineRangeProp(page, story.selfId, 0, 4, "characterLeading"),
    ).toEqual({ type: "length", value: CORE_LEADING_PT });

    // A spreadsheet cell has no leading. The provider OWNS the selection
    // and says so; the host must not answer from core.
    await expect
      .poll(() => bindingOf(page, panel, "characterLeading"), {
        timeout: 15_000,
      })
      .toEqual({ source: SHEET_PLUGIN, state: "absent" });
    expect(await shownValue(page, panel, "characterLeading")).not.toContain(
      String(CORE_LEADING_PT),
    );
    // ABSENT IS NOT MIXED. The em-dash face means "no definite value to
    // show", which would be a claim that the cell HAS a leading the runs
    // disagree about. It renders as an honest SEAM instead — the
    // platform's existing "this control cannot work here" presentation.
    const leading = page.locator(`${panel} [data-control="characterLeading"]`);
    await expect(leading.locator("[data-seam]")).toHaveCount(1);
    await expect(leading.locator("[data-mixed]")).toHaveCount(0);

    // `characterFillColor` is absent for a DIFFERENT reason and it is
    // worth pinning separately: the cell's text colour IS known, as a
    // raw #RRGGBB, but core resolves a colorRef by SWATCH ID — so
    // serving it would hand the panel a reference naming nothing. Same
    // ruling the Swatches slice made in the other direction.
    expect(await bindingOf(page, panel, "characterFillColor")).toEqual({
      source: SHEET_PLUGIN,
      state: "absent",
    });

    // The PARAGRAPH panel too — a cell has no paragraph at all, and this
    // is the second host panel proving the same seam.
    await openPanel(page, PARAGRAPH_PANEL);
    await expect(page.locator(para)).toBeVisible();
    await expect
      .poll(() => bindingOf(page, para, "paragraphSpaceBefore"), {
        timeout: 15_000,
      })
      .toEqual({ source: SHEET_PLUGIN, state: "absent" });
    // Including its bespoke rule rows, which resolve their own bindings.
    await expect(
      page.locator(`${para} [data-control="paragraphRuleAbove"]`),
    ).toHaveAttribute("data-binding-state", "absent");
  });

  test("AC-TEXT-READONLY-1 — the panel is READ-ONLY over the sheet, because paged.sheet declares it", async ({
    page,
  }) => {
    const panel = '[data-character-panel="ready"]';
    const story = await firstStory(page);
    await setContentSelection(page, story.selfId, 0, 4);
    await openPanel(page, CHARACTER_PANEL);

    // Over CORE every control is live — core writes everything it models.
    await expect
      .poll(
        async () => (await bindingOf(page, panel, "characterFontSize")).source,
        {
          timeout: 10_000,
        },
      )
      .toBe("core");
    await expect(
      page.locator(`${panel} [data-control="characterFontSize"] input`).first(),
    ).toBeEnabled();
    await expect(
      page.locator(`${panel} [data-character-family] select`),
    ).toBeEnabled();
    await expect(
      page.locator(`${panel} [data-opentype-chip]`).first(),
    ).toBeEnabled();

    const frame = await importAndLower(page, "A1");
    await enterSheetContext(page, frame, CHARACTER_PANEL);
    // Re-arm the caret inside the context, as above: with a LIVE core
    // selection under it, "disabled" cannot be explained away by "there
    // was nothing to write to".
    await setContentSelection(page, story.selfId, 0, 4);
    await expect
      .poll(() => bindingOf(page, panel, "characterFontSize"), {
        timeout: 15_000,
      })
      .toEqual({ source: SHEET_PLUGIN, state: "value" });

    // …and READ-ONLY here, including the paths whose VALUE it is showing.
    // Not because writing is hard, but because the alternative — offer
    // the control and let the write fall through on refusal — lands the
    // commit on core's selection. Same lie, write side.
    //
    // This is the assertion the other two consumers could not make.
    // Layers and Swatches write STRUCTURALLY, through `provides.ops`,
    // whose availability was declared all along; the property lane had
    // no declaration at all until `provides.writablePaths`, and that
    // gap is what the VALUE axis found.
    await expect(
      page.locator(`${panel} [data-control="characterFontSize"] input`).first(),
    ).toBeDisabled();
    await expect(
      page.locator(`${panel} [data-character-family] select`),
    ).toBeDisabled();
    await expect(
      page.locator(`${panel} [data-opentype-chip]`).first(),
    ).toBeDisabled();

    // The declaration the host read to decide that, straight off the
    // registry — a CAPABILITY question whose answer is a list of paths,
    // never a plugin id.
    const writable = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __bindingProviders: {
            active: () => {
              provides: { paths?: string[]; writablePaths?: string[] };
            }[];
          };
        }
      ).__bindingProviders
        .active()
        .filter((a) => (a.provides.paths?.length ?? 0) > 0)
        .map((a) => a.provides.writablePaths),
    );
    expect(writable).toEqual([[]]);
  });
});
