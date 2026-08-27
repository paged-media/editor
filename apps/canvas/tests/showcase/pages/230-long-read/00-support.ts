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

// Shared vocabulary for the long-read chapter (230) — paged.web driven
// through its commands and metadata envelope, and verified through the
// container's own parts.
//
// The ENVELOPE is the whole of what makes a rectangle a web frame:
// `x-paged:media.paged.web` carrying `{v: 1, data: WebFrameSource}`
// (web-model/src/source.ts). This chapter authors sources through that
// door directly (`setWebSource` — the same `setPluginMetadata` wire op
// the bundle's own insert command batches), and through the source
// panel's Save on the bake page, so both write lanes are on record.
//
// Assets are split the way the bundle's own `.html` importer splits
// them — a SCANNER, not a parser: `<style>` bodies join the css lane,
// the `<body>` inner is the html lane. Total on any input; our inputs
// are the chapter's own committed exhibits.

import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

import type { ShowcaseDoc } from "../../driver";

export const WEB_CMD = "media.paged.web.command";
export const WEB_PANEL = "media.paged.web.panel.source";
/** The plugin's metadata namespace — must equal `x-paged:<manifest.id>`. */
export const WEB_KEY = "x-paged:media.paged.web";
/** The plugin's container-part namespace. */
export const WEB_PARTS_PREFIX = "paged/media.paged.web/";

/** The §5 source model (structural twin of web-model's WebFrameSource). */
export interface WebSource {
  html: string;
  css: string;
  options: { media: "print" | "screen"; overflow: "clip"; viewportWidth?: number };
}

/** Split an HTML file into the envelope's two lanes, the way the
 *  bundle's importer does: `<style>` bodies → css, `<body>` inner → html. */
export function splitHtmlAsset(absPath: string): WebSource {
  const raw = readFileSync(absPath, "utf8");
  const css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1].trim())
    .join("\n");
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw)?.[1] ?? raw;
  return {
    html: body.trim(),
    css,
    options: { media: "print", overflow: "clip" },
  };
}

/** Wrap a source as the v1 metadata envelope. The `engine` stamp is
 *  optional in the contract and omitted here — the bundle stamps its
 *  own writes; a document-authored envelope carries none. */
export const envelopeFor = (source: WebSource): string =>
  JSON.stringify({ v: 1, data: { ...source } });

/** Write a source envelope onto a frame through the raw wire door the
 *  bundle's insert command uses (`setPluginMetadata`). */
export async function setWebSource(
  doc: ShowcaseDoc,
  frameId: string,
  source: WebSource,
): Promise<void> {
  await doc.mutate("setPluginMetadata", {
    elementId: { kind: "rectangle", id: frameId },
    key: WEB_KEY,
    value: envelopeFor(source),
  });
}

/** The `.paged` parts under `prefix` (the privileged listing door). */
export async function listParts(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { paths?: string[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "listPagedParts",
      payload: { prefix },
    });
    return reply.kind === "pagedPartList" ? (reply.payload.paths ?? []) : [];
  }, prefix);
}

/** Read one container part as UTF-8 text, or null when absent. */
export async function readPartText(
  page: Page,
  path: string,
): Promise<string | null> {
  return page.evaluate(async (path) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { found?: boolean; bytes?: number[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({ kind: "readPagedPart", payload: { path } });
    if (reply.kind !== "pagedPartRead" || !reply.payload.found) return null;
    return new TextDecoder().decode(Uint8Array.from(reply.payload.bytes ?? []));
  }, path);
}

/** The persisted flow recipients of a source frame, read from its
 *  container part — `null` when the part (or its flow) is absent. */
export async function partRecipients(
  page: Page,
  frameId: string,
): Promise<Array<{ id: string; flow?: string }> | null> {
  const text = await readPartText(page, `${WEB_PARTS_PREFIX}${frameId}/source.json`);
  if (!text) return null;
  try {
    const envelope = JSON.parse(text) as {
      data?: { flow?: { recipients?: Array<{ id: string; flow?: string }> } };
    };
    return envelope.data?.flow?.recipients ?? null;
  } catch {
    return null;
  }
}

/** Select `refs` in order (source first) and invoke a web command — the
 *  flow commands read `host.selection.get()` in selection order. */
export async function runOnSelection(
  ctx: { doc: ShowcaseDoc },
  refs: Array<{ kind: string; id: string }>,
  command: string,
): Promise<void> {
  await ctx.doc.designer.selectElements(refs);
  await ctx.doc.runCommand(command);
}

/** A hairline stroke so a frame reads as a placed object even where
 *  the engine's live paint is absent (a reload, a laneless run). */
export async function hairline(
  doc: ShowcaseDoc,
  kind: string,
  id: string,
  swatchName: string,
): Promise<void> {
  await doc.designer.applyStroke(kind, id, await doc.swatch(swatchName), 0.75);
}

/**
 * Arm a collector for the worker's `mutationFailed` replies. The
 * client throws "unexpected reply: mutationFailed" and DISCARDS the
 * engine's own error payload — so when a plugin lane dies mid-command
 * (the fares-table flow render did, on a scene-layer submit), the only
 * way to print the engine's reason on the page is to have been
 * listening. Idempotent; read with {@link readMutationFailures}.
 */
export async function armMutationFailureTap(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      __annualMutFails?: string[];
      __annualMutFailTap?: boolean;
      __canvas: {
        client: { subscribe: (fn: (m: unknown) => void) => unknown };
      };
    };
    if (g.__annualMutFailTap) return;
    g.__annualMutFailTap = true;
    g.__annualMutFails = [];
    g.__canvas.client.subscribe((m) => {
      const msg = m as { kind?: string; payload?: unknown };
      if (msg.kind === "mutationFailed") {
        g.__annualMutFails!.push(JSON.stringify(msg.payload).slice(0, 300));
      }
    });
  });
}

/** Drain the collected `mutationFailed` payloads (engine's own words). */
export async function readMutationFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __annualMutFails?: string[] };
    const out = g.__annualMutFails ?? [];
    g.__annualMutFails = [];
    return out;
  });
}

/** The panel's last-command readout (`render-report.ts`), or "". */
export async function readReport(page: Page, op: string): Promise<string> {
  const text = await page
    .locator(`[data-web-render-report="${op}"]`)
    .innerText({ timeout: 8_000 })
    .catch(() => "");
  return text.replace(/\s+/g, " ").trim();
}

/** Truncate one code-specimen line to the column's measure. */
export const codeLine = (line: string, max = 58): string => {
  const t = line.replace(/\t/g, "  ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};
