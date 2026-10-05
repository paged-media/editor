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

// Shared steps for the paged.web journeys, and the readers they assert
// with. A changed-pixel count says "something painted"; it cannot tell the
// saved source from the previous one, nor which frame of a flow holds which
// words. These readers answer with VALUES:
//
//   · `webSource` — the frame's source as the DOCUMENT holds it (the
//     plugin's metadata label, read through `elementProperties`, the same
//     wire query the bundle host's `getMetadata` uses);
//   · `tapSceneLayers` / `sceneText` — what the bundle last submitted to
//     the canvas for a frame (the C-1 scene layer's text runs, and the
//     host's protocol-68 `fontFallbacks` reply), recorded at the editor's
//     client, the object PagedEditor's `sceneLayers.submit` closes over.

import { expect, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";

export const WEB_PANEL = "media.paged.web.panel.source";
export const INSERT = "media.paged.web.command.insertWebFrame";
export const RENDER = "media.paged.web.command.renderWebFrame";
export const THREAD = "media.paged.web.command.threadWebFlow";
export const BAKE = "media.paged.web.command.bakeWebFrame";
export const METADATA_KEY = "x-paged:media.paged.web";

export interface ElementRef {
  kind: string;
  id: string;
}

export interface SceneText {
  text?: string;
  family?: string;
  weight?: number;
  italic?: boolean;
  x?: number;
  y?: number;
}

export interface WebSource {
  html: string;
  css: string;
  flow?: { recipients: ElementRef[] };
}

type Fn = (...a: unknown[]) => Promise<unknown>;

interface Handle {
  __canvas: {
    client: Record<string, Fn> & {
      camera: { read: () => { scale: number; tx: number; ty: number } };
    };
    registries: { commands: { invoke: (id: string) => Promise<unknown> } };
    setContentSelection?: (s: unknown) => void;
    setElementSelection?: (refs: ElementRef[], mode: string) => void;
    handle?: { pageIds: string[] };
  };
  __paged: { client: Record<string, Fn> };
  __webTap?: {
    layers: Record<string, { texts: SceneText[]; fontFallbacks: unknown; at: number }>;
    cleared: Record<string, number>;
    mutations: Array<{ op: string; at: number }>;
    seq: number;
  };
}

/** Invoke a command through the registry (what a menu, the palette and a
 *  keybinding all do). */
export async function invoke(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (c) => (globalThis as unknown as Handle).__canvas.registries.commands.invoke(c),
    id,
  );
}

/** Raw mutation through the worker client (setup steps that are not the
 *  step under test). Resolves with the reply envelope. */
export async function mutate(page: Page, mutation: unknown): Promise<{
  kind?: string;
  payload?: { createdId?: ElementRef | null };
}> {
  return page.evaluate(
    (m) => (globalThis as unknown as Handle).__canvas.client.mutate(m),
    mutation,
  ) as Promise<{ kind?: string; payload?: { createdId?: ElementRef | null } }>;
}

/** Document undo — the editor's undo (Cmd+Z outside any edit context). */
export async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as unknown as Handle).__canvas.client.undo());
}

/**
 * Record every scene layer the editor's client submits (and clears), per
 * element id, plus every mutation it sends. Install it after the editor
 * opens and before the step under test; it survives `File ▸ New` (the
 * client is the same object).
 */
export async function tapSceneLayers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as Handle;
    if (g.__webTap) return;
    const tap = { layers: {}, cleared: {}, mutations: [], seq: 0 } as NonNullable<
      Handle["__webTap"]
    >;
    g.__webTap = tap;
    const c = g.__paged.client;
    const submit = c.submitSceneLayer.bind(c);
    c.submitSceneLayer = async (...args: unknown[]) => {
      const reply = (await submit(...args)) as { fontFallbacks?: unknown };
      const layer = args[1] as { items?: Array<{ kind?: string }> };
      tap.layers[String(args[0])] = {
        texts: (layer.items ?? []).filter((i) => i.kind === "text") as SceneText[],
        fontFallbacks: reply?.fontFallbacks,
        at: ++tap.seq,
      };
      return reply;
    };
    const clear = c.clearSceneLayer.bind(c);
    c.clearSceneLayer = async (...args: unknown[]) => {
      tap.cleared[String(args[0])] = ++tap.seq;
      delete tap.layers[String(args[0])];
      return clear(...args);
    };
    const mut = c.mutate.bind(c);
    c.mutate = async (...args: unknown[]) => {
      tap.mutations.push({ op: String((args[0] as { op?: string })?.op), at: ++tap.seq });
      return mut(...args);
    };
  });
}

/** The text runs the bundle last submitted for `frameId` (null when it
 *  holds no layer). */
export async function sceneRuns(page: Page, frameId: string): Promise<SceneText[] | null> {
  return page.evaluate(
    (id) => (globalThis as unknown as Handle).__webTap?.layers[id]?.texts ?? null,
    frameId,
  );
}

/** The whole submit record for `frameId` (runs + the host's fallbacks). */
export async function sceneSubmit(
  page: Page,
  frameId: string,
): Promise<{ texts: SceneText[]; fontFallbacks: unknown; at: number } | null> {
  return page.evaluate(
    (id) => (globalThis as unknown as Handle).__webTap?.layers[id] ?? null,
    frameId,
  );
}

/** The submitted text of a frame, its runs joined by spaces and the
 *  whitespace collapsed ("" when it holds no layer). */
export async function sceneText(page: Page, frameId: string): Promise<string> {
  const runs = await sceneRuns(page, frameId);
  return words((runs ?? []).map((r) => r.text ?? "").join(" ")).join(" ");
}

/** Mutations the client sent since tap sequence `since`. */
export async function mutationsSince(page: Page, since: number): Promise<string[]> {
  return page.evaluate(
    (s) =>
      ((globalThis as unknown as Handle).__webTap?.mutations ?? [])
        .filter((m) => m.at > s)
        .map((m) => m.op),
    since,
  );
}

/** The tap's current sequence number (a mark to count from). */
export async function tapMark(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as unknown as Handle).__webTap?.seq ?? 0);
}

export function words(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length > 0);
}

/** The frame's web source as the document holds it (inline label), or
 *  null when the element carries no paged.web label. */
export async function webSource(page: Page, frame: ElementRef): Promise<WebSource | null> {
  return page.evaluate(
    async ({ id, key }) => {
      const c = (globalThis as unknown as Handle).__canvas.client;
      const props = (await c.elementProperties(id)) as {
        entries?: Array<{ value?: { type?: string; value?: { key?: string; value?: string } } }>;
      } | null;
      for (const e of props?.entries ?? []) {
        const v = e.value;
        if (v?.type === "pluginMetadata" && v.value?.key === key && typeof v.value.value === "string") {
          const env = JSON.parse(v.value.value) as { data?: Record<string, unknown> };
          const d = env.data ?? {};
          return {
            html: String(d.html ?? ""),
            css: String(d.css ?? ""),
            flow: d.flow as WebSource["flow"],
          };
        }
      }
      return null;
    },
    { id: frame, key: METADATA_KEY },
  );
}

/** Every page item carrying a paged.web label (ids change across a
 *  reopen; the label does not). */
export async function webFrames(page: Page): Promise<ElementRef[]> {
  const items = await page.evaluate(async () => {
    type Node = { id?: { kind: string; id: unknown } | null; children?: Node[] | null };
    const c = (globalThis as unknown as Handle).__canvas.client;
    const out: ElementRef[] = [];
    const walk = (nodes: Node[] | null | undefined) => {
      for (const n of nodes ?? []) {
        if (n.id && typeof n.id.id === "string") out.push({ kind: n.id.kind, id: n.id.id });
        walk(n.children);
      }
    };
    walk((await c.sceneTree()) as Node[]);
    return out;
  });
  const found: ElementRef[] = [];
  for (const it of items) if (await webSource(page, it)) found.push(it);
  return found;
}

/** The current element selection's only member, or null. */
export async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as Handle).__canvas.client;
    const r = (await c.executeScript("paged.selection()")) as { output: string[] };
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Select page items (what a Shift-click run on the canvas leaves). */
export async function select(page: Page, refs: ElementRef[]): Promise<void> {
  await page.evaluate((r) => {
    const c = (globalThis as unknown as Handle).__canvas;
    c.setContentSelection?.(null);
    c.setElementSelection?.(r, "replace");
  }, refs);
}

/** A frame's bounds [top, left, bottom, right]. */
export async function boundsOf(
  page: Page,
  frame: ElementRef,
): Promise<[number, number, number, number]> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as Handle).__canvas.client;
    const g = (await c.elementGeometry([id])) as Array<{ bounds: [number, number, number, number] }>;
    return g[0]!.bounds;
  }, frame);
}

/**
 * Insert a web frame through the bundle's command, replace its source in
 * the panel and save it to the document. Resolves to the frame, once the
 * document holds the source.
 */
export async function insertWebFrameWith(
  page: Page,
  html: string,
  css = "",
): Promise<ElementRef> {
  await invoke(page, INSERT);
  let frame: ElementRef | null = null;
  await expect
    .poll(
      async () => {
        frame = await selectedElement(page);
        return frame ? await webSource(page, frame) : null;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();
  await saveSource(page, frame!, html, css);
  return frame!;
}

/** Replace the panel's source for the selected web frame and save it;
 *  resolves once the document's label holds `html`. */
export async function saveSource(
  page: Page,
  frame: ElementRef,
  html: string,
  css = "",
): Promise<void> {
  await openPanel(page, WEB_PANEL);
  const htmlInput = page.locator("[data-web-html] [data-code-input]");
  await expect(htmlInput).toBeVisible({ timeout: 10_000 });
  await htmlInput.fill(html);
  const cssInput = page.locator("[data-web-css] [data-code-input]");
  if (await cssInput.isVisible().catch(() => false)) await cssInput.fill(css);
  const save = page.locator("[data-web-commit]");
  await expect(save).toBeEnabled({ timeout: 6_000 });
  await save.click();
  await expect
    .poll(async () => (await webSource(page, frame))?.html, { timeout: 10_000 })
    .toBe(html);
}

/** Screen point of a frame-content point (pt from the frame's top-left). */
export async function screenPointInFrame(
  page: Page,
  frame: ElementRef,
  dxPt: number,
  dyPt: number,
): Promise<{ x: number; y: number }> {
  const at = await page.evaluate(
    async ({ id, dxPt, dyPt }) => {
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
      const c = (globalThis as unknown as Handle).__canvas.client;
      const item = (
        (await c.elementGeometry([id])) as Array<{
          bounds: [number, number, number, number];
          itemTransform?: [number, number, number, number, number, number] | null;
        }>
      )[0];
      if (!item) return null;
      const [top, left] = item.bounds;
      const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
      const px = left + dxPt;
      const py = top + dyPt;
      const cam = c.camera.read();
      return {
        x: wrap.left + (a * px + cc * py + tx) * cam.scale + cam.tx,
        y: wrap.top + (b * px + d * py + ty) * cam.scale + cam.ty,
      };
    },
    { id: frame, dxPt, dyPt },
  );
  expect(at, "the frame has on-screen geometry").not.toBeNull();
  return at!;
}
