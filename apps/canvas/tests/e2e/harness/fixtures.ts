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

// E2E op suite — fixture catalogue + loader. Wraps the fidelity
// driver's worker-path loadIdml and resolves canonical operation
// targets (first text frame / rectangle / any frame per page,
// first story) once per load via the scene tree, so domain suites
// address elements without per-test tree walking.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

import { loadIdml } from "../../fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** apps/canvas/tests/e2e/harness → repo root (editor/). */
export const REPO_ROOT = pathResolve(__dirname, "..", "..", "..", "..", "..");

/** The 13 generated feature fixtures + curated real documents. */
export const FIXTURES = {
  // generated (small, deterministic, feature-mapped)
  text: "corpus/generated/text.idml",
  "text-advanced": "corpus/generated/text-advanced.idml",
  "text-letterspacing": "corpus/generated/text-letterspacing.idml",
  "text-overset": "corpus/generated/text-overset.idml",
  "text-wrap": "corpus/generated/text-wrap.idml",
  "links-broken": "corpus/generated/links-broken.idml",
  geometry: "corpus/generated/geometry.idml",
  "geometry-groups": "corpus/generated/geometry-groups.idml",
  "strokes-fills": "corpus/generated/strokes-fills.idml",
  gradients: "corpus/generated/gradients.idml",
  effects: "corpus/generated/effects.idml",
  transparency: "corpus/generated/transparency.idml",
  images: "corpus/generated/images.idml",
  tables: "corpus/generated/tables.idml",
  anchored: "corpus/generated/anchored.idml",
  // real documents (user-curated)
  sample: "corpus/samples/sample.idml",
  "line-sheet": "corpus/samples/line-sheet.idml",
  "sample-3": "corpus/samples/sample-3.idml",
} as const;

export type FixtureName = keyof typeof FIXTURES;

export function fixturePath(name: FixtureName): string {
  return pathResolve(REPO_ROOT, FIXTURES[name]);
}

export interface ElementRef {
  kind: string;
  id: string;
}

export interface PageInfo {
  pageId: string;
  widthPt: number;
  heightPt: number;
}

export interface LoadedFixture {
  name: string;
  pageCount: number;
  pages: PageInfo[];
  /** First element of each kind found in document order. */
  firstTextFrame: ElementRef | null;
  firstRectangle: ElementRef | null;
  firstPolygon: ElementRef | null;
  firstLine: ElementRef | null;
  firstGroup: ElementRef | null;
  /** Page index hosting `firstGroup` (-1 when none). */
  firstGroupPage: number;
  /** First frame (any kind) per page index. */
  framesByPage: (ElementRef | null)[];
  /** All frames in document order with their page index. */
  frames: Array<{ ref: ElementRef; pageIndex: number }>;
  /** First story (selfId + characterCount), when the doc has text. */
  firstStory: { selfId: string; characterCount: number } | null;
}

interface TreeNode {
  /** Element address — null for structural nodes (Spread/Page). */
  id?: { kind: string; id: string } | null;
  /** Display kind ("Spread" / "Page" / "Rectangle" / …). */
  kind?: string;
  children?: TreeNode[];
}

/**
 * Load a fixture through the worker path (fast; bypasses React — see
 * the driver caveat) and resolve canonical targets. `absPath` lets
 * the extensive corpus mode point at envato pack templates.
 */
export async function loadFixture(
  page: Page,
  name: FixtureName | { label: string; absPath: string; packName?: string },
): Promise<LoadedFixture> {
  const label = typeof name === "string" ? name : name.label;
  const path = typeof name === "string" ? fixturePath(name) : name.absPath;
  const packName = typeof name === "string" ? undefined : name.packName;
  const doc = await loadIdml(page, path, packName);

  const resolved = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              src: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const treeJson = await c.client
      .executeScript("paged.tree()")
      .then((r) => r.output[0] ?? "[]");
    const storiesJson = await c.client
      .executeScript("paged.stories()")
      .then((r) => r.output[0] ?? "[]")
      .catch(() => "[]");
    return { treeJson, storiesJson };
  });

  const tree = JSON.parse(resolved.treeJson) as TreeNode[];
  const stories = JSON.parse(resolved.storiesJson) as Array<{
    selfId: string;
    characterCount: number;
  }>;

  // Walk: top level = Spread nodes; their children = Page nodes
  // (id: null, kind: "Page", document order); page children =
  // frames (possibly nested in Groups, which DO carry element ids).
  const frames: Array<{ ref: ElementRef; pageIndex: number }> = [];
  let firstGroup: ElementRef | null = null;
  let firstGroupPage = -1;
  let pageIndex = -1;
  const visit = (node: TreeNode, inPage: boolean) => {
    if (node.kind === "Page") {
      pageIndex++;
      for (const child of node.children ?? []) visit(child, true);
      return;
    }
    const id = node.id ?? null;
    if (inPage && id) {
      if (id.kind === "group") {
        if (!firstGroup) {
          firstGroup = id;
          firstGroupPage = Math.max(0, pageIndex);
        }
      } else {
        frames.push({ ref: id, pageIndex: Math.max(0, pageIndex) });
      }
    }
    for (const child of node.children ?? []) visit(child, inPage);
  };
  for (const spread of tree) visit(spread, false);

  const firstOf = (kind: string): ElementRef | null =>
    frames.find((f) => f.ref.kind === kind)?.ref ?? null;
  const framesByPage: (ElementRef | null)[] = doc.pages.map(
    (_p, i) => frames.find((f) => f.pageIndex === i)?.ref ?? null,
  );

  return {
    name: label,
    pageCount: doc.pageCount,
    pages: doc.pages,
    firstTextFrame: firstOf("textFrame"),
    firstRectangle: firstOf("rectangle"),
    firstPolygon: firstOf("polygon"),
    firstLine: firstOf("graphicLine"),
    firstGroup,
    firstGroupPage,
    framesByPage,
    frames,
    firstStory: stories[0] ?? null,
  };
}

/** MODEL-space frame bounds (the wire's `frameBounds` — pre-
 *  transform). Use for model assertions, NOT for render regions. */
export async function elementBoundsPt(
  page: Page,
  ref: ElementRef,
): Promise<{
  top: number;
  left: number;
  bottom: number;
  right: number;
} | null> {
  return page.evaluate(async (id) => {
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
    const props = await c.client.elementProperties(id);
    const bounds = props?.entries.find((e) => e.path === "frameBounds")
      ?.value as { type: string; value: number[] } | undefined;
    if (!bounds || bounds.type !== "bounds") return null;
    const [top, left, bottom, right] = bounds.value;
    return { top, left, bottom, right };
  }, ref);
}

/** PAGE-space axis-aligned bounds (pt) — `elementGeometry` bounds
 *  pushed through the item transform. This is the space snapshots
 *  render in; render regions MUST come from here (frameBounds is
 *  model-space — the geometry fixture's "identity" rect lives at
 *  [0,0,100,100] yet paints at the page centre via its transform). */
export async function elementPageRectPt(
  page: Page,
  ref: ElementRef,
): Promise<{
  top: number;
  left: number;
  bottom: number;
  right: number;
} | null> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  | [number, number, number, number, number, number]
                  | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const corners: Array<[number, number]> = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([x, y]) => [a * x + cc * y + tx, b * x + d * y + ty]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return {
      top: Math.min(...ys),
      left: Math.min(...xs),
      bottom: Math.max(...ys),
      right: Math.max(...xs),
    };
  }, ref);
}
