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

// Page 6 — VECTOR: an SVG becomes native geometry, then gets edited.
//
// RECIPE FROM: `tests/journey/plugins/draw-svg.journey.spec.ts` (the
// K-2 importer round-trip) and `draw-render.journey.spec.ts` (the
// commands, read back as PIXELS rather than as "the mutation applied").
// The corner and dash sequences are `draw-corners.journey.spec.ts` and
// `draw-dash.journey.spec.ts`.
//
// WHY paged.draw HAS NO FRAME ON THIS PAGE. Every other plugin page in
// this document shows a frame the plugin owns and rehydrates. paged.draw
// has none by design: it writes NATIVE geometry. The SVG importer lowers
// each contour through the same `insertPath` the pen and pencil tools
// commit, so what lands on the page is Polygons with real anchors, real
// fill swatches and real strokes — indistinguishable, in the file, from
// artwork drawn by hand. There is no `x-paged:` envelope to rehydrate
// because there is nothing to rehydrate: the drawing IS the document.
// That is the strongest thing this page has to say, so it says it in
// its caption too.
//
// THE ARTWORK IS AUTHORED IN PAGE POINTS. `assets/showcase-mark.svg`
// carries a US-Letter viewBox and coordinates already inside the base
// fixture's margins, because `insertPathMutationsForShape` passes SVG
// user units straight through as page points — no fit, no scale. The
// shape ORDER in that file is the contract this module addresses by:
// plate, disc, ring, chevron, motif.
//
// THE FOUR COMMANDS, and one honest substitution:
//   · PATHFINDER UNITE  — the overlapping square and disc merge into
//     one silhouette (two Polygons in, one out).
//   · STROKE DASH       — the ring's solid stroke becomes a 6/3 run.
//   · LIVE CORNERS      — on the tint plate, NOT on an imported
//     contour. Probed: `cornersRounded` against an imported Polygon
//     leaves `frameCornerOptionTopLeft` empty, because the live-corner
//     presets write the `frameCornerOption*` / `frameCornerRadius*`
//     properties an IDML RECTANGLE carries and a Polygon does not. So
//     the command drives the shape that can show it, and this comment
//     says why rather than the page quietly showing nothing.
//   · GRID REPEAT       — the small motif becomes a 2 × 6 field. The
//     command takes its parameters as a command PAYLOAD (the registry's
//     `invoke(id, payload)` arm), so the field is sized to this page
//     instead of relying on the bundle's 3 × 3 default.
//
// PAGE PLACEMENT. Bundles resolve their target page as
// `meta.activePage ?? pages[0]`. Building this page is what showed that
// nothing ever answered the first half, so every plugin import landed on
// page one of a sixteen-page document; the editor now folds its own
// active page in and `../active-page.ts` says the whole story. This
// module wraps its two plugin calls in `withActivePage` so the drawing
// lands where the module says it does, whatever the host is currently
// looking at.

import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withActivePage } from "../active-page";
import type { Bounds } from "../driver";
import { SWATCH } from "../names";
import { headingAndCaption, labelFrame } from "../plugin-support";
import type { PageContext, PageReport } from "../types";

/** `assets/showcase-mark.svg` — first-party, AGPL-3.0-only OR PMEL.
 *  Read in NODE and handed to the browser as a string rather than
 *  fetched: the importer takes bytes, and the file's coordinates are
 *  the thing being demonstrated, so it must be the file on disk and not
 *  a copy this module happens to also contain. */
const MARK_SVG = readFileSync(
  pathResolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets",
    "showcase-mark.svg",
  ),
  "utf8",
);
const MARK_NAME = "showcase-mark.svg";
const SVG_IMPORTER = "media.paged.draw.importer.svg";
/** Contours in the file, and therefore Polygons the import mints — one
 *  per shape (none of them is compound). The count is what the poll
 *  below waits FOR: the importer inserts one path at a time, so a poll
 *  that only waited for "more than before" would return after the first
 *  one and address four undefined ids. */
const MARK_CONTOURS = 5;

const CMD = {
  unite: "media.paged.draw.command.pathfinderUnite",
  dash: "media.paged.draw.command.strokeDashDashed",
  corners: "media.paged.draw.command.cornersRounded",
  gridRepeat: "media.paged.draw.command.makeGridRepeat",
} as const;

/** The tint plate the mark sits on — inserted BEFORE the import so the
 *  drawing paints over it (insert order is paint order). Sized around
 *  the artwork's own coordinates: shapes run y 196–488 and the motif
 *  field extends to y 540. */
const PLATE: Bounds = [182, 88, 562, 524];
const FOOTNOTE: Bounds = [578, 72, 700, 540];

const TITLE = "Vector — an SVG, lowered to native paths";

const SUMMARY =
  "One SVG file through the host importer registry. paged.draw lowered " +
  "every contour with the same insertPath the pen tool commits, then four " +
  "of its ninety-two commands edited the result in place.";

const FOOTNOTE_TEXT =
  "The square and the disc were merged by a pathfinder union; the ring's " +
  "stroke carries a dash preset; the plate behind the mark has live rounded " +
  "corners; and the diamond field is one motif repeated on a grid, rebuilt " +
  "as real artwork rather than tracked as a live link. paged.draw is the " +
  "one plugin in this document with nothing to rehydrate on reopen: there " +
  "is no plugin frame here, only anchors, swatches and strokes.";

/** Every Polygon in the document, in paint order. The SVG importer
 *  mints one per contour, so a before/after diff of this list is how
 *  the module learns which paths the import created. */
async function polygons(ctx: PageContext): Promise<string[]> {
  return ctx.page.evaluate(async () => {
    const client = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas.client;
    const reply = await client.executeScript("paged.tree()");
    const tree = JSON.parse(reply.output[0] ?? "[]") as Array<
      Record<string, unknown>
    >;
    const out: string[] = [];
    const visit = (node: Record<string, unknown>) => {
      const id = node.id as { kind?: string; id?: string } | null | undefined;
      if (id && id.kind === "polygon" && typeof id.id === "string") {
        out.push(id.id);
      }
      for (const child of (node.children ?? []) as Array<
        Record<string, unknown>
      >) {
        visit(child);
      }
    };
    for (const root of tree) visit(root);
    return out;
  });
}

/** Route SVG bytes through the host importer registry — the File ▸ Open
 *  / drag-drop path. Returns the importer id that claimed it, or a
 *  stated reason. Shape lifted from `draw-svg.journey.spec.ts`. */
async function importSvg(ctx: PageContext): Promise<string> {
  return ctx.page.evaluate(
    async ({ svg, name }) => {
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
      const importer = importers.resolve(name, "image/svg+xml");
      if (!importer) return "no importer resolved for .svg";
      await importer.import({
        name,
        bytes: new TextEncoder().encode(svg),
        mimeType: "image/svg+xml",
      });
      return importer.id ?? "imported";
    },
    { svg: MARK_SVG, name: MARK_NAME },
  );
}

/** Invoke a command through the real registry, WITH a payload. The
 *  journey helpers all call the one-argument form because none of them
 *  parameterises a command; `CommandRegistry.invoke(id, payload?)` is
 *  the arm the repeat commands document their options against. */
async function invoke(
  ctx: PageContext,
  id: string,
  payload?: unknown,
): Promise<void> {
  await ctx.page.evaluate(
    ({ id, payload }) => {
      const commands = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: {
                invoke: (id: string, payload?: unknown) => Promise<unknown>;
              };
            };
          };
        }
      ).__canvas.registries.commands;
      return commands.invoke(id, payload);
    },
    { id, payload },
  );
}

/** One typed property entry off an element (from
 *  `draw-dash.journey.spec.ts`). */
async function propOf(
  ctx: PageContext,
  ref: { kind: string; id: string },
  path: string,
): Promise<{ type: string; value?: unknown } | null> {
  return ctx.page.evaluate(
    async ({ ref, path }) => {
      const client = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries?: Array<{
                  path: string;
                  value?: { type: string; value?: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas.client;
      const props = await client.elementProperties(ref).catch(() => null);
      for (const entry of props?.entries ?? []) {
        if (entry.path === path) return entry.value ?? null;
      }
      return null;
    },
    { ref, path },
  );
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [];

  const furniture = await headingAndCaption(doc, pageId, TITLE, SUMMARY);

  // ── the tint plate + LIVE CORNERS ───────────────────────────────
  // First, so the imported drawing paints on top of it.
  const plate = await doc.rectangle(pageId, PLATE);
  await doc.setProperty("rectangle", plate, "frameFillColor", {
    type: "colorRef",
    value: await doc.swatch(SWATCH.accentTint),
  });
  await doc.select("rectangle", plate);
  await invoke(ctx, CMD.corners);
  await expect
    .poll(
      async () =>
        (
          await propOf(
            ctx,
            { kind: "rectangle", id: plate },
            "frameCornerOptionTopLeft",
          )
        )?.value ?? "",
      { message: "the live-corner preset baked its IDML corner option" },
    )
    .toBe("RoundedCorner");
  covers.push("plugin-draw.live-corners");

  // ── the import ──────────────────────────────────────────────────
  const before = await polygons(ctx);
  const importer = await withActivePage(ctx.page, pageId, () => importSvg(ctx));
  expect(importer, `the SVG importer claimed ${MARK_NAME}`).toBe(SVG_IMPORTER);
  await expect
    .poll(async () => (await polygons(ctx)).length, {
      message:
        "one Polygon per contour in showcase-mark.svg (square, disc, ring, chevron, motif)",
      timeout: 20_000,
    })
    .toBe(before.length + MARK_CONTOURS);

  const imported = (await polygons(ctx)).filter((id) => !before.includes(id));
  covers.push(
    "plugin-draw.svg-io",
    "plugin-platform.importer-exporter",
    "plugin-platform.bundle-lifecycle",
    "editor-shell.plugin-bundles",
  );

  const [square, disc, ring, , motif] = imported;

  // ── PATHFINDER UNITE — the square and the disc overlap; merge them ──
  await doc.designer.selectElements([
    { kind: "polygon", id: square },
    { kind: "polygon", id: disc },
  ]);
  const beforeUnite = (await polygons(ctx)).length;
  await invoke(ctx, CMD.unite);
  await expect
    .poll(async () => (await polygons(ctx)).length, { timeout: 15_000 })
    .toBeLessThan(beforeUnite);
  covers.push("plugin-draw.pro-path-toolset");

  // ── STROKE DASH — the ring's stroke becomes a 6/3 run ────────────
  await doc.select("polygon", ring);
  await invoke(ctx, CMD.dash);
  await expect
    .poll(
      async () => {
        const value = await propOf(
          ctx,
          { kind: "polygon", id: ring },
          "frameStrokeDashArray",
        );
        return value?.type === "lengths" ? (value.value as number[]) : [];
      },
      { message: "the Dashed preset committed its documented 6/3 run" },
    )
    .toEqual([6, 3]);
  covers.push("plugin-draw.stroke-dash-commands");

  // ── GRID REPEAT — the motif becomes a 2 × 6 field ────────────────
  // `spacing` is the GAP, not the pitch: the bundle computes
  // `stepX = sourceWidth + spacing[0]`. The motif is 36 pt square, so
  // 16 pt of air puts the sixth column's right edge at 408 pt and the
  // second row's bottom at 540 — inside the plate, which matters
  // because the planner DROPS instances that fall off the page.
  await doc.select("polygon", motif);
  const beforeRepeat = (await polygons(ctx)).length;
  await withActivePage(ctx.page, pageId, () =>
    invoke(ctx, CMD.gridRepeat, {
      name: "Showcase motif field",
      rows: 2,
      columns: 6,
      spacing: [16, 16],
      clip: false,
    }),
  );
  await expect
    .poll(async () => (await polygons(ctx)).length, { timeout: 20_000 })
    .toBeGreaterThan(beforeRepeat);
  covers.push("plugin-draw.repeats");

  // The running commentary goes on LAST so it sits above the drawing
  // rather than under it — it is the only frame on this page that has
  // to stay readable whatever the artwork does.
  furniture.push(await labelFrame(doc, pageId, FOOTNOTE, FOOTNOTE_TEXT));

  // Every path on this page now, however it got here: the imported
  // contours minus the two the union consumed, plus the union itself
  // and the repeat's instances.
  const drawn = (await polygons(ctx)).filter((id) => !before.includes(id));

  return {
    title: TITLE,
    covers,
    elements: [...furniture, plate, ...drawn],
    notes,
  };
}
