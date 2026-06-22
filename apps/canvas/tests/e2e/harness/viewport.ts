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

// E2E gesture suite — real-input viewport drivers. The channel
// harness (gesture.ts) bypasses the DOM; these helpers drive the
// REAL ViewportCanvas: load through the React file-input path so the
// viewport mounts, fit page 0 (Home), and map page-0-local pt
// coordinates to absolute screen px through the live camera
// (`screen = doc·scale + t`; page 0 sits at the document origin —
// same derivation as tools-ui.spec.ts).

import { expect, type Page } from "@playwright/test";

import {
  fixturePath,
  loadFixture,
  type FixtureName,
  type LoadedFixture,
} from "./fixtures";

/** Load via the React file-input path (ViewportCanvas mounts and
 *  renders), fit page 0, and resolve fixture refs. */
export async function loadViaReactPath(
  page: Page,
  name: FixtureName,
): Promise<LoadedFixture> {
  await page.setInputFiles('input[type="file"]', fixturePath(name));
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
              .ready,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  // Resolve refs through the worker path — the reload is idempotent
  // and keeps ref resolution in one place (loadFixture's tree walk).
  const fx = await loadFixture(page, name);
  // Home → fit page 0 to the viewport (large, centred drag target).
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  // Assert the fit produced a valid positive camera scale — NOT an
  // absolute floor. Fit scale is fixture-relative (a large spread fits at
  // a much smaller scale than a postcard); the old `> 0.2` floor assumed a
  // small page and spuriously failed big fixtures like the overset-frame
  // spread, which fits at ~0.17 (TH-04). `> 0` still catches a fit that
  // never ran or left a degenerate camera (0 / NaN both fail the poll).
  await expect
    .poll(() => cameraScale(page), { timeout: 10_000 })
    .toBeGreaterThan(0);
  return fx;
}

export async function cameraScale(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: {
            client: { camera: { read: () => { scale: number } } };
          };
        }
      ).__canvas.client.camera.read().scale,
  );
}

/** Absolute screen position of a page-0-local pt coordinate. */
export async function screenPoint(
  page: Page,
  ptX: number,
  ptY: number,
): Promise<{ x: number; y: number; scale: number }> {
  return page.evaluate(
    ({ ptX, ptY }) => {
      let best: HTMLCanvasElement | null = null;
      let bestArea = 0;
      for (const cv of Array.from(document.querySelectorAll("canvas"))) {
        const r = cv.getBoundingClientRect();
        if (r.width * r.height > bestArea) {
          bestArea = r.width * r.height;
          best = cv;
        }
      }
      const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              camera: { read: () => { scale: number; tx: number; ty: number } };
            };
          };
        }
      ).__canvas;
      const cam = c.client.camera.read();
      return {
        x: wrap.left + ptX * cam.scale + cam.tx,
        y: wrap.top + ptY * cam.scale + cam.ty,
        scale: cam.scale,
      };
    },
    { ptX, ptY },
  );
}

/** Activate a tool through the REAL tool rail. */
export async function activateTool(page: Page, slot: string): Promise<void> {
  await page.locator(`[data-tool-slot="${slot}"]`).click();
  await expect(
    page.locator(`[data-tool-slot="${slot}"][data-active="true"]`),
  ).toBeVisible();
}

/** Count elements of one kind via a fresh scene-tree walk. */
export async function treeCount(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: {
      id?: { kind: string } | null;
      children?: unknown[];
    }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

/** All element ids of one kind (fresh tree walk, document order). */
export async function treeIds(
  page: Page,
  kind: string,
): Promise<Array<{ kind: string; id: string }>> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }>;
    const out: Array<{ kind: string; id: string }> = [];
    const visit = (node: {
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }) => {
      if (node.id && node.id.kind === k) out.push(node.id);
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return out;
  }, kind);
}

/** Drag the mouse between two screen points (down → steps → up). */
export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { steps?: number; settleMs?: number } = {},
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 6 });
  await page.waitForTimeout(opts.settleMs ?? 120);
  await page.mouse.up();
}

/** Poll until the React geometry mirror carries `count` items —
 *  ViewportCanvas reads it to route body-drags into worker gestures. */
export async function awaitGeometryMirror(
  page: Page,
  count: number,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __canvas: { elementGeometry?: unknown[] };
            }
          ).__canvas.elementGeometry?.length ?? 0,
      ),
    )
    .toBe(count);
}
