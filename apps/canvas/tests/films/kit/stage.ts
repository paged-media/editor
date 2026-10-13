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

// The editor as the camera sees it (ADR 224): dev-only chrome is hidden
// before the page loads, so no frame of a take can show it. The list is
// short on purpose; each entry is something a user of the released editor
// never sees.

import type { Page } from "@playwright/test";

const DEV_CHROME = [
  // The frame-time readout over the viewport.
  "[data-viewport-hud]",
  // The corpus picker, present only when the dev server stages corpus files.
  'select[aria-label="Load corpus IDML"]',
  // Vite's error overlay: a take with an error fails anyway, but it must
  // never be the frame a failed take leaves behind.
  "vite-error-overlay",
];

const CSS = `${DEV_CHROME.join(",\n")} { display: none !important; }`;

/** Install the film stage on a page before it navigates: every document it
 *  loads hides the dev chrome from its first paint. */
export async function dressStage(page: Page): Promise<void> {
  await page.addInitScript((css: string) => {
    const add = () => {
      const style = document.createElement("style");
      style.dataset.filmStage = "";
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  }, CSS);
}
