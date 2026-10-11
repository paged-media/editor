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

import { expect, type Page } from "@playwright/test";

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
/** paged.data's lowered variable fields, freshly read from the engine, on
 *  BOTH carriers: the placeholder fields (protocol < 71, and documents made
 *  with them), and — from protocol 71 — the custom TEXT VARIABLES named
 *  `paged:<binding key>` whose contents are the value (ADR 559: InDesign
 *  keeps a text variable through a save, where it drops a placeholder). */
export async function dataFields(page: Page): Promise<{ plugin: string; key: string; value: string | null }[]> {
  const items = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { send(m: { kind: string }): Promise<{ kind: string; payload: { items?: unknown[] } }> };
          objects?: {
            query(selector: string): Promise<string[]>;
            get(address: string, path: string): Promise<{ kind: string; value?: unknown }>;
          } | null;
        };
      }
    ).__canvas;
    const reply = await c.client.send({ kind: "requestDocumentPlaceholders" });
    const out = (reply.kind === "documentPlaceholders" ? (reply.payload.items ?? []) : []) as {
      plugin: string;
      key: string;
      value: string | null;
    }[];
    const o = c.objects;
    if (o) {
      const vars = await o.query('textVariable[name^="paged:"]').catch(() => [] as string[]);
      for (const address of vars) {
        const name = await o.get(address, "textVariableName");
        const contents = await o.get(address, "textVariableContents");
        if (name.kind !== "value" || typeof name.value !== "string") continue;
        out.push({
          plugin: "media.paged.data",
          key: name.value.slice("paged:".length),
          value: contents.kind === "value" && typeof contents.value === "string" ? contents.value : null,
        });
      }
    }
    return out;
  });
  return items.filter((f) => f.plugin === "media.paged.data");
}

/** The kinds the Bindings panel's authoring row offers (`[data-data-bind-kind]`). */
export type BindKind = "variable" | "image" | "barcode" | "table" | "visibility" | "rule" | "recordFlow";

/** What the panel says once each kind's binding is defined. */
const DEFINED: Record<BindKind, RegExp> = {
  variable: /^variable binding \S+/,
  image: /^image binding \S+ → the selected rectangle/,
  barcode: /^barcode binding \S+ → the selected rectangle/,
  table: /^table binding \S+ \(\d+ column\(s\)\)/,
  visibility: /^show\/hide binding \S+/,
  rule: /^style rule \S+/,
  recordFlow: /^record flow \S+/,
};

/** Define a binding the way a designer does: in the open Bindings panel pick
 *  the kind, type the field(s), press "Add binding", and read the panel's own
 *  confirmation. Returns the binding id the panel names. (The demo-binding
 *  buttons this replaces were removed in the 2026-10-11 panel pass; the
 *  authoring row covers every kind they wired, with real expressions.) */
export async function addBindingThroughPanel(
  page: Page,
  kind: BindKind,
  field: string,
  opts: { symbology?: string } = {},
): Promise<string> {
  const author = page.locator("[data-data-bind-author]");
  await expect(author).toBeVisible({ timeout: 10_000 });
  await author.locator("[data-data-bind-kind]").selectOption(kind);
  if (opts.symbology) {
    await author
      .locator("select")
      .filter({ has: page.locator(`option[value="${opts.symbology}"]`) })
      .selectOption(opts.symbology);
  }
  await author.locator("[data-data-bind-field]").fill(field);
  const msg = page.locator("[data-data-bind-msg]");
  const read = async (): Promise<string> =>
    (await msg.count()) > 0 ? ((await msg.first().textContent()) ?? "").trim() : "";
  const before = await read();
  await author.locator("[data-data-bind-add]").click();
  await expect.poll(read, { timeout: 10_000 }).not.toBe(before);
  const said = await read();
  expect(said, `the panel confirmed the ${kind} binding`).toMatch(DEFINED[kind]);
  // Every confirmation reads "<kind words> <id> …" with the id third.
  return said.split(/\s+/)[2];
}
