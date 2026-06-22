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

// Journey: spot ink management + text overset.
//
// A production designer adds a spot colour and tells the ink manager to
// convert it to process, then pours more copy into a small frame than it
// can hold and the story reports overset — the two production-prep aspects
// the panel sweep and the styling journeys don't reach.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const collection = <T = { selfId: string }>(page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (
        globalThis as unknown as {
          __canvas: { client: { collection: (c: string) => Promise<T[]> } };
        }
      ).__canvas.client.collection(n),
    name,
  ) as Promise<T[]>;

test.describe("journey · ink + overset", () => {
  test("convert a spot ink to process; overflow a frame to overset @feat:color-swatches.ink-manager @feat:color-swatches.process-spot-tint @feat:stories-text.overset @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const fail: string[] = [];

    // INK MANAGER — create a spot swatch (registers an ink), then flip its
    // convert-to-process setting.
    try {
      const created = (await mutate(page, {
        op: "createSwatch",
        args: {
          spec: {
            selfId: null,
            name: "PANTONE journey",
            space: "CMYK",
            value: [0, 100, 100, 0],
            model: "Spot",
            alternateSpace: "CMYK",
            alternateValue: [0, 100, 100, 0],
            tint: null,
            alpha: null,
          },
        },
      })) as { kind?: string };
      const inks = await collection<{ spotId: string }>(page, "inks");
      const spotId = inks[inks.length - 1]?.spotId;
      const r = (await mutate(page, {
        op: "setInkSetting",
        args: { spotId, convertToProcess: true },
      })) as { kind?: string };
      if (created.kind !== "mutationApplied" || !spotId || r.kind !== "mutationApplied")
        fail.push("color-swatches.ink-manager");
    } catch (e) {
      fail.push(`color-swatches.ink-manager (${String(e).slice(0, 50)})`);
    }

    // OVERSET — a tiny frame can't hold a long paragraph; the story reports
    // overset (StorySummary.overset is live-readable).
    try {
      const { storyId } = await designer.addTextFrame({ x0: 70, y0: 90, x1: 150, y1: 130 });
      await designer.placeCaret(storyId!, 0);
      await designer.typeText(
        "This sentence is far longer than the small frame can possibly hold, so the story must overflow into overset.",
      );
      await expect
        .poll(
          async () => {
            const stories = await collection<{ selfId: string; overset?: boolean }>(page, "stories");
            return stories.find((s) => s.selfId === storyId)?.overset ?? false;
          },
          { timeout: 8000 },
        )
        .toBe(true);
    } catch (e) {
      fail.push(`stories-text.overset (${String(e).slice(0, 50)})`);
    }

    expect(fail, `prep aspects that did not verify: ${fail.join(" | ")}`).toEqual([]);
  });
});
