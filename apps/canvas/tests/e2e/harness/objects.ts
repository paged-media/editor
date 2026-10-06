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

// ADR 323 (Wave 6) — the shared steps of the object-model panel specs:
// read a property THROUGH `host.objects` (`__canvas.objects`, the one
// shared registry), undo exactly once, and open "Bind to data…" on a
// field as a dry run (no data plugin registers `paged.data.bindProperty`
// in these specs, so the dialog shows the prefilled request and writes
// nothing).

import { expect, type Locator, type Page } from "@playwright/test";

interface ObjectsGlobal {
  __canvas: {
    objects: {
      get(address: string, path: string): Promise<{ kind: string; value?: unknown }>;
      query(selector: string): Promise<string[]>;
    } | null;
    client: { undo(): Promise<unknown> };
  };
}

/** One read through `host.objects`: the value, or the read's kind
 *  (`mixed` / `absent` / `refused`). */
export function objGet(page: Page, address: string, path: string): Promise<unknown> {
  return page.evaluate(
    async ({ address, path }) => {
      const o = (globalThis as unknown as ObjectsGlobal).__canvas.objects;
      if (!o) return "no-registry";
      const v = await o.get(address, path);
      return v.kind === "value" ? (v.value ?? null) : v.kind;
    },
    { address, path },
  );
}

export function objQuery(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (s) => (globalThis as unknown as ObjectsGlobal).__canvas.objects!.query(s),
    selector,
  );
}

/** ONE undo step. */
export async function undoOnce(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as unknown as ObjectsGlobal).__canvas.client.undo());
}

/** The `[data-property-field]` wrapper every object-model field renders
 *  (schema-driven or bespoke). */
export function fieldOf(scope: Locator | Page, path: string): Locator {
  return scope.locator(`[data-property-field="${path}"]`).first();
}

/** Right-click a field → "Bind to data…". With paged.data loaded the
 *  request routes to its `media.paged.data.bindProperty`, which opens the
 *  Bindings panel with a DRAFT naming the path and the durable target
 *  (nothing is bound until a query and an expression are given — the
 *  draft is cancelled here). Without a data command the editor's fallback
 *  dialog shows the same request. Returns the target selector. */
export async function bindToData(
  page: Page,
  field: Locator,
  path: string,
): Promise<{ selector: string; routed: boolean }> {
  await expect(field).toHaveAttribute("data-value-type", /.+/);
  await field.click({ button: "right" });
  await page.locator('[data-menu-item="bind-to-data"]').click();
  const draft = page.locator("[data-data-bind-property]");
  const dialog = page.locator("[data-bind-to-data]");
  await expect(draft.or(dialog).first()).toBeVisible();
  if (await draft.isVisible()) {
    const codes = draft.locator("code");
    await expect(codes.nth(0)).toHaveText(path);
    const selector = (await codes.nth(1).textContent()) ?? "";
    await draft.getByRole("button", { name: "Cancel" }).click();
    return { selector, routed: true };
  }
  await expect(dialog.locator("[data-bind-path]")).toHaveText(path);
  const selector = (await dialog.locator("[data-bind-selector]").textContent()) ?? "";
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return { selector, routed: false };
}

/** The panel specs' family check: Bind to data… on `field` reaches
 *  paged.data's real command (the data bundle is loaded in the editor). */
export async function bindDryRun(page: Page, field: Locator, path: string): Promise<string> {
  const r = await bindToData(page, field, path);
  expect(r.routed, "Bind to data… reached paged.data's bindProperty").toBe(true);
  return r.selector;
}
