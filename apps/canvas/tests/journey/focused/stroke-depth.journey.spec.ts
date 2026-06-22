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

// Journey: stroke & transparency depth.
//
// A designer styles a frame's stroke the way they do in the Stroke panel —
// weight, dashed/striped style, join, alignment, gap colour — and drops its
// opacity. Each is a real setElementProperty mutation on the frame; the
// value shapes mirror the e2e stroke-ops contract.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

test.describe("journey · stroke & transparency depth", () => {
  test("style a frame's stroke @feat:frames-paths.stroke-weight-caps-joins @feat:frames-paths.stroke-dashed @feat:frames-paths.stroke-striped-wavy @feat:frames-paths.stroke-alignment @feat:frames-paths.stroke-gap-color @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 110, y0: 130, x1: 320, y1: 280 });
    const ref = { kind: "rectangle", id };

    const set = async (path: string, value: unknown) => {
      const r = (await mutate(page, {
        op: "setElementProperty",
        args: { elementId: ref, path, value },
      })) as { kind?: string };
      expect(r.kind, `${path} applies`).toBe("mutationApplied");
    };

    await set("frameStrokeWeight", { type: "length", value: 6 });
    await set("frameStrokeJoin", { type: "text", value: "RoundEndJoin" });
    await set("frameStrokeAlignment", { type: "text", value: "OutsideAlignment" });
    // Dashed → striped, proving the stroke-style lane carries different kinds.
    await set("frameStrokeType", { type: "text", value: "StrokeStyle/$ID/Dashed" });
    await set("frameStrokeType", {
      type: "text",
      value: "StrokeStyle/$ID/Thick - Thin",
    });
    await set("frameStrokeGapColor", { type: "colorRef", value: "Color/Black" });
  });
});
