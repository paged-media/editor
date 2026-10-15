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

// Inter Italic is set in an italic face.
//
// The editor's default face is Inter's variable roman: it covers every
// weight, but not italic, so a run in Inter Italic drew upright — the
// same pixels as Inter Regular. The editor now bundles Inter's variable
// italic beside the roman and registers it as Inter's "Italic" after
// every load, so the run is slanted and the family is not reported
// missing (an engine that checks what the default face can set would
// otherwise flag it as substituted).

import { expect, test, type Page } from "@playwright/test";

import { mutate } from "./e2e/harness/ui";
import { Designer } from "./journey/driver/designer";

type FontSummary = { family: string; isMissing: boolean; styles?: string[] };

async function fonts(page: Page): Promise<FontSummary[]> {
  return page.evaluate(() =>
    (
      globalThis as unknown as {
        __canvas: { client: { collection(n: string): Promise<FontSummary[]> } };
      }
    ).__canvas.client.collection("fonts"),
  );
}

/** A text frame with one run of text in Inter at 36 pt; returns a setter
 *  for the run's font style. */
async function interRun(designer: Designer, page: Page): Promise<(style: string) => Promise<void>> {
  const { storyId } = await designer.addTextFrame({ x0: 60, y0: 80, x1: 560, y1: 300 });
  const text = "Hamburgefonstiv quick brown fox";
  await mutate(page, { op: "insertText", args: { storyId, offset: 0, text } });
  const range = { kind: "storyRange", id: { story_id: storyId, start: 0, end: text.length } };
  const set = async (path: string, value: unknown) => {
    const r = (await mutate(page, {
      op: "setElementProperty",
      args: { elementId: range, path, value },
    })) as { kind?: string };
    expect(r.kind, path).toBe("mutationApplied");
  };
  await set("characterFontSize", { type: "length", value: 36 });
  await set("characterFontFamily", { type: "text", value: "Inter" });
  return (style) => set("characterFontStyle", { type: "text", value: style });
}

test.describe("The default family's italic", () => {
  test("AC-INTER-ITALIC-1 — an Inter Italic run is slanted, Inter Regular is unchanged, and Inter is not missing @feat:typography.font-selection @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const style = await interRun(designer, page);

    await style("Regular");
    const roman = await designer.renderBytes();
    await style("Italic");
    // A different face, not the roman again: the run's glyphs move.
    const slanted = await designer.expectRenderChangesFrom(roman, { minPixels: 500 });
    // eslint-disable-next-line no-console
    console.log(`[inter-italic] italic vs roman: ${slanted}px`);
    const inter = (await fonts(page)).find((f) => f.family === "Inter");
    expect(inter, "the document names Inter").toBeDefined();
    expect(inter!.isMissing, "Inter Italic is not reported missing").toBe(false);

    // The roman is still the roman: registering the italic did not take
    // Inter Regular over.
    await style("Regular");
    await designer.expectRenderStable(roman, await designer.renderBytes());
  });

  test("AC-INTER-ITALIC-2 — a document opened from a file gets the italic too @feat:typography.font-selection @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const style = await interRun(designer, page);
    await style("Regular");
    const roman = await designer.renderBytes();
    await style("Italic");
    const italic = await designer.renderBytes();

    // Save it and open it again through the file importer: a fresh load,
    // whose only fonts are the ones the load registers.
    const reopened = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { exportIdml(): Promise<Uint8Array> };
            registries: {
              importers: {
                resolve(name: string): {
                  import(f: { name: string; bytes: Uint8Array }): Promise<void> | void;
                } | null;
              };
            };
          };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      const imp = c.registries.importers.resolve("italic.idml");
      if (!imp) return "no importer claims .idml";
      await imp.import({ name: "italic.idml", bytes });
      return "";
    });
    expect(reopened).toBe("");
    await expect
      .poll(async () => designer.renderDiffPixels(italic, await designer.renderBytes()), {
        timeout: 15_000,
      })
      .toBeLessThanOrEqual(16);
    expect(await designer.renderDiffPixels(roman, await designer.renderBytes())).toBeGreaterThan(500);
  });
});
