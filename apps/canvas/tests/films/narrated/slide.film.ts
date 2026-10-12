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

// paged.slide, the plugin film (ADR 224): the website's `films/slide.yaml`.
// A PowerPoint deck authored for the films (media/assets/pitch-deck.pptx,
// set in Calibri like most real decks) opens through File ▸ Open…; the
// Slides panel reorders and hides, the Type tool edits a title, the Notes
// panel keeps speaker notes, and the export centre writes the deck back.
// Every step is asserted, and so is the export's limit the voice states:
// order, hidden slides and notes go back to PowerPoint, edited text not yet.

import { expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { menu, press } from "../kit/ui";
import { cameraScale } from "../../e2e/harness/viewport";
import { typeHuman } from "../kit/pointer";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");
const NOTE = "Ask who reads the mailing edition.";

/** A point on the slide the canvas is fitted to, in slide points. A slide
 *  clicked in the Slides panel is fitted and centred in the canvas. */
async function slidePt(k: Kit, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await k.page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("no canvas");
  const s = await cameraScale(k.page);
  return { x: box.x + box.width / 2 + (x - 480) * s, y: box.y + box.height / 2 + (y - 270) * s };
}

const thumbs = (page: Page) => page.locator('[data-slides-panel="ready"] [data-slide]');

/** Scroll a control of the Slides panel into view, then click it. */
async function pressIn(k: Kit, l: Locator): Promise<void> {
  await l.scrollIntoViewIfNeeded();
  await k.hold(250);
  await press(k, l);
}

async function goToSlide(k: Kit, index: number): Promise<void> {
  const row = thumbs(k.page).nth(index);
  await pressIn(k, row.locator("button").first());
  await expect(row).toHaveAttribute("data-active", "true", { timeout: 10_000 });
  await k.hold(700);
}

async function order(page: Page): Promise<string[]> {
  return thumbs(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-slide") ?? ""));
}

async function storyLengths(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: { client: { collection(n: string): Promise<Array<{ characterCount: number }>> } } }).__canvas;
    return (await c.client.collection("stories")).map((s) => s.characterCount);
  });
}

async function slideNotes(page: Page): Promise<Array<string | null>> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: { client: { collection(n: string): Promise<Array<{ pluginMetadata?: Array<{ key: string; value: string }> }>> } } }).__canvas;
    return (await c.client.collection("pages")).map((p) => {
      const v = p.pluginMetadata?.find((m) => m.key === "x-paged:media.paged.slide")?.value;
      return v ? ((JSON.parse(v) as { data: { notes?: string } }).data.notes ?? null) : null;
    });
  });
}

/** What a .pptx says, read from its parts: each slide in deck order with its
 *  text, whether it is hidden, and its speaker notes. */
function readDeck(file: string): Array<{ text: string; hidden: boolean; notes: string }> {
  const part = (name: string) => {
    try {
      return execFileSync("unzip", ["-p", file, name], { encoding: "utf8" });
    } catch {
      return "";
    }
  };
  const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
  const rels = (xml: string) => new Map([...xml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const presRels = rels(part("ppt/_rels/presentation.xml.rels"));
  const ids = [...part("ppt/presentation.xml").matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  return ids.map((rid) => {
    const target = presRels.get(rid)!.replace(/^\/?ppt\//, "");
    const xml = part(`ppt/${target}`);
    const slideRels = rels(part(`ppt/${target.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels")}`));
    const notesTarget = [...slideRels.values()].find((t) => t.includes("notesSlide"));
    const notes = notesTarget ? texts(part(`ppt/${notesTarget.replace(/^\.\.\//, "")}`)) : "";
    return { text: texts(xml), hidden: /<p:sld\b[^>]*\bshow="0"/.test(xml), notes };
  });
}

film("slide", async (k) => {
  const { page, designer, pointer } = k;

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();

  // ── File ▸ Open… a PowerPoint deck: a page per slide. ──
  await k.scene("open", async () => {
    await k.hold(300);
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("pitch-deck.pptx", "file");
    await (await chooser).setFiles(join(ASSETS, "pitch-deck.pptx"));
    await expect.poll(async () => (await designer.handle()).pageCount, { timeout: 20_000 }).toBe(6);
    for (const [w, h] of (await designer.handle()).pageSizesPt) expect([Math.round(w), Math.round(h)]).toEqual([960, 540]);
    await k.hold(800);
  });

  // ── The Slides panel; the chart slide, fitted. ──
  await k.scene("slides", async () => {
    await press(k, page.locator('[data-panel-rail-item="media.paged.slide.panel.slides"]'));
    await expect(thumbs(page)).toHaveCount(6, { timeout: 10_000 });
    await expect(thumbs(page).locator("img")).toHaveCount(6, { timeout: 30_000 });
    await k.hold(500);
    await goToSlide(k, 2);
  });

  // ── The substituted-font marker, close up. ──
  await k.scene("fonts", async () => {
    await pointer.moveTo(await slidePt(k, 900, 500), { targetWidth: 200 });
    await k.hold(400);
  });

  // ── Drag slide 4 up to second place. ──
  let before: string[] = [];
  await k.scene("reorder", async () => {
    before = await order(page);
    const src = thumbs(page).nth(3).locator("img");
    const dst = thumbs(page).nth(1).locator("img");
    await thumbs(page).nth(0).scrollIntoViewIfNeeded();
    const a = (await src.boundingBox())!;
    const b = (await dst.boundingBox())!;
    await pointer.drag({ x: a.x + a.width / 2, y: Math.min(a.y + a.height / 2, 880) }, { x: b.x + b.width / 2, y: b.y + 12 }, { speed: 0.7 });
    await expect.poll(() => order(page)).toEqual([before[0], before[3], before[1], before[2], before[4], before[5]]);
    await k.hold(500);
  });

  // ── Hide the fifth slide from the slideshow. ──
  await k.scene("hide", async () => {
    const hide = thumbs(page).nth(4).getByRole("button", { name: "Hide", exact: true });
    await pressIn(k, hide);
    await expect(thumbs(page).nth(4).locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "true");
    await k.hold(500);
  });

  // ── To the moved slide, with the Type tool. ──
  await k.scene("goto", async () => {
    await goToSlide(k, 1);
    await k.key("t", "Type tool");
  });

  // ── Edit its title in place. ──
  await k.scene("edit", async () => {
    const lengths = await storyLengths(page);
    // After the title's last word: the caret lands at the end of the line.
    await pointer.click(await slidePt(k, 722, 66), { targetWidth: 30 });
    await k.hold(300);
    await typeHuman(page, " this year");
    await expect
      .poll(async () => (await storyLengths(page)).map((n, i) => n - (lengths[i] ?? 0)).filter((d) => d !== 0))
      .toEqual([10]);
    await k.hold(600);
  });

  // ── Speaker notes beside the slide. ──
  await k.scene("notes", async () => {
    await k.key("Escape");
    await press(k, page.locator('[data-panel-rail-item="media.paged.slide.panel.notes"]'));
    const field = page.locator("[data-notes-text]");
    await expect(page.locator('[data-notes-panel="ready"]')).toContainText("Slide 2");
    await press(k, field);
    await typeHuman(page, NOTE);
    // Notes are written when the field lets go of the keyboard.
    await k.key("v");
    await expect.poll(async () => (await slideNotes(page))[1]).toBe(NOTE);
  });

  // ── Back to PowerPoint, from the export centre. ──
  const saved = join(k.dir, "exported.pptx");
  await k.scene("export", async () => {
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(600);
    const download = page.waitForEvent("download");
    await press(k, page.locator('[data-plugin-export="media.paged.slide.exporter.pptx"]'));
    const file = await download;
    k.chip(`${file.suggestedFilename()} saved`, "save");
    await file.saveAs(saved);
    await k.hold(400);
  });

  // ── What the export carried, and what it did not. ──
  await k.scene("limits", async () => {
    const deck = readDeck(saved);
    expect(deck).toHaveLength(6);
    expect(deck[1].text, "the moved slide is second").toContain("What readers asked for");
    expect(deck[1].text, "edited text is not written back yet").not.toContain("this year");
    expect(deck[1].notes, "the new notes went with it").toContain(NOTE);
    expect(deck.map((s) => s.hidden), "only the hidden slide is hidden").toEqual([false, false, false, false, true, false]);
    expect(deck[0].notes).toContain("Welcome everyone");
    await k.hold(300);
  });
});
