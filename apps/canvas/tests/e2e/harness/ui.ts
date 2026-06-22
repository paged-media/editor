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

// E2E op suite — UI drivers. Operations are applied through the
// REAL interface wherever one exists: panel controls (the kit
// metrics/selects/segments/pills), selection installers, and the
// client mutate fall-back for ops without a UI surface yet.

import { expect, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import type { ElementRef } from "./fixtures";

export { openPanel };

interface CanvasGlobal {
  __canvas: {
    client: {
      mutate: (m: unknown) => Promise<unknown>;
      setElementSelection: (ids: unknown[], mode: string) => Promise<unknown[]>;
      elementGeometry: (ids: unknown[]) => Promise<unknown[]>;
      executeScript: (
        src: string,
      ) => Promise<{ output: string[]; error: string | null }>;
    };
    setElementSelection?: (ids: unknown[]) => void;
    setElementGeometry?: (items: unknown[]) => void;
    setContentSelection?: (
      sel: { storyId: string; start: number; end: number } | null,
    ) => void;
  };
}

/** Install an element selection through both the worker and the
 *  React selection context (panels read the latter). Also mirrors the
 *  selection's GEOMETRY into the context the way the canvas-panel click
 *  path does — overlays keyed on `useSelection().elementGeometry`
 *  (threading ports, selection chrome) won't render without it, and a
 *  programmatic select otherwise leaves it empty. */
export async function selectElements(
  page: Page,
  refs: ElementRef[],
): Promise<void> {
  await page.evaluate(async (ids) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const applied = await c.client.setElementSelection(ids, "replace");
    c.setElementSelection?.(applied);
    if (c.setElementGeometry) {
      try {
        const geo = await c.client.elementGeometry(applied);
        c.setElementGeometry(geo);
      } catch {
        /* worker reload / disconnect — fine */
      }
    }
  }, refs);
}

export async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const applied = await c.client.setElementSelection([], "replace");
    c.setElementSelection?.(applied);
    c.setContentSelection?.(null);
  });
}

/** Install a text caret/range on a story (content selection). */
export async function setCaret(
  page: Page,
  storyId: string,
  start: number,
  end = start,
): Promise<void> {
  await page.evaluate(
    ({ storyId, start, end }) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      c.setContentSelection?.({ storyId, start, end });
    },
    { storyId, start, end },
  );
}

/** Raw mutate for ops without a UI surface (documented per use). */
export async function mutate(page: Page, m: unknown): Promise<unknown> {
  return page.evaluate(async (mm) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    return await c.client.mutate(mm);
  }, m);
}

/** Run a paged.* script; throws on script error. */
export async function script(page: Page, src: string): Promise<string[]> {
  const r = await page.evaluate(async (s) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    return await c.client.executeScript(s);
  }, src);
  if (r.error) throw new Error(`paged script error: ${r.error}`);
  return r.output;
}

// ── panel control drivers (the kit controls from the gallery pass) ──

/** Fill a kit metric (NumberInput) addressed by aria-label within a
 *  panel root, commit with Enter. Works for the in-field-unit
 *  metrics ("16 pt") — parse strips the suffix on commit. */
export async function fillMetric(
  page: Page,
  rootSelector: string,
  ariaLabel: string,
  value: number,
): Promise<void> {
  const input = page.locator(
    `${rootSelector} input[aria-label="${ariaLabel}"]`,
  );
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press("Enter");
}

/** Fill the metric in a label-left kit row ("Weight", "Opacity" …)
 *  — the composition leaves don't carry aria-labels, so address the
 *  row by its 84px label text. */
export async function fillRowMetric(
  page: Page,
  rootSelector: string,
  rowLabel: string,
  value: number,
): Promise<void> {
  const input = page
    .locator(
      `${rootSelector} div.grid:has(> span:text-is("${rowLabel}")) input`,
    )
    .first();
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press("Enter");
}

/** Choose an option in a kit select (native select underneath). */
export async function pickSelect(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.locator(selector).selectOption(value);
}

/** Click a segment in a kit toggle-group by its wire value. */
export async function clickSegment(
  page: Page,
  rootSelector: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(
      `${rootSelector} [data-toggle-group] [data-option-value="${optionValue}"]`,
    )
    .click();
}

/** Toggle a kit check-row pill by its label. */
export async function togglePill(
  page: Page,
  rootSelector: string,
  label: string,
): Promise<void> {
  await page
    .locator(`${rootSelector} [data-check-row="${label}"] [role="switch"]`)
    .click();
}
