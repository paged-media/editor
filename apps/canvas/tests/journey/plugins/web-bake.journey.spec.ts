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

// Journey: BAKE a web frame to native content — one batch, one undo step,
// and the native text keeps its face.
//
//   1. a web frame holding "Plain <b>Bold</b> tail" in Inter (plus a solid
//      block, so a native fill is baked too);
//   2. "Bake web frame to document" sends exactly ONE mutation (a `batch`)
//      and mints native page items: text frames whose stories hold the
//      runs, each with its family, and the bold run's style Bold — read
//      from the exported IDML, the form a foreign open sees;
//   3. ONE document undo removes everything the bake made: the page items
//      and stories are back to what they were, and the web frame with its
//      source is untouched.

import { expect, test, type Page } from "@playwright/test";

import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";
import { Designer } from "../driver/designer";
import {
  BAKE,
  insertWebFrameWith,
  invoke,
  mutationsSince,
  select,
  tapMark,
  tapSceneLayers,
  undo,
  webSource,
  type ElementRef,
} from "./web-kit";

const HTML =
  "<div class='block'></div><p>Plain <b>Bold</b> tail</p>";
const CSS =
  ".block { width: 120px; height: 24px; background: #c0392b; margin: 0 0 8px; }\n" +
  "p { margin: 0; font: 20px/28px Inter, sans-serif; color: #101820; }";

/** Every page item id in the scene tree. */
async function pageItems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    type Node = { id?: { kind: string; id: unknown } | null; children?: Node[] | null };
    const c = (
      globalThis as unknown as { __canvas: { client: { sceneTree: () => Promise<Node[]> } } }
    ).__canvas.client;
    const out: string[] = [];
    const walk = (nodes: Node[] | null | undefined) => {
      for (const n of nodes ?? []) {
        if (n.id && typeof n.id.id === "string") out.push(`${n.id.kind}:${n.id.id}`);
        walk(n.children);
      }
    };
    walk(await c.sceneTree());
    return out.sort();
  });
}

interface Run {
  text: string;
  font: string | null;
  style: string | null;
}

/** Every character run of every story in the exported IDML. */
async function storyRuns(page: Page): Promise<Run[]> {
  const bytes = await page.evaluate(async () =>
    Array.from(
      await (
        globalThis as unknown as { __canvas: { client: { exportIdml: () => Promise<Uint8Array> } } }
      ).__canvas.client.exportIdml(),
    ),
  );
  const idml = Buffer.from(bytes);
  const runs: Run[] = [];
  for (const name of zipEntryNames(idml).filter((n) => n.startsWith("Stories/"))) {
    const story = readZipText(idml, name) ?? "";
    for (const m of story.matchAll(/<CharacterStyleRange\b([^>]*)>([\s\S]*?)<\/CharacterStyleRange>/g)) {
      const text = [...m[2]!.matchAll(/<Content>([\s\S]*?)<\/Content>/g)].map((c) => c[1]).join("");
      if (!text) continue;
      runs.push({
        text,
        font: m[2]!.match(/<AppliedFont\b[^>]*>([^<]*)<\/AppliedFont>/)?.[1] ?? null,
        style: m[1]!.match(/\bFontStyle="([^"]*)"/)?.[1] ?? null,
      });
    }
  }
  return runs;
}

test.describe("journey · paged.web bake to document", () => {
  test("baking a web frame is one batch and one undo step, and the baked text keeps its family and bold style @feat:plugin-web.bake-to-native @feat:plugin-web.web-fonts @feat:plugin-web.engine-rendering @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);

    const frame: ElementRef = await insertWebFrameWith(page, HTML, CSS);
    const itemsBefore = await pageItems(page);
    const runsBefore = await storyRuns(page);
    const logs: string[] = [];
    page.on("console", (m) => {
      if (/bakeWebFrame:/.test(m.text())) logs.push(m.text());
    });

    // ── 2. Bake: one mutation, native items with their faces. ──
    await select(page, [frame]);
    const mark = await tapMark(page);
    await invoke(page, BAKE);
    await expect.poll(() => logs.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(logs.join(" | "), "the bake reports what it made").toMatch(/baked \d+ native item/);
    expect(await mutationsSince(page, mark), "a bake is ONE batch mutation").toEqual(["batch"]);

    const itemsAfter = await pageItems(page);
    const minted = itemsAfter.filter((i) => !itemsBefore.includes(i));
    expect(itemsBefore.every((i) => itemsAfter.includes(i)), "the bake removes nothing").toBe(true);
    expect(minted.filter((i) => i.startsWith("textFrame:")).length, "native text frames").toBeGreaterThan(0);
    expect(minted.length, "a native fill beside the text").toBeGreaterThan(
      minted.filter((i) => i.startsWith("textFrame:")).length,
    );

    const baked = (await storyRuns(page)).slice(runsBefore.length);
    const text = baked.map((r) => r.text).join(" ");
    for (const word of ["Plain", "Bold", "tail"]) expect(text).toContain(word);
    for (const r of baked) expect(r.font, `run "${r.text}" names its family`).toBe("Inter");
    const bold = baked.filter((r) => r.text.includes("Bold"));
    expect(bold.length, "the bold run baked as its own run").toBeGreaterThan(0);
    for (const r of bold) expect(r.style, `run "${r.text}" is Bold`).toBe("Bold");
    for (const r of baked.filter((x) => !x.text.includes("Bold"))) {
      expect(r.style ?? "Regular", `run "${r.text}" is not bold`).not.toMatch(/Bold/);
    }

    // ── 3. One undo removes everything the bake made. ──
    await undo(page);
    await expect.poll(() => pageItems(page), { timeout: 10_000 }).toEqual(itemsBefore);
    expect(await storyRuns(page), "the baked stories are gone").toEqual(runsBefore);
    expect((await webSource(page, frame))?.html, "the web frame keeps its source").toBe(HTML);
  });
});
