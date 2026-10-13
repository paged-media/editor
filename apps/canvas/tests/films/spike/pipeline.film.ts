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

// The pipeline's smoke test (ADR 224): the website's `films/sample.yaml`
// recorded through the film kit, so a change to the kit, the plan format or
// the compositor shows up on a short take before it costs a real film.

import { expect } from "@playwright/test";
import { film } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { screenPoint } from "../../e2e/harness/viewport";

film("sample", async (k) => {
  await k.setup(async () => {
    await k.designer.open();
    await k.designer.newDocument();
    await k.hold(800);
  });
  await k.roll();

  await k.scene("draw", async () => {
    const slot = k.page.locator('[data-tool-slot="shape"]');
    const box = await slot.boundingBox();
    if (!box) throw new Error("no shape tool slot");
    await k.pointer.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { targetWidth: box.width });
    await k.pointer.drag(await screenPoint(k.page, 90, 260), await screenPoint(k.page, 520, 560));
    const { storyId } = await k.designer.addTextFrame({ x0: 90, y0: 90, x1: 520, y1: 220 });
    expect(storyId).toBeTruthy();
    await k.designer.placeCaret(storyId!, 0);
    await k.pointer.moveTo(await screenPoint(k.page, 300, 150));
    await typeHuman(k.page, "Desktop publishing has left the desktop.");
  });

  await k.scene("pan", async () => {
    await k.pointer.moveTo({ x: 800, y: 500 });
    for (const dy of [40, -40]) {
      for (let i = 0; i < 24; i++) {
        await k.page.mouse.wheel(0, dy);
        await k.hold(16);
      }
    }
  });

  await k.scene("settle");
});
