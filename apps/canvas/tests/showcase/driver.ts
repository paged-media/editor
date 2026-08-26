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

// `ShowcaseDoc` — the authoring surface the showcase page modules use.
//
// It is a thin layer over the journey `Designer`, not a replacement.
// Designer already owns the primitives (draw, select, fill, render,
// count, layers, swatches, runCommand) and every plugin journey is
// written against it, so the recipes here stay recognisable to anyone
// who has read those specs. What this adds is the handful of doors a
// long-form DOCUMENT needs and a single-page journey does not: pages
// addressed by index, text poured and styled by NAME, frames threaded
// into a story, items assigned to layers, and the container written
// out at the end.
//
// Two rules the modules rely on:
//
//   · Everything is addressed BY NAME, never by index into a
//     collection. The corpus campaign's sharpest lesson was a spec
//     that took the LAST paragraph style and went quietly green for
//     two months when a regenerated fixture appended one more. Style
//     and swatch lookups here resolve by name and THROW when the name
//     is absent, so a drifted base fixture fails loudly on page one.
//
//   · `mutate` never rejects. `client.mutate` resolves with
//     `mutationFailed` rather than throwing, so every wrapper here
//     checks the reply kind and throws with the engine's own error.
//     A silent refusal would otherwise show up much later as an empty
//     frame nobody ordered.

import { expect, type Page } from "@playwright/test";

import { mutate as rawMutate, script } from "../e2e/harness/ui";
import { Designer } from "../journey/driver/designer";
import type { Ledger } from "./ledger";

/** One page, as `paged.pages()` reports it (`PageSummary` on the wire:
 *  `selfId`, 1-based `index`, `sizePt` and the four margins). The
 *  driver keeps the wire's own field names rather than renaming them —
 *  the spelling here was guessed once as `pageId`/`widthPt` and the
 *  driver's spec caught it, which is the argument for not guessing. */
export interface PageInfo {
  selfId: string;
  index: number;
  sizePt: [number, number];
  marginTopPt?: number;
  marginLeftPt?: number;
  marginBottomPt?: number;
  marginRightPt?: number;
}

export interface NamedItem {
  selfId: string;
  name?: string;
}

/** `[top, left, bottom, right]`, the engine's bounds order. */
export type Bounds = [number, number, number, number];

export class ShowcaseDoc {
  readonly designer: Designer;

  private pagesCache: PageInfo[] = [];

  /** When set, every wire op that passes through {@link mutate} is
   *  tallied (ops + property paths) for the three-axis ledger. The
   *  chapter runner sets it; standalone driver tests leave it unset. */
  ledger?: Ledger;

  constructor(readonly page: Page) {
    this.designer = new Designer(page);
  }

  // ── document ────────────────────────────────────────────────────

  /**
   * Load an IDML/`.paged` from an absolute path through the editor's REAL
   * open flow — the file input the drop zone and File ▸ Open both feed.
   *
   * It used to call `client.loadDocument` directly, and that one shortcut
   * cost the showcase its GPU. `client.loadDocument` reaches the WORKER
   * only: the shell's `useDocument().handle` stays null, so
   * `canvas-panel.tsx` renders its "Drop an IDML file here" placeholder
   * instead of `<ViewportCanvas>`, so no OffscreenCanvas is ever
   * transferred, so `attachCanvas` → `initGpu` never runs and
   * `__canvas.gpuActive` sits at `null` forever. The whole document still
   * built (every read here is worker-side), which is why it looked like a
   * missing adapter rather than a missing canvas — but paged.image's
   * GPU-only kernels degraded to a note on a machine that has a perfectly
   * good Metal adapter.
   *
   * Driving the input is the same idiom the panel specs use
   * (`loadViaInput` in navigator-panel.spec.ts et al) and it goes through
   * `loadDocumentFile` — which also hands the engine the default font, so
   * text shapes here exactly as it does for a user.
   */
  async load(absPath: string): Promise<number> {
    await this.page.setInputFiles('input[type="file"]', absPath);
    await this.page.waitForFunction(
      () =>
        (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas
          ?.ready === true,
      null,
      { timeout: 120_000 },
    );
    const count = await this.page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { handle: { pageCount: number } };
          }
        ).__canvas.handle.pageCount,
    );
    this.pagesCache = [];
    return count;
  }

  /** Every page, in document order. Cached; call `refreshPages()` after
   *  a structural change. */
  async pages(): Promise<PageInfo[]> {
    if (this.pagesCache.length === 0) await this.refreshPages();
    return this.pagesCache;
  }

  async refreshPages(): Promise<PageInfo[]> {
    // `paged.pages()` returns a JSON STRING (every read in the Boa
    // surface does). Evaluating the expression is enough — wrapping it
    // in `console.log` would come back through the capture channel
    // prefixed with `[log] ` and fail to parse, which is exactly what
    // the driver's own spec caught.
    const raw = await script(this.page, "paged.pages()");
    this.pagesCache = JSON.parse(raw[0] ?? "[]") as PageInfo[];
    return this.pagesCache;
  }

  /** Engine page id for a ZERO-based index. `PageSummary.index` is
   *  1-based (it is what a "go to page" box shows), so the two are not
   *  interchangeable and the conversion lives here rather than in
   *  fifteen page modules. */
  async pageId(index: number): Promise<string> {
    const all = await this.pages();
    const p = all[index];
    if (!p) throw new Error(`no page at index ${index} (have ${all.length})`);
    return p.selfId;
  }

  // ── the raw wire, with refusals made loud ───────────────────────

  /**
   * Apply one mutation and return the id of whatever it minted.
   *
   * Throws with the engine's own error on refusal, because
   * `client.mutate` RESOLVES with `mutationFailed` rather than
   * rejecting — a wrapper that forwarded the promise would swallow
   * every engine error and surface it much later as an empty frame
   * nobody ordered.
   *
   * The return type is `unknown` rather than `string` on purpose.
   * `ElementId.id` is usually a raw self_id string, but not always:
   * `insertTable` mints a STRUCTURED id (`{ story_id, table_id }`),
   * and reading that as a string is a bug paged.sheet already shipped
   * once. Callers that know they created a simple element use
   * {@link mutateId}; callers of a structured op narrow it themselves.
   */
  async mutate(op: string, args: unknown): Promise<unknown> {
    if (this.ledger) {
      this.ledger.record(op, args);
      // A batch counts its inner ops too — "exercised inside a batch"
      // is exercised; only counting the wrapper would leave every
      // batched op looking unused.
      if (op === "batch" && typeof args === "object" && args !== null) {
        const inner = (args as { ops?: Array<{ op?: string; args?: unknown }> })
          .ops;
        for (const o of inner ?? []) {
          if (typeof o?.op === "string") this.ledger.record(o.op, o.args);
        }
      }
    }
    const reply = (await rawMutate(this.page, { op, args })) as {
      kind?: string;
      payload?: {
        createdId?: { kind: string; id: unknown } | null;
        error?: unknown;
      };
    };
    if (reply?.kind !== "mutationApplied") {
      const err = JSON.stringify(reply?.payload?.error ?? reply?.kind);
      throw new Error(`mutation ${op} refused: ${err}`);
    }
    return reply.payload?.createdId?.id ?? null;
  }

  /** {@link mutate} for an op that mints a simple element id. Throws
   *  when the engine returned a structured id instead, rather than
   *  stringifying it into something that addresses nothing. */
  async mutateId(op: string, args: unknown): Promise<string> {
    const id = await this.mutate(op, args);
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(
        `${op} did not mint a simple element id (got ${JSON.stringify(id)}) — ` +
          `use mutate() and narrow it`,
      );
    }
    return id;
  }

  /** Several mutations as ONE undo step. Note the engine's batch
   *  executor does not dispatch image ops and does not substitute
   *  `$created` into a `storyId` (wire v62) — compound inserts that
   *  need either stay sequential on purpose. */
  async batch(ops: Array<{ op: string; args: unknown }>): Promise<void> {
    await this.mutate("batch", { ops });
  }

  /**
   * `setElementProperty`, with both halves in the shapes the wire
   * actually wants.
   *
   * `id` is `unknown`, not `string`, because `ElementId` is not a
   * uniform `{kind, id: string}` pair: a `storyRange` carries a STRUCT
   * (`{story_id, start, end}`) and a `tableCell` another one. Passing
   * the pretty `story@start..end` form the id grammar prints is
   * refused as a malformed message — the grammar is for addressing in
   * SCRIPTS, not on this door. {@link storyRangeId} builds the right
   * one.
   *
   * `value` must be an adjacently-tagged `Value` — `{type: "colorRef",
   * value: …}`, `{type: "text", value: …}` — never a bare string.
   */
  async setProperty(
    kind: string,
    id: unknown,
    path: string,
    value: unknown,
  ): Promise<void> {
    await this.mutate("setElementProperty", {
      elementId: { kind, id },
      path,
      value,
    });
  }

  /** The `storyRange` ElementId payload: a struct, not the printed
   *  `Story/u1@0..10` form. */
  storyRangeId(storyId: string, start: number, end: number) {
    return { story_id: storyId, start, end };
  }

  // ── named lookups (never positional) ────────────────────────────

  private async collectionByName(
    collection: string,
    name: string,
  ): Promise<string> {
    const items = (await this.designer.collection(
      collection,
    )) as unknown as NamedItem[];
    const hit = items.find((i) => i.name === name);
    if (!hit) {
      throw new Error(
        `${collection} has no entry named ${JSON.stringify(name)} — ` +
          `have [${items.map((i) => i.name ?? "?").join(", ")}]. ` +
          `The base fixture drifted; fix it rather than taking an index.`,
      );
    }
    return hit.selfId;
  }

  paragraphStyle(name: string): Promise<string> {
    return this.collectionByName("paragraphStyles", name);
  }

  characterStyle(name: string): Promise<string> {
    return this.collectionByName("characterStyles", name);
  }

  swatch(name: string): Promise<string> {
    return this.collectionByName("swatches", name);
  }

  /** Condition SELF-ID by user-visible name. The wire's condition ops
   *  and the `appliedConditions` value both key the styles map by
   *  self-id (`Condition/Draft`), not by display name — passing the
   *  name is refused as "entry not found". */
  condition(name: string): Promise<string> {
    return this.collectionByName("conditions", name);
  }

  conditionSet(name: string): Promise<string> {
    return this.collectionByName("conditionSets", name);
  }

  gradient(name: string): Promise<string> {
    return this.collectionByName("gradients", name);
  }

  async layerId(name: string): Promise<string> {
    const layers = await this.designer.layers();
    const hit = layers.find((l) => (l as { name?: string }).name === name);
    if (!hit) {
      throw new Error(
        `no layer named ${JSON.stringify(name)} — have ` +
          `[${layers.map((l) => (l as { name?: string }).name ?? "?").join(", ")}]`,
      );
    }
    return hit.selfId;
  }

  // ── authoring ───────────────────────────────────────────────────

  /** A text frame on `pageId`; returns its element id. */
  async textFrame(pageId: string, bounds: Bounds): Promise<string> {
    return this.mutateId("insertTextFrame", { pageId, bounds });
  }

  async rectangle(pageId: string, bounds: Bounds): Promise<string> {
    return this.mutateId("insertFrame", { pageId, bounds });
  }

  async oval(pageId: string, bounds: Bounds): Promise<string> {
    return this.mutateId("insertOval", { pageId, bounds });
  }

  /**
   * The story a text frame owns. There is no frame→story read door on
   * the wire, so this recovers it the way paged.sheet and paged.doc do:
   * a hit test at the frame's centre. Both of those plugins learned it
   * the same way, and duplicating the trick here keeps the showcase on
   * the same footing as the shipping code rather than inventing a
   * private door.
   */
  async storyOf(pageId: string, bounds: Bounds): Promise<string> {
    const [top, left, bottom, right] = bounds;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const storyId = await this.page.evaluate(
      async ({ pageId, cx, cy }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                send: (m: unknown) => Promise<{
                  kind: string;
                  payload: { storyId?: string | null };
                }>;
              };
            };
          }
        ).__canvas;
        const reply = await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [cx, cy], filter: "text" },
        });
        return reply.payload.storyId ?? null;
      },
      { pageId, cx, cy },
    );
    if (!storyId) {
      throw new Error(
        `no story under (${cx}, ${cy}) on ${pageId} — the frame is not ` +
          `where the caller thinks it is`,
      );
    }
    return storyId;
  }

  /** Pour text into a story at `offset` (default: append at 0). */
  async insertText(storyId: string, text: string, offset = 0): Promise<void> {
    await this.mutate("insertText", { storyId, offset, text });
  }

  /** Apply a named paragraph or character style to a story range. */
  async applyStyle(
    storyId: string,
    start: number,
    end: number,
    styleId: string,
    scope: "paragraph" | "character",
  ): Promise<void> {
    await this.mutate("applyStyle", {
      storyId,
      start,
      end,
      style: styleId,
      scope,
    });
  }

  /** Thread `from` into `to` so one story flows across both frames. */
  async linkFrames(from: string, to: string): Promise<void> {
    await this.mutate("linkFrames", { from, to });
  }

  /**
   * C-35 (protocol 62) — put a page item on a layer. Before v62 this
   * was inexpressible and items could only be BORN onto a layer by a
   * generated fixture; the showcase's layers page is the first
   * document to author it live.
   */
  async assignLayer(kind: string, id: string, layerId: string): Promise<void> {
    // `Value` is an adjacently-tagged enum on the wire, so a bare
    // string is rejected as a malformed message rather than coerced —
    // the empty string is how `itemLayer` clears to the default layer,
    // and it has to arrive tagged too.
    await this.setProperty(kind, id, "itemLayer", {
      type: "text",
      value: layerId,
    });
  }

  async storyChars(storyId: string): Promise<number> {
    return this.designer.storyChars(storyId);
  }

  // ── output ──────────────────────────────────────────────────────

  /** The `.paged` container bytes for the document as it stands. */
  /**
   * `exportIdml`, but reading BOTH halves of the wire reply. The typed
   * `client.exportIdml()` returns only the bytes and discards
   * `payload.lost` — the v58/C-28 honest-loss ledger (opacity masks and
   * every other `.paged`-native construct IDML cannot carry). The
   * assembly spec asserts that list EQUALS the expected loss set, so a
   * new silent loss fails the build instead of vanishing.
   */
  async exportIdmlWithLost(): Promise<{ bytes: Buffer; lost: string[] }> {
    const out = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload?: { idmlBytes?: number[]; lost?: string[]; error?: string };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.send({ kind: "exportIdml", payload: {} });
      if (reply.kind !== "idmlExported") {
        throw new Error(
          `exportIdml failed: ${reply.payload?.error ?? reply.kind}`,
        );
      }
      const bytes = new Uint8Array(reply.payload?.idmlBytes ?? []);
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return { b64: btoa(s), lost: reply.payload?.lost ?? [] };
    });
    return { bytes: Buffer.from(out.b64, "base64"), lost: out.lost };
  }

  /**
   * Register the annual's font palette with the engine, from the core
   * checkout's `corpus/fonts/`. Fonts reach the page via a routed
   * fetch (`/__annual-fonts/*`) rather than an `evaluate` argument —
   * serialising a 9.6 MB CJK face through CDP as a JSON number array
   * is the kind of cost you pay once per chapter, sixteen times.
   *
   * Every load starts from the engine's default font, so this must run
   * after EVERY `load()` — registration does not survive a reload.
   */
  async registerFonts(fontsDir: string): Promise<void> {
    const faces: Array<{ family: string; style: string | null; file: string }> =
      [
        { family: "Inter", style: null, file: "Inter.ttf" },
        { family: "Open Sans", style: null, file: "OpenSans.ttf" },
        { family: "Open Sans", style: "Italic", file: "OpenSans-Italic.ttf" },
        { family: "Source Serif 4", style: null, file: "SourceSerif4.ttf" },
        { family: "EB Garamond", style: null, file: "EBGaramond-VF.ttf" },
        {
          family: "EB Garamond",
          style: "Italic",
          file: "EBGaramond-Italic-VF.ttf",
        },
        { family: "Fraunces", style: null, file: "Fraunces-VF.ttf" },
        {
          family: "Fraunces",
          style: "Italic",
          file: "Fraunces-Italic-VF.ttf",
        },
        { family: "JetBrains Mono", style: null, file: "JetBrainsMono-VF.ttf" },
        {
          family: "JetBrains Mono",
          style: "Italic",
          file: "JetBrainsMono-Italic-VF.ttf",
        },
        { family: "Space Grotesk", style: null, file: "SpaceGrotesk-VF.ttf" },
        {
          family: "Noto Sans Arabic",
          style: null,
          file: "NotoSansArabic-VF.ttf",
        },
        { family: "Noto Sans JP", style: null, file: "NotoSansJP-VF.ttf" },
      ];
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const present = faces.filter((f) => existsSync(join(fontsDir, f.file)));
    await this.page.route("**/__annual-fonts/*", (route) => {
      const name = route.request().url().split("/__annual-fonts/")[1];
      const face = present.find((f) => f.file === decodeURIComponent(name));
      if (!face) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 200,
        contentType: "font/ttf",
        body: readFileSync(join(fontsDir, face.file)),
      });
    });
    try {
      await this.page.evaluate(
        async (list) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  registerFont: (
                    family: string,
                    bytes: Uint8Array,
                    style: string | null,
                  ) => Promise<void>;
                };
              };
            }
          ).__canvas;
          for (const f of list) {
            const res = await fetch(
              `/__annual-fonts/${encodeURIComponent(f.file)}`,
            );
            if (!res.ok) throw new Error(`font fetch failed: ${f.file}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            await c.client.registerFont(f.family, bytes, f.style);
          }
        },
        present.map(({ family, style, file }) => ({ family, style, file })),
      );
    } finally {
      await this.page.unroute("**/__annual-fonts/*");
    }
  }

  async exportPaged(): Promise<Buffer> {
    const b64 = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { exportPaged: () => Promise<Uint8Array> } };
        }
      ).__canvas;
      const bytes = await c.client.exportPaged();
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    return Buffer.from(b64, "base64");
  }

  async exportIdml(): Promise<Buffer> {
    const b64 = await this.page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { exportIdml: () => Promise<Uint8Array> } };
        }
      ).__canvas;
      const bytes = await c.client.exportIdml();
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    return Buffer.from(b64, "base64");
  }

  /**
   * Render one page to PNG bytes (the deterministic CPU snapshot).
   *
   * Same snapshot door as `Designer.renderBytes`, but the page list is
   * taken from `paged.pages()` (the engine) rather than from the React
   * shell's `__canvas.handle`. The showcase authors pages structurally,
   * and the engine's list is the one that is always current; dpi is
   * derived per page so a mixed-size document still renders each page
   * at the requested pixel width.
   */
  async renderPage(pageIndex: number, widthPx = 1024): Promise<Buffer> {
    const all = await this.pages();
    const info = all[pageIndex];
    if (!info) {
      throw new Error(`no page at index ${pageIndex} (have ${all.length})`);
    }
    const dpi = (widthPx * 72) / info.sizePt[0];
    const arr = await this.page.evaluate(
      async ({ pageId, widthPx, dpi }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                requestSnapshot: (
                  id: string,
                  w: number,
                  d: number,
                ) => Promise<{ pngBytes: Uint8Array }>;
              };
            };
          }
        ).__canvas;
        const snap = await c.client.requestSnapshot(pageId, widthPx, dpi);
        return Array.from(snap.pngBytes);
      },
      { pageId: info.selfId, widthPx, dpi },
    );
    return Buffer.from(Uint8Array.from(arr));
  }

  /**
   * Is a real WebGPU adapter attached? paged.image's kernels need one.
   *
   * WAITS for the answer rather than sampling it. `gpuActive` is `null`
   * until the worker's `attachReady` lands, and `null` reads as "no GPU"
   * — so a plain read taken moments after the document loads reports a
   * CPU lane on a GPU machine. Settling on `true`/`false` turns a race
   * into an answer; the timeout falls through to whatever is there,
   * which on a genuinely adapter-less lane is the honest `null`.
   */
  async gpuActive(): Promise<boolean> {
    await this.page
      .waitForFunction(
        () => {
          const v = (
            globalThis as unknown as { __canvas?: { gpuActive?: unknown } }
          ).__canvas?.gpuActive;
          return v === true || v === false;
        },
        null,
        { timeout: 30_000 },
      )
      .catch(() => undefined);
    return this.designer.gpuActive();
  }

  /**
   * Why there is no GPU, measured — not guessed.
   *
   * "No adapter on this lane" was the story the showcase told for its
   * whole first life, and it was wrong: the browser had an adapter and
   * the editor had never attached a canvas. So when the answer is "no
   * GPU", ask the browser directly and say which of the two it is. Only
   * called on the degrade path, so it costs nothing on a green run.
   */
  async gpuReason(): Promise<string> {
    const probe = await this.page.evaluate(async () => {
      // Typed structurally: the showcase tsconfig has no WebGPU lib.
      const nav = navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> };
      };
      const flag = (
        globalThis as unknown as { __canvas?: { gpuActive?: unknown } }
      ).__canvas?.gpuActive;
      if (!nav.gpu) return { flag, adapter: false, why: "navigator.gpu absent" };
      try {
        const a = await nav.gpu.requestAdapter();
        return {
          flag,
          adapter: !!a,
          why: a ? "requestAdapter() resolved" : "requestAdapter() -> null",
        };
      } catch (e) {
        return { flag, adapter: false, why: `requestAdapter() threw: ${String(e)}` };
      }
    });
    if (!probe.adapter) {
      return (
        `this browser has no WebGPU adapter (${probe.why}) — an environment ` +
        `limit, not a product defect`
      );
    }
    return (
      `the BROWSER has a WebGPU adapter (${probe.why}) but the editor's ` +
      `renderer never attached one (__canvas.gpuActive=${String(probe.flag)}). ` +
      `That is ours: the viewport must mount (a real document open through ` +
      `the shell) before the worker runs initGpu`
    );
  }

  /** Invoke a command exactly as a menu, palette or shortcut would. */
  runCommand(id: string): Promise<void> {
    return this.designer.runCommand(id);
  }

  async select(kind: string, id: string): Promise<void> {
    await this.designer.selectElement(kind, id);
  }

  /** Poll until the page's rendered bytes differ from `before`. The
   *  single-sample form flakes cold — see the journey render-flake
   *  note; always poll. */
  async expectRenderChanged(pageIndex: number, before: Buffer): Promise<void> {
    await expect
      .poll(
        async () => {
          const after = await this.renderPage(pageIndex);
          return after.equals(before) ? 0 : 1;
        },
        { message: `page ${pageIndex} never repainted`, timeout: 15_000 },
      )
      .toBe(1);
  }
}
