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

// The kernel contact sheet (p88–p89) — ONE photograph (the picture
// chapter's apples, Tom Swinnen, Pexels) placed ten times, each tile
// given ONE representative kernel from a different family through the
// adjustments panel, then pushed through the chapter's loop: export
// (the bundle's PNG/JPEG exporter, a real browser download off the
// Outputs panel) → replaceImageBytes. What sits in the checkpoint is
// ten corrected JPEGs/PNGs of committed inline bytes — not ten live
// session previews.
//
// Each tile ingests at full resolution and is RESAMPLED to 480×320
// through the panel's Resize row (the T1 lanczos3 kernel) before its
// kernel runs — a contact sheet at contact-sheet resolution, which is
// also what keeps ten committed exhibits from weighing thirty
// megabytes of checkpoint.
//
// Below the tiles, the ROSTER: every kernel id the plugin's dispatch
// registry declares, read from plugin-image/registry/kernels.yaml at
// build time (Node fs) and printed with per-family counts. 128 rows at
// the 2026-08-09 wave; if the number on the page disagrees with this
// comment, believe the page — it read the registry today.
//
// GPU: every kernel here is WGSL with no CPU fallback. On an
// adapterless lane the ten frames still carry the placed photograph
// (original bytes, committed inline) and every caption says the
// correction did not run — stated, never implied.

import type { PageContext, PageReport } from "../../types";
import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  EXPORTER,
  commitBytes,
  exportDownload,
  ingestIntoFrame,
  openAdjustments,
  panelStatus,
  photo,
  readKernelRoster,
  replaceBytesFromFile,
  resampleTo,
  resetAdjustments,
  setSlider,
} from "./00-support";

const APPLES = photo("pexels-574919-apples.jpg");
const APPLES_URI = "assets/photos/pexels-574919-apples.jpg";

/** Tile geometry: the apples' own 3:2 at a 130 pt width. */
const TILE_W = 130;
const TILE_H = 87;

interface TileSpec {
  family: string;
  kernel: string;
  /** What the panel was set to — the caption's middle clause. */
  setting: string;
  exporter: string;
  /** Drive the panel (sliders / gates / effect buttons) for this tile. */
  apply: (ctx: PageContext) => Promise<void>;
}

/** One representative kernel per family, driven through the same
 *  panel a designer uses. Slider values are deliberately loud — a
 *  contact sheet is for telling tiles apart at a glance. */
const TILES: TileSpec[] = [
  {
    family: "exposure",
    kernel: "adjust.exposure",
    setting: "+1.6 EV",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => setSlider(ctx, "Exposure (EV)", 1.6),
  },
  {
    family: "brightness+contrast",
    kernel: "adjust.brightness_contrast",
    setting: "+0.25 ×1.9",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => {
      await setSlider(ctx, "Brightness", 0.25);
      await setSlider(ctx, "Contrast", 1.9);
    },
  },
  {
    family: "saturation",
    kernel: "adjust.saturation",
    setting: "×2.6",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => setSlider(ctx, "Saturation", 2.6),
  },
  {
    family: "hue rotation",
    kernel: "adjust.hue_rotate",
    setting: "+120°",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => setSlider(ctx, "Hue rotate (°)", 120),
  },
  {
    family: "black & white",
    kernel: "adjust.black_white",
    setting: "six-weight mix",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => {
      await ctx.page.locator("[data-image-bw-enable]").check();
    },
  },
  {
    family: "posterize",
    kernel: "adjust.posterize",
    setting: "4 levels",
    exporter: EXPORTER.png,
    apply: async (ctx) => {
      await ctx.page.locator("[data-image-posterize-enable]").check();
      await setSlider(ctx, "Levels", 4);
    },
  },
  {
    family: "gaussian blur",
    kernel: "conv.gaussian_h + conv.gaussian_v",
    setting: "σ 4 px",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => setSlider(ctx, "Blur (σ px)", 4),
  },
  {
    family: "unsharp mask",
    kernel: "conv.unsharp",
    setting: "amount 2.5",
    exporter: EXPORTER.jpeg,
    apply: async (ctx) => setSlider(ctx, "Sharpen", 2.5),
  },
  {
    family: "edge detection",
    kernel: "conv.find_edges",
    setting: "strength 1",
    exporter: EXPORTER.png,
    apply: async (ctx) => {
      await ctx.page.locator("[data-image-find-edges]").click();
      await panelStatus(ctx, 30_000);
    },
  },
  {
    family: "filter gallery",
    kernel: "gallery.halftone",
    setting: "6 px dots at 45 deg",
    exporter: EXPORTER.png,
    apply: async (ctx) => {
      await ctx.page.locator("[data-image-halftone]").click();
      await panelStatus(ctx, 30_000);
    },
  },
];

/** Greedy family split for the roster so neither page's frame
 *  oversets: Code Block is 8.5 pt JetBrains Mono on the 13 pt grid,
 *  ≈ 84 characters to the 432 pt measure. */
function splitRoster(
  paragraphs: string[],
  budgetLines: number,
): { first: string[]; second: string[] } {
  const lines = (s: string): number => Math.max(1, Math.ceil(s.length / 84));
  const first: string[] = [];
  const second: string[] = [];
  let used = 0;
  for (const para of paragraphs) {
    if (used + lines(para) <= budgetLines && second.length === 0) {
      first.push(para);
      used += lines(para);
    } else {
      second.push(para);
    }
  }
  return { first, second };
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pgVerso = ctx.pageIds[0];
  const pgRecto = ctx.pageIds[1];
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [];

  const gpu = await doc.gpuActive();
  if (!gpu) {
    notes.push(
      "no GPU render path — " +
        (await doc.gpuReason()) +
        ". Every contact-sheet kernel is WGSL compute with no CPU " +
        "fallback, so the ten tiles carry the PLACED photograph " +
        "(original inline bytes) and no correction ran.",
    );
  }

  // ── furniture first, so no tile branch can leave the spread bare ──
  const head = await proseFrame(ctx, p(88), [60, 58, 492, 88], [
    { text: "The kernel contact sheet", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(88), [60, 92, 492, 150], [
    {
      text:
        "One photograph, ten tiles, ten kernel families. Every tile was " +
        "ingested through the raster importer, resampled to 480 × 320 " +
        "through the panel's lanczos3 resize, given exactly one family's " +
        "representative kernel, exported through the bundle's own encoder " +
        "and committed back as inline bytes. The apples are Tom Swinnen's " +
        "(Pexels); the differences are the registry's.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const rectoIntro = await proseFrame(ctx, p(89), [48, 92, 480, 150], [
    {
      text:
        "Each caption names the family, the dispatch id from the kernel " +
        "registry, the panel setting, and the byte count of the committed " +
        "export — the number that proves the tile you are looking at is " +
        "document data, not a live preview. Kernels run once, in the " +
        "session; what persists is what came back through the loop.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(rectoIntro.frameId);

  if (gpu) await openAdjustments(ctx);

  // ── the ten tiles ────────────────────────────────────────────────
  const buildTile = async (
    spec: TileSpec,
    tileIndex: number,
    pageIndex: number,
    pageId: string,
    x0: number,
    y0: number,
  ): Promise<void> => {
    const frame = await doc.rectangle(pageId, [x0, y0, x0 + TILE_W, y0 + TILE_H]);
    await assignLayer(ctx, "rectangle", frame, LAYER.content);
    await doc.mutate("placeImage", {
      elementId: frame,
      uri: APPLES_URI,
      fit: null,
    });
    await replaceBytesFromFile(ctx, frame, APPLES);

    let committed: number | null = null;
    if (gpu) {
      // A distinct import name per tile: the Source readout is the
      // decode proof, and the previous tile already printed the file's
      // own name.
      const importName = `apples-${String(tileIndex + 1).padStart(2, "0")}.jpg`;
      const importer = await ingestIntoFrame(
        ctx,
        frame,
        APPLES,
        importName,
        "image/jpeg",
      );
      if (importer === "media.paged.image.importer.raster") {
        await resetAdjustments(ctx);
        if (!(await resampleTo(ctx, 480, 320))) {
          notes.push(
            `tile ${tileIndex + 1} (${spec.kernel}): resample declined — ` +
              `${await panelStatus(ctx)}; committed at source resolution`,
          );
        }
        await spec.apply(ctx);
        const out = await exportDownload(ctx, spec.exporter);
        if ("bytes" in out) {
          committed = await commitBytes(ctx, frame, out.bytes);
        } else {
          notes.push(`tile ${tileIndex + 1} (${spec.kernel}): ${out.reason}`);
        }
      } else {
        notes.push(
          `tile ${tileIndex + 1} (${spec.kernel}): importer answered ` +
            `"${importer}" — no ingest, tile carries the placed original`,
        );
      }
    }

    // One clause per PARAGRAPH, not one flowing line: the engine's
    // line breaker composed two of ten flowing captions as a
    // character-wrapped sliver (deterministically, and independent of
    // the text — the frames and stories verify correct in the
    // container). Short explicit paragraphs give it nothing to break
    // pathologically.
    const captionParas =
      committed !== null
        ? [
            { text: `${spec.family} · ${spec.kernel}`, style: STYLE.specLabel },
            { text: spec.setting, style: STYLE.specLabel },
            {
              text: `${committed.toLocaleString("en-US")} B committed`,
              style: STYLE.specLabel,
            },
          ]
        : [
            { text: `${spec.family} · ${spec.kernel}`, style: STYLE.specLabel },
            {
              text: "not corrected on this lane (no GPU) — placed original",
              style: STYLE.specLabel,
            },
          ];
    // EVERY caption is nudged 2 pt off the tile grid: the engine's
    // line breaker has a position-keyed seam — at certain exact rects
    // (first found at [211, 248, 341, 305], later the halftone tile's
    // slot on the recto) ANY content composes as a character-wrapped
    // sliver, deterministically, while the identical rect a row down
    // composes fine; the stored frame and story are correct in the
    // container. The uniform nudge dodges the whole class instead of
    // whichever instances a given run reveals. → Appendix A.
    const xNudge = -2;
    const caption = await proseFrame(
      ctx,
      pageIndex,
      [x0 + xNudge, y0 + TILE_H + 3, x0 + xNudge + TILE_W, y0 + TILE_H + 57],
      captionParas,
    );
    elements.push(frame, caption.frameId);
  };

  // p88 — six tiles on a 3 × 2 grid (x 60 / 211 / 362, y 158 / 304).
  // p89 — four: three across the top row, one anchoring the second.
  const slots: Array<{ pageIndex: number; pageId: string; x: number; y: number }> =
    [
      { pageIndex: p(88), pageId: pgVerso, x: 60, y: 158 },
      { pageIndex: p(88), pageId: pgVerso, x: 211, y: 158 },
      { pageIndex: p(88), pageId: pgVerso, x: 362, y: 158 },
      { pageIndex: p(88), pageId: pgVerso, x: 60, y: 304 },
      { pageIndex: p(88), pageId: pgVerso, x: 211, y: 304 },
      { pageIndex: p(88), pageId: pgVerso, x: 362, y: 304 },
      { pageIndex: p(89), pageId: pgRecto, x: 48, y: 158 },
      { pageIndex: p(89), pageId: pgRecto, x: 199, y: 158 },
      { pageIndex: p(89), pageId: pgRecto, x: 350, y: 158 },
      { pageIndex: p(89), pageId: pgRecto, x: 48, y: 304 },
    ];
  for (const [i, spec] of TILES.entries()) {
    const slot = slots[i];
    await buildTile(spec, i, slot.pageIndex, slot.pageId, slot.x, slot.y);
  }

  // The slot beside the last tile explains the sheet's one asymmetry.
  const asymmetry = await proseFrame(ctx, p(89), [199, 304, 480, 434], [
    {
      text:
        "Eight tiles are parameter kernels — the slider writes a value, " +
        "the export runs the chain, nothing touches the session source " +
        "until the loop commits. The edge-detection and halftone tiles " +
        "are effect kernels: their buttons apply destructively into the " +
        "engine-held source, journaled in the plugin's own undo. Both " +
        "kinds leave the document untouched until replaceImageBytes — " +
        "which is why the loop, not the kernel, is this chapter's law.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(asymmetry.frameId);

  if (gpu) {
    notes.push(
      "each tile's committed bytes are the exporter's own output, " +
        "unretouched — whatever a kernel currently does to these pixels " +
        "is what the page shows",
      "finding, from proofing this spread: the engine's line breaker " +
        "composes certain caption rects as a character-wrapped sliver " +
        "regardless of content (frame and story verify correct in the " +
        "container; the p47 probe shows the same seam) — tile 2's " +
        "caption is position-nudged 2 pt to dodge it",
      "finding, from proofing this spread: on the builds this chapter " +
        "was authored against, the gaussian-blur tile's export showed a " +
        "corrupted band over its right 256-px tile column (the windowed " +
        "kernel's halo seam is the suspect); the tile is committed " +
        "exactly as exported — check the tile, not this note",
    );
    covers.push(
      "image.editor.adjust-breadth",
      "image.editor.filters",
      "image.editor.resample",
      "image.kernel.breadth-2026-08",
      "plugin-platform.importer-exporter",
      "editor-shell.plugin-bundles",
    );
  }

  // ── the roster ───────────────────────────────────────────────────
  const roster = readKernelRoster();
  if (roster) {
    const order = [
      "adjust",
      "conv",
      "compose",
      "math",
      "band",
      "bool",
      "cast",
      "rel",
      "geom",
      "gen",
      "gallery",
      "morph",
      "rank",
      "resample",
    ];
    const families = [...roster.families.keys()].sort(
      (a, b) =>
        (order.indexOf(a) + 100 * Number(order.indexOf(a) < 0)) -
        (order.indexOf(b) + 100 * Number(order.indexOf(b) < 0)),
    );
    const paragraphs = families.map((fam) => {
      const names = roster.families.get(fam) ?? [];
      return `${fam} (${names.length})  ${names.join(" ")}`;
    });
    const { first, second } = splitRoster(paragraphs, 12);
    const title88 = await proseFrame(ctx, p(88), [60, 444, 492, 470], [
      {
        text:
          `THE ROSTER — every registered kernel, ${roster.total} ids in ` +
          `${families.length} families, read from registry/kernels.yaml ` +
          "at build time",
        style: STYLE.specLabel,
      },
    ]);
    const roster88 = await proseFrame(
      ctx,
      p(88),
      [60, 474, 492, 637],
      first.map((text) => ({ text, style: STYLE.codeBlock })),
    );
    elements.push(title88.frameId, roster88.frameId);
    if (second.length > 0) {
      const roster89 = await proseFrame(
        ctx,
        p(89),
        [48, 452, 480, 637],
        second.map((text) => ({ text, style: STYLE.codeBlock })),
      );
      elements.push(roster89.frameId);
    }
    notes.push(
      `kernel roster: ${roster.total} ids across ${families.length} ` +
        "families, read from plugin-image/registry/kernels.yaml",
    );
  } else {
    notes.push(
      "plugin-image/registry/kernels.yaml not readable from this checkout " +
        "— the roster block was omitted rather than hand-typed",
    );
  }

  await marginNote(
    ctx,
    p(88),
    "A kernel run is session state. Each tile here persists only because " +
      "its adjusted pixels were exported and committed back as inline " +
      "bytes; reopening the file re-reads those bytes, not the kernels. " +
      "→ Appendix A",
  );

  elements.push(
    await specLabel(ctx, p(88), [
      "Specimen No. 131",
      "ten kernels via the adjustments panel",
      "export → replaceImageBytes per tile",
    ]),
    await specLabel(ctx, p(89), [
      "Specimen No. 132",
      "the 128-kernel roster, from the dispatch registry",
      "counts printed per family",
    ]),
  );

  return {
    title: "The kernel contact sheet",
    covers,
    elements,
    notes,
  };
}
