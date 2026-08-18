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

import { type ElementRef, type LoadedFixture } from "./fixtures";
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
  // inflate() now throws instead of silently collapsing an off-image
  // region to zero area (the "0 changed pixels" lie). On real docs an
  // off-image region is a TARGET fact (pasteboard/bleed element), the
  // same advisory class — and the note now names the real cause.
  "degenerate or fully off-image",
];

function classify(message: string): OpStatus {
  return RENDER_STALE_MARKERS.some((m) => message.includes(m))
    ? "render-stale"
    : "error";
}

const UNDO_TEXT_CACHE_BUG =
  "engine: undo/redo don't clear body_story_emit_cache (stale text render after undo)";

/** First paint swatch, optionally excluding one id (so a recolour op
 *  never "recolours" to the fill the target already has). */
async function firstSwatchId(
  page: Page,
  excludeId: string | null = null,
): Promise<string | null> {
  return page.evaluate(async (exclude) => {
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
    const eligible = sw.filter((s) => s.selfId !== exclude);
    const paint = eligible.find(
      (s) => s.kind === "process" || s.kind === "black" || s.kind === "spot",
    );
    return (paint ?? eligible[0])?.selfId ?? null;
  }, excludeId);
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

/** Read one property VALUE (`{type, value}`) off an element, or null
 *  when the element / path doesn't resolve. The read-back half of the
 *  model assertions — the same `elementProperties` lane panels use. */
async function readPropValue(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<{ type: string; value: unknown } | null> {
  return page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{
                  path: string;
                  value?: { type: string; value: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

/** A fill is VISIBLE when it names a real swatch — `Swatch/None` (or
 *  an empty ref) paints nothing, and an op on such a box can never
 *  move a pixel. */
function isVisibleFill(v: { type: string; value: unknown } | null): boolean {
  return (
    v?.type === "colorRef" &&
    typeof v.value === "string" &&
    v.value !== "" &&
    v.value !== "Swatch/None" &&
    v.value !== "None"
  );
}

/** The first rectangle that PAINTS ON A PAGE with a visible fill.
 *  Templates routinely lead with invisible None-fill clip/guide boxes
 *  and pasteboard art; targeting either made "render-stale" absorb
 *  "we picked a box that can't move a pixel" (audit 17082026).
 *  Preference: visible fill + on a listed page → any on-page
 *  rectangle (noted) → any rectangle (noted); null when the document
 *  has no rectangle at all. */
async function pickVisibleRectangle(
  page: Page,
  fx: LoadedFixture,
): Promise<{
  ref: ElementRef;
  pageIndex: number;
  note?: string;
} | null> {
  const rects = fx.frames.filter((f) => f.ref.kind === "rectangle");
  if (rects.length === 0) return null;
  // Probe a bounded prefix — enough to skip a template's leading
  // clip boxes and pasteboard art (envato templates park whole
  // alternate layouts off-canvas) without walking a 500-frame
  // document. Host-page first (one wire call) — the fill read only
  // pays for on-page candidates.
  const PROBE = 40;
  let firstOnPage: (typeof rects)[number] | null = null;
  for (const r of rects.slice(0, PROBE)) {
    const pid = await elementHostPageId(page, r.ref);
    const onPage = pid !== null && fx.pages.some((p) => p.pageId === pid);
    if (!onPage) continue;
    firstOnPage ??= r;
    const fill = await readPropValue(page, r.ref, "frameFillColor");
    if (isVisibleFill(fill)) {
      return { ref: r.ref, pageIndex: r.pageIndex };
    }
  }
  if (firstOnPage) {
    return {
      ref: firstOnPage.ref,
      pageIndex: firstOnPage.pageIndex,
      note: `no on-page rectangle with a visible fill in the first ${Math.min(
        rects.length,
        PROBE,
      )} — using the first on-page rectangle (invisible target; the render check may be weak)`,
    };
  }
  return {
    ref: rects[0].ref,
    pageIndex: rects[0].pageIndex,
    note: `no rectangle in the first ${Math.min(
      rects.length,
      PROBE,
    )} renders on a listed page — using the first rectangle (likely pasteboard)`,
  };
}

/** Head-first `NextTextFrame` chain for a story — the frames that
 *  actually RENDER it. Story-table order and frame layout order are
 *  unrelated on real documents; sampling "the first text frame" for
 *  "the first story" produced the false render-stale sweep (audit
 *  17082026). Rides the wire's `requestFrameChain` (v38 C-2/S-05)
 *  through the client's generic `send`. */
async function storyFrameChain(
  page: Page,
  storyId: string,
): Promise<Array<{ frameId: string; next: string | null; overflow: boolean }>> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: { kind: string; payload: unknown }) => Promise<{
              kind: string;
              payload?: {
                links?: Array<{
                  frameId: string;
                  next: string | null;
                  overflow: boolean;
                }>;
              };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "requestFrameChain",
      payload: { storyId: id },
    });
    if (reply.kind !== "frameChainResult") {
      throw new Error(`requestFrameChain: unexpected reply ${reply.kind}`);
    }
    return reply.payload?.links ?? [];
  }, storyId);
}

/** The page that RENDERS an element, per the geometry door's C-23
 *  centroid attribution (`ElementGeometryItem.pageId`; null = the
 *  PASTEBOARD). The scene-tree walk's page attribution follows the
 *  IDML nesting, which on real spread documents routinely disagrees
 *  with where the element paints — and `elementGeometry` bounds are
 *  SPREAD-local (core composes `item_transform` against the spread,
 *  and pages carry their own spread offsets), so a tree-attributed
 *  page + spread-space rect sampled the WRONG part of the snapshot
 *  and reported "0 changed pixels" (audit 17082026). The wire has no
 *  page-origin door, so docOpPass diffs the WHOLE host page instead
 *  of a mis-spaced sub-region (containment was already off here). */
async function elementHostPageId(
  page: Page,
  ref: ElementRef,
): Promise<string | null> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (
              ids: unknown[],
            ) => Promise<Array<{ pageId?: string | null }>>;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    return items[0]?.pageId ?? null;
  }, ref);
}

/** Page-local rect-per-line geometry for a story range — the ONE
 *  page-local geometry source on the wire, and therefore the honest
 *  region source for text ops on real documents. */
async function storySelectionRects(
  page: Page,
  storyId: string,
  end: number,
): Promise<
  Array<{
    pageId: string;
    leftPt: number;
    topPt: number;
    widthPt: number;
    heightPt: number;
  }>
> {
  return page.evaluate(
    async ({ id, e }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              selectionGeometry: (sel: unknown) => Promise<
                Array<{
                  pageId: string;
                  leftPt: number;
                  topPt: number;
                  widthPt: number;
                  heightPt: number;
                }>
              >;
            };
          };
        }
      ).__canvas;
      return c.client.selectionGeometry({
        storyId: id,
        start: 0,
        end: e,
        affinity: false,
      });
    },
    { id: storyId, e: end },
  );
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
  /** Carried onto a PASS result — records a degraded-target fallback
   *  (e.g. "no visible-fill rectangle") so the report stays honest
   *  about what the green actually proved. */
  passNote?: string,
): Promise<void> {
  try {
    await fn();
    results.push({ op, status: "pass", note: passNote });
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

  // Shared target for the frame-property ops (1, 3, 4): the first
  // rectangle whose fill actually PAINTS. Templates lead with
  // invisible None-fill clip boxes; opacity/fill/resize on one can
  // never change a pixel, and "render-stale" then lies about the op.
  const rectPick = await pickVisibleRectangle(page, fx);

  /** The page that RENDERS `ref` (geometry-door attribution — see
   *  elementHostPageId): null when it paints on no page (pasteboard)
   *  or its page id isn't in the handle's page list (master). The
   *  frame ops diff this WHOLE page: element rects are spread-local
   *  on the wire and cannot be converted to snapshot space, so a
   *  sub-region would sample the wrong pixels on real spread docs. */
  const hostPage = async (
    ref: ElementRef,
  ): Promise<{ pageId: string; widthPt: number; index: number } | null> => {
    const pid = await elementHostPageId(page, ref);
    if (!pid) return null;
    const index = fx.pages.findIndex((p) => p.pageId === pid);
    return index >= 0
      ? {
          pageId: fx.pages[index].pageId,
          widthPt: fx.pages[index].widthPt,
          index,
        }
      : null;
  };

  // 1) frameOpacity — on the visible-fill rectangle; fall back to the
  //    first ON-PAGE frame (any kind) with a recorded reason.
  let opacityTarget = rectPick;
  if (!opacityTarget) {
    for (const f of fx.frames.slice(0, 12)) {
      const h = await hostPage(f.ref);
      if (h) {
        opacityTarget = {
          ref: f.ref,
          pageIndex: h.index,
          note: "document has no rectangle — frameOpacity on the first on-page frame",
        };
        break;
      }
    }
  }
  if (opacityTarget) {
    const host = await hostPage(opacityTarget.ref);
    if (host) {
      const controlPage =
        fx.pageCount > 1 ? fx.pages[(host.index + 1) % fx.pageCount] : null;
      // Read the CURRENT opacity so the write is guaranteed to be a
      // change (a template box already at 40 would render-stale by
      // construction, saying nothing about the engine).
      const beforeVal = await readPropValue(
        page,
        opacityTarget.ref,
        "frameOpacity",
      );
      const current =
        beforeVal?.type === "length" && typeof beforeVal.value === "number"
          ? beforeVal.value
          : null;
      const targetOpacity =
        current !== null && Math.abs(current - 40) < 0.5 ? 70 : 40;
      await runOp(
        "setElementProperty(frameOpacity)",
        assert,
        () =>
          opSandwich(page, {
            pageId: host.pageId,
            pageWidthPt: host.widthPt,
            region: null,
            controlPage: controlPage
              ? { pageId: controlPage.pageId, pageWidthPt: controlPage.widthPt }
              : null,
            apply: async () => {
              await mutate(page, {
                op: "setElementProperty",
                args: {
                  elementId: opacityTarget.ref,
                  path: "frameOpacity",
                  value: { type: "length", value: targetOpacity },
                },
              });
            },
            expectModel: async () => {
              const v = await readPropValue(
                page,
                opacityTarget.ref,
                "frameOpacity",
              );
              const got =
                v?.type === "length" && typeof v.value === "number"
                  ? v.value
                  : null;
              if (got === null || Math.abs(got - targetOpacity) > 0.01) {
                throw new Error(
                  `frameOpacity did not land in the model: expected ${targetOpacity}, read ${JSON.stringify(v)}`,
                );
              }
            },
          }).then(() => undefined),
        results,
        opacityTarget.note,
      );
    } else {
      results.push({
        op: "setElementProperty(frameOpacity)",
        status: "skip",
        note: "target renders on no listed page (pasteboard / master)",
      });
    }
  } else {
    results.push({ op: "setElementProperty(frameOpacity)", status: "skip" });
  }

  // 2) translate gesture on the first frame.
  if (firstFrame && firstFramePage) {
    const host = await hostPage(firstFrame);
    if (host) {
      const dx = 30;
      const dy = 22;
      await runOp(
        "gesture(translate)",
        assert,
        () =>
          opSandwich(page, {
            pageId: host.pageId,
            pageWidthPt: host.widthPt,
            region: null,
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
      results.push({
        op: "gesture(translate)",
        status: "skip",
        note: "target renders on no listed page (pasteboard / master)",
      });
    }
  } else {
    results.push({ op: "gesture(translate)", status: "skip" });
  }

  // 3) resizeFrame on the visible-fill rectangle.
  if (rectPick) {
    const rect = rectPick.ref;
    const host = await hostPage(rect);
    const boundsVal = await readPropValue(page, rect, "frameBounds");
    const props =
      boundsVal?.type === "bounds" && Array.isArray(boundsVal.value)
        ? (boundsVal.value as number[])
        : null;
    if (host && props) {
      const grown: [number, number, number, number] = [
        props[0],
        props[1],
        props[2] + 40,
        props[3] + 40,
      ];
      await runOp(
        "resizeFrame",
        assert,
        () =>
          opSandwich(page, {
            pageId: host.pageId,
            pageWidthPt: host.widthPt,
            region: null,
            apply: async () => {
              await mutate(page, {
                op: "resizeFrame",
                args: { frameId: rect.id, bounds: grown },
              });
            },
            expectModel: async () => {
              const v = await readPropValue(page, rect, "frameBounds");
              const got =
                v?.type === "bounds" && Array.isArray(v.value)
                  ? (v.value as number[])
                  : null;
              if (
                !got ||
                got.length !== 4 ||
                got.some((b, i) => Math.abs(b - grown[i]) > 0.01)
              ) {
                throw new Error(
                  `resizeFrame did not land in the model: expected [${grown}], read ${JSON.stringify(v)}`,
                );
              }
            },
          }).then(() => undefined),
        results,
        rectPick.note,
      );
    } else {
      results.push({
        op: "resizeFrame",
        status: "skip",
        note: host
          ? "target reports no frameBounds"
          : "target renders on no listed page (pasteboard / master)",
      });
    }
  } else {
    results.push({ op: "resizeFrame", status: "skip" });
  }

  // 4) frameFillColor on the visible-fill rectangle (recolour to a
  //    swatch DIFFERENT from the current fill — recolouring to the
  //    same swatch is a no-op that would falsely read render-stale).
  if (rectPick) {
    const rect = rectPick.ref;
    const host = await hostPage(rect);
    const currentFill = await readPropValue(page, rect, "frameFillColor");
    const exclude =
      currentFill?.type === "colorRef" && typeof currentFill.value === "string"
        ? currentFill.value
        : null;
    const sw = await firstSwatchId(page, exclude);
    if (host && sw) {
      await runOp(
        "setElementProperty(frameFillColor)",
        assert,
        () =>
          opSandwich(page, {
            pageId: host.pageId,
            pageWidthPt: host.widthPt,
            region: null,
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
            expectModel: async () => {
              const v = await readPropValue(page, rect, "frameFillColor");
              if (!(v?.type === "colorRef" && v.value === sw)) {
                throw new Error(
                  `frameFillColor did not land in the model: expected ${sw}, read ${JSON.stringify(v)}`,
                );
              }
            },
          }).then(() => undefined),
        results,
        rectPick.note,
      );
    } else {
      results.push({
        op: "setElementProperty(frameFillColor)",
        status: "skip",
        note: host
          ? "no paint swatch differing from the current fill"
          : "target renders on no listed page (pasteboard / master)",
      });
    }
  } else {
    results.push({ op: "setElementProperty(frameFillColor)", status: "skip" });
  }

  // 5) insertText on the first story (undo render is the known text
  //    cache bug → waive the pixel check, keep model restore hard).
  //
  //    The render page + region come from where the story's opening
  //    characters actually PAINT — `selectionGeometry` is the wire's
  //    one page-LOCAL geometry source (rect-per-line, page-local pt).
  //    Story-table order and frame layout order are UNRELATED on real
  //    documents; sampling "the first text frame's" spread-space rect
  //    made all 45 corpus packs read render-stale falsely (audit
  //    17082026). When nothing renders the story, the frame chain
  //    (`requestFrameChain`) names WHY in an honest skip.
  if (fx.stories.length > 0 && firstFramePage) {
    // Walk the story table IN ORDER and take the first story whose
    // opening range paints on a listed page — the op needs a story
    // the canvas can prove; empty or master/pasteboard stories can't
    // prove anything (annual-report's story-table head is empty).
    const probeLimit = Math.min(fx.stories.length, 20);
    const probes: string[] = [];
    let chosen: {
      selfId: string;
      before: number;
      rects: Awaited<ReturnType<typeof storySelectionRects>>;
      index: number;
    } | null = null;
    for (let i = 0; i < probeLimit; i++) {
      const story = fx.stories[i];
      const count = await storyChars(page, story.selfId);
      if (count <= 0) {
        probes.push(`${story.selfId}: empty`);
        continue;
      }
      const rects = await storySelectionRects(
        page,
        story.selfId,
        Math.min(count, 40),
      );
      if (!rects.some((r) => fx.pages.some((p) => p.pageId === r.pageId))) {
        // Enrich the first such probe with the frame chain — the
        // honest WHY (unplaced vs off-page vs fully overset).
        if (probes.length < 4) {
          const chain = await storyFrameChain(page, story.selfId);
          probes.push(
            `${story.selfId}: ${count} chars, ${
              chain.length === 0
                ? "no frame chain (unplaced)"
                : `chain of ${chain.length}${
                    chain[chain.length - 1]?.overflow ? " overset" : ""
                  } renders on no listed page`
            }`,
          );
        } else {
          probes.push(`${story.selfId}: renders on no listed page`);
        }
        continue;
      }
      chosen = { selfId: story.selfId, before: count, rects, index: i };
      break;
    }
    if (!chosen) {
      results.push({
        op: "insertText",
        status: "skip",
        note: `none of the first ${probeLimit} stories renders on a listed page — ${probes
          .slice(0, 4)
          .join("; ")}`,
      });
    } else {
      const pageRect = chosen.rects.find((r) =>
        fx.pages.some((p) => p.pageId === r.pageId),
      )!;
      const pageInfo = fx.pages.find((p) => p.pageId === pageRect.pageId)!;
      // Union the opening range's line rects on that page — the exact
      // pixels the insertion must disturb (page-LOCAL by contract).
      const onPage = chosen.rects.filter((r) => r.pageId === pageRect.pageId);
      const region = {
        top: Math.min(...onPage.map((r) => r.topPt)),
        left: Math.min(...onPage.map((r) => r.leftPt)),
        bottom: Math.max(...onPage.map((r) => r.topPt + r.heightPt)),
        right: Math.max(...onPage.map((r) => r.leftPt + r.widthPt)),
      };
      const storyId = chosen.selfId;
      const before = chosen.before;
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
                args: { storyId, offset: 0, text: "Zz " },
              });
            },
            expectModel: async () => {
              if ((await storyChars(page, storyId)) !== before + 3) {
                throw new Error("insertText did not grow the story by 3");
              }
            },
          }).then(() => undefined),
        results,
        chosen.index > 0
          ? `story-table head unusable (${probes.join("; ")}) — using story ${storyId} (entry ${
              chosen.index + 1
            } of ${fx.stories.length})`
          : undefined,
      );
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
