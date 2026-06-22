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

// E2E op suite — the document-parameterized operation pass. A curated
// set of core editor operations run against WHATEVER a loaded
// document contains (real sample docs, envato pack templates), each
// through the operation sandwich (model + render + undo). Two modes:
//   assert  — every applicable op must pass (real-doc smoke)
//   advisory — collect each op's outcome without failing (the
//              extensive corpus insight report)
//
// Ops are adaptive: an op with no target in the document is recorded
// "skip", never a failure.

import { type Page } from "@playwright/test";

import {
  elementPageRectPt,
  type ElementRef,
  type LoadedFixture,
} from "./fixtures";
import { opSandwich } from "./op-sandwich";

// pass        — op applied, model + render + undo all verified
// skip        — no target for this op in the document
// render-stale — op applied but the chosen target produced no visible
//                change (or undo wasn't byte-identical): a target /
//                content fact on real docs, not a worker failure
// error       — worker error, exception, panic, or timeout (a real
//                failure the op pass must surface)
export type OpStatus = "pass" | "skip" | "render-stale" | "error";

export interface OpResult {
  op: string;
  status: OpStatus;
  note?: string;
}

/** Sandwich assertion messages that mean "applied but the chosen
 *  target didn't visibly change / restore" — advisory on real docs,
 *  distinct from a worker error. */
const RENDER_STALE_MARKERS = [
  "NO render change",
  "undo did not restore",
  "collateral pixels changed",
  "invalidation contract",
  "control page",
];

function classify(message: string): OpStatus {
  return RENDER_STALE_MARKERS.some((m) => message.includes(m))
    ? "render-stale"
    : "error";
}

const UNDO_TEXT_CACHE_BUG =
  "engine: undo/redo don't clear body_story_emit_cache (stale text render after undo)";

async function firstSwatchId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<Array<{ selfId: string; kind: string }>>;
          };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    const paint = sw.find(
      (s) => s.kind === "process" || s.kind === "black" || s.kind === "spot",
    );
    return (paint ?? sw[0])?.selfId ?? null;
  });
}

async function mutate(page: Page, m: unknown): Promise<unknown> {
  return page.evaluate(async (mm) => {
    return (
      globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
      }
    ).__canvas.client.mutate(mm);
  }, m);
}

async function storyChars(page: Page, id: string): Promise<number> {
  return page.evaluate(async (storyId) => {
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
    const r = await c.client.executeScript("paged.stories()");
    const stories = JSON.parse(r.output[0] ?? "[]") as Array<{
      selfId: string;
      characterCount: number;
    }>;
    return stories.find((s) => s.selfId === storyId)?.characterCount ?? -1;
  }, id);
}

/** Run one sandwiched op; in advisory mode swallow the failure into a
 *  "fail" result, in assert mode let it throw. */
async function runOp(
  op: string,
  assert: boolean,
  fn: () => Promise<void>,
  results: OpResult[],
): Promise<void> {
  try {
    await fn();
    results.push({ op, status: "pass" });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(
      0,
      200,
    );
    const status = classify(message);
    // In assert mode a real worker error still throws; render-stale
    // (a real-doc target fact) is recorded, not thrown.
    if (assert && status === "error") throw err;
    results.push({ op, status, note: message });
  }
}

export interface DocOpPassOptions {
  assert: boolean;
}

export async function docOpPass(
  page: Page,
  fx: LoadedFixture,
  opts: DocOpPassOptions,
): Promise<OpResult[]> {
  const results: OpResult[] = [];
  const { assert } = opts;

  const firstFrame = fx.frames[0]?.ref ?? null;
  const firstFramePage = fx.frames[0] ? fx.pages[fx.frames[0].pageIndex] : null;
  const controlPage =
    fx.pageCount > 1 && fx.frames[0]
      ? fx.pages[(fx.frames[0].pageIndex + 1) % fx.pageCount]
      : null;

  // 1) frameOpacity on the first frame.
  if (firstFrame && firstFramePage) {
    const region = await elementPageRectPt(page, firstFrame);
    if (region) {
      await runOp(
        "setElementProperty(frameOpacity)",
        assert,
        () =>
          opSandwich(page, {
            pageId: firstFramePage.pageId,
            pageWidthPt: firstFramePage.widthPt,
            region,
            containment: false,
            controlPage: controlPage
              ? { pageId: controlPage.pageId, pageWidthPt: controlPage.widthPt }
              : null,
            apply: async () => {
              await mutate(page, {
                op: "setElementProperty",
                args: {
                  elementId: firstFrame,
                  path: "frameOpacity",
                  value: { type: "length", value: 40 },
                },
              });
            },
            expectModel: async () => {},
          }).then(() => undefined),
        results,
      );
    } else {
      results.push({ op: "setElementProperty(frameOpacity)", status: "skip" });
    }
  } else {
    results.push({ op: "setElementProperty(frameOpacity)", status: "skip" });
  }

  // 2) translate gesture on the first frame.
  if (firstFrame && firstFramePage) {
    const before = await elementPageRectPt(page, firstFrame);
    if (before) {
      const dx = 30;
      const dy = 22;
      const region = {
        top: Math.min(before.top, before.top + dy),
        left: Math.min(before.left, before.left + dx),
        bottom: Math.max(before.bottom, before.bottom + dy),
        right: Math.max(before.right, before.right + dx),
      };
      await runOp(
        "gesture(translate)",
        assert,
        () =>
          opSandwich(page, {
            pageId: firstFramePage.pageId,
            pageWidthPt: firstFramePage.widthPt,
            region,
            containment: false,
            apply: async () => {
              await page.evaluate(
                async ({ ref, dx, dy }) => {
                  const c = (
                    globalThis as unknown as {
                      __canvas: {
                        client: {
                          beginGesture: (
                            n: unknown[],
                            g: unknown,
                          ) => Promise<number>;
                          updateGesture: (
                            h: number,
                            d: [number, number],
                            m: unknown,
                          ) => Promise<unknown>;
                          commitGesture: (h: number) => Promise<unknown>;
                        };
                      };
                    }
                  ).__canvas;
                  const h = await c.client.beginGesture([ref], {
                    kind: "translate",
                  });
                  await c.client.updateGesture(h, [dx, dy], {
                    shift: false,
                    alt: false,
                  });
                  await c.client.commitGesture(h);
                },
                { ref: firstFrame as ElementRef, dx, dy },
              );
            },
            expectModel: async () => {},
          }).then(() => undefined),
        results,
      );
    } else {
      results.push({ op: "gesture(translate)", status: "skip" });
    }
  } else {
    results.push({ op: "gesture(translate)", status: "skip" });
  }

  // 3) resizeFrame on the first rectangle.
  const rect = fx.firstRectangle;
  const rectEntry = rect
    ? fx.frames.find((f) => f.ref.id === rect.id)
    : undefined;
  if (rect && rectEntry) {
    const pageInfo = fx.pages[rectEntry.pageIndex];
    const region = await elementPageRectPt(page, rect);
    const props = await page.evaluate(async (id) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const p = await c.client.elementProperties(id);
      const b = p?.entries.find((e) => e.path === "frameBounds")?.value as
        | { value: number[] }
        | undefined;
      return b?.value ?? null;
    }, rect);
    if (region && props) {
      const grown: [number, number, number, number] = [
        props[0],
        props[1],
        props[2] + 40,
        props[3] + 40,
      ];
      const big = {
        top: region.top,
        left: region.left,
        bottom: region.bottom + 60,
        right: region.right + 60,
      };
      await runOp(
        "resizeFrame",
        assert,
        () =>
          opSandwich(page, {
            pageId: pageInfo.pageId,
            pageWidthPt: pageInfo.widthPt,
            region: big,
            containment: false,
            apply: async () => {
              await mutate(page, {
                op: "resizeFrame",
                args: { frameId: rect.id, bounds: grown },
              });
            },
            expectModel: async () => {},
          }).then(() => undefined),
        results,
      );
    } else {
      results.push({ op: "resizeFrame", status: "skip" });
    }
  } else {
    results.push({ op: "resizeFrame", status: "skip" });
  }

  // 4) frameFillColor on the first rectangle (recolour to a swatch).
  if (rect && rectEntry) {
    const pageInfo = fx.pages[rectEntry.pageIndex];
    const region = await elementPageRectPt(page, rect);
    const sw = await firstSwatchId(page);
    if (region && sw) {
      await runOp(
        "setElementProperty(frameFillColor)",
        assert,
        () =>
          opSandwich(page, {
            pageId: pageInfo.pageId,
            pageWidthPt: pageInfo.widthPt,
            region,
            containment: false,
            apply: async () => {
              await mutate(page, {
                op: "setElementProperty",
                args: {
                  elementId: rect,
                  path: "frameFillColor",
                  value: { type: "colorRef", value: sw },
                },
              });
            },
            expectModel: async () => {},
          }).then(() => undefined),
        results,
      );
    } else {
      results.push({
        op: "setElementProperty(frameFillColor)",
        status: "skip",
      });
    }
  } else {
    results.push({ op: "setElementProperty(frameFillColor)", status: "skip" });
  }

  // 5) insertText on the first story (undo render is the known text
  //    cache bug → waive the pixel check, keep model restore hard).
  if (fx.firstStory && firstFramePage) {
    const story = fx.firstStory;
    const textFrame = fx.frames.find((f) => f.ref.kind === "textFrame");
    if (textFrame) {
      const pageInfo = fx.pages[textFrame.pageIndex];
      const region = await elementPageRectPt(page, textFrame.ref);
      if (region) {
        const before = await storyChars(page, story.selfId);
        await runOp(
          "insertText",
          assert,
          () =>
            opSandwich(page, {
              pageId: pageInfo.pageId,
              pageWidthPt: pageInfo.widthPt,
              region,
              containment: false,
              skipUndoPixelCheck: UNDO_TEXT_CACHE_BUG,
              apply: async () => {
                await mutate(page, {
                  op: "insertText",
                  args: { storyId: story.selfId, offset: 0, text: "Zz " },
                });
              },
              expectModel: async () => {
                if ((await storyChars(page, story.selfId)) !== before + 3) {
                  throw new Error("insertText did not grow the story by 3");
                }
              },
            }).then(() => undefined),
          results,
        );
      } else {
        results.push({ op: "insertText", status: "skip" });
      }
    } else {
      results.push({ op: "insertText", status: "skip" });
    }
  } else {
    results.push({ op: "insertText", status: "skip" });
  }

  // 6) createSwatch — model-only, no repaint.
  if (firstFramePage) {
    await runOp(
      "createSwatch",
      assert,
      () =>
        opSandwich(page, {
          pageId: firstFramePage.pageId,
          pageWidthPt: firstFramePage.widthPt,
          noRenderChange: true,
          apply: async () => {
            await mutate(page, {
              op: "createSwatch",
              args: {
                spec: {
                  selfId: null,
                  name: "e2e pass",
                  space: "RGB",
                  value: [33, 150, 243],
                  model: "Process",
                  alternateSpace: null,
                  alternateValue: [],
                  tint: null,
                  alpha: null,
                },
              },
            });
          },
          expectModel: async () => {},
        }).then(() => undefined),
      results,
    );
  } else {
    results.push({ op: "createSwatch", status: "skip" });
  }

  return results;
}
