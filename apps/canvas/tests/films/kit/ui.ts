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

// Driving the editor's own controls on camera (ADR 224): every click a film
// narrates goes through the pointer, to the centre of the real control, so
// the viewer sees the cursor travel there. Menus open item by item, the way
// a hand opens them.

import type { Locator } from "@playwright/test";
import type { Kit } from "./film";

async function centre(l: Locator): Promise<{ x: number; y: number; w: number }> {
  await l.waitFor({ state: "visible", timeout: 10_000 });
  const b = await l.boundingBox();
  if (!b) throw new Error(`no box for ${l}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.min(b.width, b.height) };
}

/** Travel to a control and click it. */
export async function press(k: Kit, l: Locator): Promise<void> {
  const c = await centre(l);
  await k.pointer.click(c, { targetWidth: c.w });
}

/** Travel to a control and rest on it. */
export async function hover(k: Kit, l: Locator): Promise<void> {
  const c = await centre(l);
  await k.pointer.moveTo(c, { targetWidth: c.w });
}

/** Open a menu path: the top-level entry by its label in the menu bar, each
 *  submenu by hovering, the last entry by a click. */
export async function menu(k: Kit, path: string[]): Promise<void> {
  const [top, ...rest] = path;
  const bar = k.page.getByRole("menubar");
  const scope = (await bar.count()) > 0 ? bar : k.page.locator("header").first();
  await press(k, scope.getByText(top, { exact: true }).first());
  await k.hold(250);
  for (const [i, label] of rest.entries()) {
    const item = k.page.getByRole("menuitem", { name: label, exact: true }).first();
    if (i < rest.length - 1) {
      await hover(k, item);
      await k.hold(300);
    } else {
      await press(k, item);
    }
  }
}

/** A page point on screen (CSS px), through the live camera. */
export { screenPoint } from "../../e2e/harness/viewport";
