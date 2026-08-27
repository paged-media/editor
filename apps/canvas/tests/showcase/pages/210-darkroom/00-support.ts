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

// Shared vocabulary for the darkroom chapter (210, p87–p94).
//
// THE CHAPTER'S LAW (AUTHORING rule 3, restated because every module
// here lives by it): a paged.image adjustment is SceneLayer session
// state — it does NOT persist in `.paged`. The honest workflow, and the
// chapter's whole narrative, is the loop that MAKES it persist:
//
//   adjust (panel params / effect kernels, GPU)
//     → export (the bundle's PNG/JPEG exporter, delivered as a real
//       browser download through the Outputs panel — captured here with
//       `captureDownload`)
//     → commit (`replaceImageBytes` with the exported bytes — the
//       INLINE lane that survives checkpoints and the IDML round trip).
//
// Every visible correction in this chapter went through that loop
// before its module returned; the chapter checkpoint is the proof.
//
// The doors this file wraps are the ones the retired `05-raster.ts`
// established (importer-registry evaluate, label-anchored sliders,
// `[data-image-status]` polling) plus the gesture lane the image
// journeys proved (tool activation via `paged.tool.activate.<id>`,
// document-pt → screen-px conversion through the live camera).

import { expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { screenPoint } from "../../../e2e/harness/viewport";
import { captureDownload } from "../../plugin-support";
import { TRIM_H_PT } from "../../names-annual";
import type { PageContext } from "../../types";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `tests/showcase/assets` — the annual's granted asset store. */
export const ASSETS = pathResolve(__dirname, "..", "..", "assets");
export const photo = (name: string): string =>
  pathResolve(ASSETS, "photos", name);
/** `/@fs` URL for an absolute path (vite serves it read-only). */
export const fsUrl = (absPath: string): string => `/@fs${absPath}`;

/** `~/paged` — seven levels up from this module. Used ONLY to read the
 *  plugin's own kernel registry for the roster page; absent checkouts
 *  degrade to a note, never to a hand-typed list. */
export const WORKSPACE = pathResolve(__dirname, "..", "..", "..", "..", "..", "..", "..");
export const KERNELS_YAML = pathResolve(
  WORKSPACE,
  "plugins",
  "plugin-image",
  "registry",
  "kernels.yaml",
);

// ── the bundle's registered surface (ids, verbatim from activate.ts) ──

export const ADJ_PANEL = "media.paged.image.panel.adjustments";
export const OUTPUTS_PANEL = "paged.outputs";
export const PAGES_PANEL = "paged.pages";
export const RASTER_IMPORTER = "media.paged.image.importer.raster";
export const EXPORTER = {
  psd: "media.paged.image.exporter.psd",
  png: "media.paged.image.exporter.png",
  jpeg: "media.paged.image.exporter.jpeg",
} as const;
export const CMD = {
  adjustSelected: "media.paged.image.command.adjustSelected",
  selectAll: "media.paged.image.command.selectAll",
  deselect: "media.paged.image.command.deselect",
  invert: "media.paged.image.command.invertSelection",
  feather: "media.paged.image.command.featherSelection",
  contentAwareFill: "media.paged.image.command.contentAwareFill",
} as const;
export const TOOL = {
  marqueeRect: "media.paged.image.tool.marqueeRect",
  quickSelect: "media.paged.image.tool.quickSelect",
  brush: "media.paged.image.tool.brush",
  pencil: "media.paged.image.tool.pencil",
  clone: "media.paged.image.tool.clone",
  heal: "media.paged.image.tool.heal",
  type: "media.paged.image.tool.type",
} as const;

// ── inline-bytes lane (the persistence half of the loop) ────────────

/**
 * `replaceImageBytes` with a FILE's real bytes, fetched in the page
 * (vite's `/@fs` door — no CDP serialisation). BARE self id, per the
 * wire contract. Returns the byte count for captions.
 */
export async function replaceBytesFromFile(
  ctx: PageContext,
  frameId: string,
  absPath: string,
): Promise<number> {
  ctx.doc.ledger?.record("replaceImageBytes", { elementId: frameId });
  const out = await ctx.page.evaluate(
    async ({ frameId, url }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{
                kind: string;
                payload?: { error?: unknown };
              }>;
            };
          };
        }
      ).__canvas;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`asset fetch failed: ${url}`);
      const bytes = Array.from(new Uint8Array(await res.arrayBuffer()));
      const reply = await c.client.mutate({
        op: "replaceImageBytes",
        args: { elementId: frameId, bytes },
      });
      return {
        kind: reply.kind,
        error: reply.payload?.error ? JSON.stringify(reply.payload.error) : null,
        bytes: bytes.length,
      };
    },
    { frameId, url: fsUrl(absPath) },
  );
  if (out.kind !== "mutationApplied") {
    throw new Error(`replaceImageBytes(${absPath}) refused: ${out.error}`);
  }
  return out.bytes;
}

/**
 * Commit bytes that live in NODE (an exporter download) back into a
 * frame — the closing arc of the loop. Base64 across the CDP boundary,
 * decoded in the page, straight onto the wire.
 */
export async function commitBytes(
  ctx: PageContext,
  frameId: string,
  bytes: Buffer,
): Promise<number> {
  ctx.doc.ledger?.record("replaceImageBytes", { elementId: frameId });
  const out = await ctx.page.evaluate(
    async ({ frameId, b64 }) => {
      const bin = atob(b64);
      const arr = new Array<number>(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{
                kind: string;
                payload?: { error?: unknown };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.mutate({
        op: "replaceImageBytes",
        args: { elementId: frameId, bytes: arr },
      });
      return {
        kind: reply.kind,
        error: reply.payload?.error ? JSON.stringify(reply.payload.error) : null,
      };
    },
    { frameId, b64: bytes.toString("base64") },
  );
  if (out.kind !== "mutationApplied") {
    throw new Error(`replaceImageBytes(committed bytes) refused: ${out.error}`);
  }
  return bytes.length;
}

// ── the session lane (ingest, panel, export) ────────────────────────

/** The adjustments panel's Source readout — `name W×H` once decoded. */
export async function sourceReadout(ctx: PageContext): Promise<string> {
  return ctx.page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "no Source row";
  });
}

/**
 * The one line every paged.image door writes its outcome to. Polled
 * until it stops ending in an ellipsis AND stops carrying the previous
 * marker, because the panel writes progress text the instant a door is
 * driven and only replaces it when the work lands (05-raster's lesson).
 */
export async function panelStatus(
  ctx: PageContext,
  settleMs = 0,
): Promise<string> {
  const read = async () =>
    (await ctx.page
      .locator("[data-image-status]")
      .first()
      .textContent()
      .catch(() => null)) ?? "(no status line)";
  const deadline = Date.now() + settleMs;
  let text = await read();
  while (text.trimEnd().endsWith("…") && Date.now() < deadline) {
    await ctx.page.waitForTimeout(200);
    text = await read();
  }
  return text;
}

/**
 * Ingest a real file into the paged.image session BOUND to `frameId`:
 * select the frame (importBytes binds a single selection — the fix the
 * paint journey's silent-zero taught), then route the file's own bytes
 * through the HOST importer registry, exactly as File ▸ Open would.
 *
 * `importName` is deliberately per-call distinct even when the same
 * photograph ingests ten times: the Source readout is the decode
 * proof, and polling for a name the PREVIOUS ingest already printed
 * would pass before this one decoded.
 */
export async function ingestIntoFrame(
  ctx: PageContext,
  frameId: string,
  absPath: string,
  importName: string,
  mimeType: string,
): Promise<string> {
  await ctx.doc.select("rectangle", frameId);
  const importer = await ctx.page.evaluate(
    async ({ url, name, mimeType }) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const importers = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers?: {
                resolve: (
                  fileName: string,
                  mime?: string,
                ) => {
                  id?: string;
                  import: (args: {
                    name: string;
                    bytes: Uint8Array;
                    mimeType?: string;
                  }) => void | Promise<void>;
                } | null;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      if (!importers) return "the host serves no importer registry";
      const importer = importers.resolve(name, mimeType);
      if (!importer) return `no importer resolved for ${mimeType}`;
      await importer.import({ name, bytes, mimeType });
      return importer.id ?? "imported";
    },
    { url: fsUrl(absPath), name: importName, mimeType },
  );
  if (importer === RASTER_IMPORTER) {
    await expect
      .poll(() => sourceReadout(ctx), { timeout: 30_000 })
      .toEqual(expect.stringContaining(importName));
  }
  return importer;
}

export async function openAdjustments(ctx: PageContext): Promise<void> {
  await ctx.doc.designer.openPanel(ADJ_PANEL);
}

/**
 * Set a label-anchored panel slider (the 05-raster idiom, with a value
 * write instead of arrow-key nudges — a 120° hue turn is not 120
 * keypresses). React range inputs listen for `input`, so the value
 * goes through the native setter and the event is dispatched bubbling.
 * `nth` disambiguates the two "Size (px)" sliders (Brush section
 * renders before Type, so 0 = brush, 1 = type).
 */
export async function setSlider(
  ctx: PageContext,
  label: string,
  value: number,
  nth = 0,
): Promise<void> {
  const input = ctx.page
    .locator(`label:text-is("${label}")`)
    .nth(nth)
    .locator("xpath=following-sibling::span")
    .locator('input[type="range"]')
    .first();
  await input.waitFor({ state: "visible", timeout: 120_000 });
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) throw new Error("no HTMLInputElement value setter");
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** Click the panel's Reset so no tile inherits the previous tile's
 *  params — the session is one, the exhibits are ten. */
export async function resetAdjustments(ctx: PageContext): Promise<void> {
  const reset = ctx.page.locator("[data-image-reset]");
  if ((await reset.count()) > 0) await reset.first().click();
}

/**
 * Resample the working image through the panel's Resize row (the T1
 * kernels — `image.editor.resample`). Keeps the committed bytes at
 * exhibit resolution instead of ten full-resolution re-encodes.
 * Returns true when the engine confirmed the swap.
 */
export async function resampleTo(
  ctx: PageContext,
  w: number,
  h: number,
  filter: "lanczos3" | "mitchell" | "nearest" = "lanczos3",
): Promise<boolean> {
  await ctx.page.locator("[data-image-resize-w]").fill(String(w));
  await ctx.page.locator("[data-image-resize-h]").fill(String(h));
  await ctx.page.locator("[data-image-resize-filter]").selectOption(filter);
  const apply = ctx.page.locator("[data-image-resize-apply]");
  if (await apply.isDisabled()) return false;
  await apply.click();
  const deadline = Date.now() + 20_000;
  for (;;) {
    const status = await panelStatus(ctx);
    if (status.includes("Resampled to")) return true;
    if (status.startsWith("Resize failed")) return false;
    if (Date.now() >= deadline) return false;
    await ctx.page.waitForTimeout(200);
  }
}

/**
 * Run a plugin exporter the way a user does — the Outputs panel's
 * one-click row — and capture the browser download it triggers
 * (`captureDownload`, the app's single blob→file door). Null with the
 * reason when nothing downloads, because "the exporter declined" is a
 * NOTE on a page, not a crash.
 */
export async function exportDownload(
  ctx: PageContext,
  exporterId: string,
): Promise<{ name: string; bytes: Buffer } | { reason: string }> {
  await ctx.doc.designer.openPanel(OUTPUTS_PANEL);
  const row = ctx.page.locator(`[data-plugin-export="${exporterId}"]`);
  try {
    await row.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    return { reason: `exporter row ${exporterId} not in the Outputs panel` };
  }
  try {
    const out = await captureDownload(ctx.page, () => row.click(), 45_000);
    // The Outputs raise HID the adjustments panel — they share a dock
    // group (the retouch page's first run failed on exactly this: a
    // "Size (px)" slider invisible behind the Pages tab). Give the
    // Image panel its tab back before anyone reads it.
    await ctx.doc.designer.openPanel(ADJ_PANEL);
    return out;
  } catch {
    await ctx.doc.designer.openPanel(ADJ_PANEL);
    return {
      reason:
        `${exporterId} produced no download in 45s — the exporter ` +
        `declined (status: ${await panelStatus(ctx)})`,
    };
  }
}

// ── the gesture lane (camera + pointer, for the tool pages) ─────────

/** Vertical page stacking in document space (`layoutPages`): every
 *  annual page is 720 pt tall with the layout's fixed 24 pt gap. */
const PAGE_GAP_PT = 24;

/**
 * Put the REAL camera on one page: the Navigator panel's thumbnail
 * click (its `title` names the 1-based page), then wait for the
 * animated fit to settle on two identical camera reads — the
 * `fitFirstPage` lesson about asserting the end state, not the
 * transition.
 */
export async function fitPageForGesture(
  ctx: PageContext,
  pageIndex: number,
): Promise<void> {
  await ctx.doc.designer.openPanel(PAGES_PANEL);
  const thumb = ctx.page.locator(`[title^="Jump to page ${pageIndex + 1} ("]`);
  await thumb.waitFor({ state: "visible", timeout: 120_000 });
  await thumb.click();
  const readCamera = () =>
    ctx.page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas?: {
              client?: {
                camera?: {
                  read: () => { scale: number; tx: number; ty: number };
                };
              };
            };
          }
        ).__canvas?.client?.camera?.read() ?? null,
    );
  await expect
    .poll(
      async () => {
        const first = await readCamera();
        await ctx.page.waitForTimeout(120);
        const second = await readCamera();
        if (!first || !second) return false;
        return (
          first.scale === second.scale &&
          first.tx === second.tx &&
          first.ty === second.ty &&
          first.scale > 0
        );
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  // Image / Outputs / Pages share one dock group, so raising Pages just
  // HID the adjustments panel — and a hidden panel makes every
  // label-anchored slider and readout locator time out (found the hard
  // way on the retouch page's first run). Hand the tab back.
  await ctx.doc.designer.openPanel(ADJ_PANEL);
}

/** Page-local pt → absolute screen px, through the live camera. Page N
 *  sits at document-space y = N × (720 + 24). */
export async function pointOnPage(
  ctx: PageContext,
  pageIndex: number,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const p = await screenPoint(
    ctx.page,
    x,
    y + pageIndex * (TRIM_H_PT + PAGE_GAP_PT),
  );
  return { x: p.x, y: p.y };
}

/** Drag a pointer stroke through page-local pt waypoints. The hover +
 *  settle before pressing is the paint journey's finding: the tool's
 *  `onActivate` resolves its frame fit asynchronously and an immediate
 *  drag is silently dropped. */
export async function strokeOnPage(
  ctx: PageContext,
  pageIndex: number,
  waypoints: Array<[number, number]>,
): Promise<void> {
  const pts = [];
  for (const [x, y] of waypoints) {
    pts.push(await pointOnPage(ctx, pageIndex, x, y));
  }
  await ctx.page.mouse.move(pts[0].x, pts[0].y);
  await ctx.page.waitForTimeout(750);
  await ctx.page.mouse.down();
  for (const pt of pts.slice(1)) {
    await ctx.page.mouse.move(pt.x, pt.y, { steps: 4 });
    await ctx.page.waitForTimeout(60);
  }
  await ctx.page.mouse.up();
}

/** Arm a plugin tool through its contributed activation command — the
 *  door the rail's own shortcut uses (`designer.activate` only reaches
 *  the built-in slots; the image journeys carry the same note). */
export async function armTool(ctx: PageContext, toolId: string): Promise<void> {
  await ctx.doc.runCommand(`paged.tool.activate.${toolId}`).catch(() => {});
}

/** The Selection readout, as the ENGINE reports it (coverage %), null
 *  while no selection exists — absence is a state, not a miss. */
export async function selectionCoverage(
  ctx: PageContext,
): Promise<number | null> {
  const el = ctx.page.locator("[data-image-selection-coverage]");
  if ((await el.count()) === 0) return null;
  const text = (await el.first().textContent()) ?? "";
  const n = Number.parseFloat(text.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

export async function selectionBounds(ctx: PageContext): Promise<string | null> {
  const el = ctx.page.locator("[data-image-selection-bounds]");
  if ((await el.count()) === 0) return null;
  return (await el.first().textContent())?.trim() ?? null;
}

// ── the kernel roster (read from the plugin's own registry) ─────────

export interface KernelRoster {
  total: number;
  /** family prefix → kernel names (suffix after the first dot). */
  families: Map<string, string[]>;
}

/** Parse `- id: family.kernel` rows out of plugin-image's committed
 *  `registry/kernels.yaml` — the count's declared source of truth. The
 *  roster page prints THIS, never a hand-typed list. */
export function readKernelRoster(): KernelRoster | null {
  if (!existsSync(KERNELS_YAML)) return null;
  const text = readFileSync(KERNELS_YAML, "utf8");
  const families = new Map<string, string[]>();
  let total = 0;
  for (const m of text.matchAll(/^- id:[ \t]*([a-z0-9_]+)\.([a-z0-9_.]+)/gm)) {
    total += 1;
    const list = families.get(m[1]) ?? [];
    list.push(m[2]);
    families.set(m[1], list);
  }
  return total > 0 ? { total, families } : null;
}
