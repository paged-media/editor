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

// Reads straight from the ENGINE, past the object model: `RequestGet`
// on an address and a path, and a page's rendered PNG. A panel spec
// writes through the UI and asks the engine what it now holds, so a
// field that writes the wrong path (or a seam that swallows the write)
// cannot pass by reading its own echo back.

import { expect, type Page } from "@playwright/test";

import { snapshotPagePng } from "../../fidelity/canvas-driver";
import type { PageInfo } from "./fixtures";
import { diffPngPixels } from "./pixel-diff";

export interface EngineRead {
  /** The wire value's `.value` (null = unset). */
  value: unknown;
  /** The engine's refusal code (`noSuchPath`, `notFound`, …), else null. */
  code: string | null;
}

/** One `RequestGet { address, path }` against the running engine. */
export function engineRead(page: Page, address: string, path: string): Promise<EngineRead> {
  return page.evaluate(
    async ({ address, path }) => {
      const c = (globalThis as unknown as {
        __canvas: { client: { send(m: unknown): Promise<{ kind: string; payload?: unknown }> } };
      }).__canvas;
      const r = await c.client.send({ kind: "requestGet", payload: { address, path } });
      const p = (r.payload ?? {}) as { value?: { value?: unknown } | null; code?: string | null; error?: string | null };
      return { value: p.value ? (p.value.value ?? null) : null, code: p.code ?? (p.error ? "error" : null) };
    },
    { address, path },
  );
}

/** The engine's value for `path` on `address` (refusals fail the test). */
export async function engineGet(page: Page, address: string, path: string): Promise<unknown> {
  const r = await engineRead(page, address, path);
  expect(r.code, `${address}.${path}: the engine refused the read`).toBeNull();
  return r.value;
}

/** Does the running engine read `path` on this address at all? */
export async function engineHasPath(page: Page, address: string, path: string): Promise<boolean> {
  return (await engineRead(page, address, path)).code !== "noSuchPath";
}

const RENDER_WIDTH_PX = 400;

/** The page's current render, small (a render CHANGE is the question). */
export async function pageRender(page: Page, info: PageInfo): Promise<Buffer> {
  const dpi = (RENDER_WIDTH_PX * 72) / info.widthPt;
  return Buffer.from(await snapshotPagePng(page, info.pageId, RENDER_WIDTH_PX, dpi));
}

/** Poll until the page renders differently from `before` (a rebuild is
 *  asynchronous; one sample after a fixed wait races it). Returns the
 *  changed pixel count. */
export async function expectRenderChange(
  page: Page,
  info: PageInfo,
  before: Buffer,
  minPixels = 16,
  timeout = 10_000,
): Promise<number> {
  let changed = 0;
  await expect
    .poll(
      async () => {
        changed = diffPngPixels(before, await pageRender(page, info)).changed;
        return changed;
      },
      { timeout, message: "the page render should change" },
    )
    .toBeGreaterThanOrEqual(minPixels);
  return changed;
}
