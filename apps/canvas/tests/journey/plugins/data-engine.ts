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

// The engine protocol the editor under test runs (the installed
// @paged-media/canvas-wasm's version minor, `0.<protocol>.<patch>`, as
// packages/client/src/protocol.ts reads it). A data journey whose undo shape
// changed with an engine release asserts the shape of the engine it runs on.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";

const require = createRequire(import.meta.url);

export const ENGINE_PROTOCOL: number = (() => {
  try {
    const pkg = require.resolve("@paged-media/canvas-wasm/package.json");
    const v = (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
    return Number(v.split(".")[1]) || 0;
  } catch {
    return 0;
  }
})();

/** Protocol 69: the data plugin names pages minted in a batch, so a merge
 *  that adds pages is ONE undo step (two before), and a refresh or lower
 *  carries the session label in that same step. */
export const ONE_STEP_MERGE = ENGINE_PROTOCOL >= 69;

/** The session version the document's own label names (protocol 69,
 *  `DocumentMeta.pluginMetadata`, key `x-paged:media.paged.data`), or null. */
export async function sessionLabel(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { send(m: { kind: string }): Promise<{ kind: string; payload: { meta?: { pluginMetadata?: { key: string; value: string }[] } } }> } };
      }
    ).__canvas;
    const reply = await c.client.send({ kind: "requestDocumentMeta" });
    const entry = (reply.payload?.meta?.pluginMetadata ?? []).find((e) => e.key === "x-paged:media.paged.data");
    if (!entry) return null;
    try {
      return (JSON.parse(entry.value) as { data?: { session?: string } }).data?.session ?? null;
    } catch {
      return null;
    }
  });
}

/** A container part of the open document, as text (null when absent). */
export async function partText(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const paged = (
      globalThis as unknown as {
        __paged: { parts: { read(path: string): Promise<Uint8Array | null> } };
      }
    ).__paged;
    const b = await paged.parts.read(p);
    return b ? new TextDecoder().decode(b) : null;
  }, path);
}

/** This plugin's placeholder fields, freshly read from the engine. */
export async function dataFields(page: Page): Promise<{ plugin: string; key: string; value: string | null }[]> {
  const items = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { send(m: { kind: string }): Promise<{ kind: string; payload: { items?: unknown[] } }> } };
      }
    ).__canvas;
    const reply = await c.client.send({ kind: "requestDocumentPlaceholders" });
    return reply.kind === "documentPlaceholders" ? (reply.payload.items ?? []) : [];
  });
  return (items as { plugin: string; key: string; value: string | null }[]).filter((f) => f.plugin === "media.paged.data");
}
