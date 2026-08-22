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

// Page 5 — RASTER: one photograph, placed twice, corrected once.
//
// RECIPE FROM: `tests/journey/plugins/image.journey.spec.ts` (the
// bundle's host-integration loop — `adjustSelected`, the adjustments
// panel, `claimTiles`) and `image-adjust.journey.spec.ts` /
// `image-curves.journey.spec.ts` (the REAL path: a genuine encoded
// image through the K-2 importer → decode → panel → Apply). What this
// page adds is a file that exists on disk instead of a PNG synthesized
// in the page context, and two frames side by side so the correction is
// visible rather than merely asserted.
//
// THE TWO FRAMES.
//
//   LEFT  — the photograph as the ENGINE places it. `placeImage` writes
//           the frame's link and its `FittingOnEmptyFrame`, and the
//           pixels arrive through the C-6 resource channel
//           (`claimImageResource` + `submitResourceTiles`) as level-0
//           tiles. No plugin: this is what a placed graphic is in a
//           `.idml`.
//   RIGHT — the same file, corrected. It goes through the host importer
//           registry to `media.paged.image.importer.raster`, which
//           decodes it into the paged.image session; the adjustments
//           panel reads a histogram off those pixels; Auto-enhance
//           derives a percentile auto-levels and a gray-world white
//           balance from that histogram; Apply commits them through the
//           WGSL kernels; and `claimTiles` hands the corrected image
//           back to the renderer through the plugin's own tile provider.
//
// TWO DOORS, ONE OUTCOME — and why the assertion is on the outcome.
// Apply's documented output is a C-1 Stage-A SCENE LAYER composited
// in-frame; `claimTiles` is the C-6 tile-provider door, which re-claims
// the frame's image resource and serves the ADJUSTED image. On a frame
// that already carries a PLACED IMAGE LINK — which is what this page
// builds — the two doors compete, and WHICH ONE lands the corrected
// pixels is not stable across engine versions. This page has measured
// it both ways:
//
//   · an earlier probe recorded Apply = 0 px (the placed image painting
//     over the scene layer) and the following `claimTiles` = 78,499 px;
//   · on the current engine, on the real-adapter showcase lane, it is
//     the other way round — Apply changes the page and the `claimTiles`
//     that follows is a measured no-op on top of it.
//
// Asserting either door individually therefore encodes an engine
// version, not a product promise. What IS the promise is that the
// corrected pixels end up on the page, so the hard assertion spans the
// whole commit (Apply → claimTiles) and the notes record which door
// delivered it on this run. That attribution is the interesting part
// and it is measured every time rather than remembered.
//
// (The earlier reading was taken when the showcase lane had NO GPU at
// all — its `load()` reached the worker directly, so the shell's
// document handle stayed null, the viewport never mounted and `initGpu`
// never ran. Apply is GPU-only, so on that lane it could not have
// rendered anything. See `ShowcaseDoc.load`.)
//
// GPU, STATED PLAINLY. paged.image's adjustment kernels are WGSL
// compute with NO CPU fallback. `ctx.doc.gpuActive()` decides whether
// Apply runs; with no adapter this page still places both photographs
// and still ingests and analyses the right-hand one — only the
// correction is skipped, and the note says so. It is never claimed to
// have run. (Probed on the bundled-Chromium lane: the importer decodes,
// the Source readout fills in, the histogram renders, and the Apply
// button is even ENABLED — which is exactly why the gate is
// `gpuActive` and not "does the button look clickable".)
//
// WHAT THIS PAGE DOES NOT CLAIM. The registry marks
// `image.editor.ingest`, `image.editor.curves`,
// `image.reduce.statistics` and `image.editor.tile-provider` PARTIAL,
// not shipped. The page drives all four; it claims none of them,
// because the coverage gate refuses a row the project itself has not
// declared shipped and that gate is worth more than four extra lines
// in a manifest.
//
// WHAT DOES NOT SURVIVE THE FILE. The correction lives in the plugin's
// session and in the tiles it serves; the placed link and the fitting
// are document state. Reopening `showcase.paged` gives back two frames
// with the same link and no correction until the plugin re-ingests.
// The page says this in its own caption.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Bounds } from "../driver";
import {
  CONTENT_TOP_PT,
  headingAndCaption,
  labelFrame,
} from "../plugin-support";
import type { PageContext, PageReport } from "../types";

/** `tests/showcase/assets/showcase-cat.jpg` — MIT OR Apache-2.0, see
 *  `assets/README.md`. Reaches the browser through vite's `/@fs` door,
 *  the same one `ShowcaseDoc.load` uses for the base fixture. */
const PHOTO = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "showcase-cat.jpg",
);
const PHOTO_URL = `/@fs${PHOTO}`;
const PHOTO_NAME = "showcase-cat.jpg";
const PHOTO_MIME = "image/jpeg";

const RASTER_IMPORTER = "media.paged.image.importer.raster";
const ADJUSTMENTS_PANEL = "media.paged.image.panel.adjustments";
const CMD_ADJUST = "media.paged.image.command.adjustSelected";
const CMD_CLAIM_TILES = "media.paged.image.command.claimTiles";

const PLACED: Bounds = [CONTENT_TOP_PT + 14, 72, CONTENT_TOP_PT + 254, 300];
const EDITED: Bounds = [CONTENT_TOP_PT + 14, 312, CONTENT_TOP_PT + 254, 540];
const LABEL_LEFT: Bounds = [444, 72, 570, 300];
const LABEL_RIGHT: Bounds = [444, 312, 570, 540];
const FOOTNOTE: Bounds = [590, 72, 700, 540];

const TITLE = "Raster — a photograph, placed and corrected";

const SUMMARY =
  "One 320 × 240 progressive JPEG, placed twice. The left frame is the " +
  "engine's own placed graphic; the right one went through paged.image, " +
  "which decoded it, read a histogram off the pixels and corrected it.";

const LEFT_LABEL =
  "Placed. A link, a FillProportionally fitting and level-0 tiles through " +
  "the resource channel — what a placed graphic is in an IDML package, " +
  "with no plugin involved.";

const RIGHT_LABEL =
  "Corrected. The same file through the raster importer, then Auto-enhance: " +
  "a percentile auto-levels black and white point and a gray-world white " +
  "balance, both derived in Rust from this image's own histogram. These " +
  "pixels come from the plugin's tile provider, which fits the image to the " +
  "frame proportionally rather than by the frame's crops — which is why the " +
  "two frames, given identical fittings, are framed differently.";

const FOOTNOTE_TEXT =
  "The correction lives in the plugin's session and in the tiles it serves " +
  "the renderer; the link and the fitting live in the document. Reopening " +
  "the file gives back both frames and their links, and the correction " +
  "returns when paged.image re-ingests. Photograph: the image-rs decoder " +
  "test suite, MIT OR Apache-2.0, recorded in the assets README.";

/**
 * Decode the real file in the page and serve it into `frameId` through
 * the C-6 resource channel as ONE level-0 tile.
 *
 * `createImageBitmap` is the browser's own codec, so the bytes reaching
 * the renderer are a genuine decode of a genuine progressive JPEG
 * rather than a synthesized pattern. A single-tile pyramid (`levels: 1`,
 * `tileSize` = the longer edge) keeps the mip pick deterministic — the
 * `serveTiledImage` shape from the journey driver, with real pixels in
 * place of its four quadrants.
 */
async function serveTiles(
  ctx: PageContext,
  frameId: string,
): Promise<{ width: number; height: number }> {
  return ctx.page.evaluate(
    async ({ frameId, url }) => {
      const client = (
        globalThis as unknown as {
          __canvas: {
            client: {
              claimImageResource: (claim: {
                imageId: string;
                levels: number;
                tileSize: number;
                baseWidth: number;
                baseHeight: number;
                revision: number;
              }) => Promise<void>;
              submitResourceTiles: (
                imageId: string,
                level: number,
                tiles: unknown[],
                generation: number,
              ) => Promise<void>;
            };
          };
        }
      ).__canvas.client;
      const imageId = `x-paged-image:${frameId}`;
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx2d = surface.getContext("2d");
      if (!ctx2d) throw new Error("no 2d context to decode the photograph");
      ctx2d.drawImage(bitmap, 0, 0);
      const pixels = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height);
      await client.claimImageResource({
        imageId,
        levels: 1,
        tileSize: Math.max(bitmap.width, bitmap.height),
        baseWidth: bitmap.width,
        baseHeight: bitmap.height,
        revision: 1,
      });
      await client.submitResourceTiles(
        imageId,
        0,
        [
          {
            x: 0,
            y: 0,
            width: bitmap.width,
            height: bitmap.height,
            rgba: Array.from(pixels.data),
          },
        ],
        1,
      );
      return { width: bitmap.width, height: bitmap.height };
    },
    { frameId, url: PHOTO_URL },
  );
}

/**
 * Route the file through the HOST importer registry — the door File ▸
 * Open and a drag-drop both travel down. Resolves to the importer id
 * that claimed it, or a stated reason. Shape lifted from
 * `draw-svg.journey.spec.ts`'s `importSvg`, with real bytes fetched
 * rather than a string encoded in the spec.
 */
async function importThroughRegistry(ctx: PageContext): Promise<string> {
  return ctx.page.evaluate(
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
    { url: PHOTO_URL, name: PHOTO_NAME, mimeType: PHOTO_MIME },
  );
}

/** The adjustments panel's "Source" readout — `name W×H` once the
 *  engine has decoded. The proof the REAL file reached the plugin's
 *  session (from `image-adjust.journey.spec.ts`). */
async function sourceReadout(ctx: PageContext): Promise<string> {
  return ctx.page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "no Source row";
  });
}

/**
 * The one line every paged.image door writes its outcome to — a result,
 * or a stated reason there is none.
 *
 * It is polled until it stops ending in an ellipsis, because the panel
 * writes "Adjusting…" the instant Apply is pressed and only replaces it
 * when the kernels return. Reading it once caught the IN-PROGRESS
 * message and reported that as the outcome.
 */
async function panelStatus(ctx: PageContext, settleMs = 0): Promise<string> {
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
 * Did the page's pixels move within `ms`? A non-throwing sibling of
 * `ShowcaseDoc.expectRenderChanged`, for ATTRIBUTION rather than
 * gating: this page needs to say which of two doors landed the
 * correction, and "no" is a legitimate answer for one of them. Polls
 * for the same reason the assertion does — a single cold sample of a
 * fresh render flakes (see the journey render-flake note).
 */
async function changedWithin(
  doc: PageContext["doc"],
  pageIndex: number,
  before: Buffer,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (!(await doc.renderPage(pageIndex)).equals(before)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Give a placed frame its IDML fitting. The TYPE is the attribute and
 * the CROPS are the signed-from-the-edge numbers beside it;
 * `PropertyPath::FrameFittingType` says in its own comment that the
 * renderer does not branch on the enum, so writing only the enum would
 * advertise a fitting the page cannot show. `overhang` is what a
 * proportional FILL implies — half the width the image hangs over each
 * side of the frame, which IDML spells as a NEGATIVE crop.
 */
async function fitToFrame(
  ctx: PageContext,
  frameId: string,
  overhang: number,
): Promise<void> {
  await ctx.doc.setProperty("rectangle", frameId, "frameFittingType", {
    type: "text",
    value: "FillProportionally",
  });
  await ctx.doc.setProperty("rectangle", frameId, "frameFittingCrops", {
    type: "bounds",
    value: [0, overhang, 0, overhang],
  });
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pageId = ctx.pageIds[0];
  const pageIndex = ctx.pageIndexes[0];
  const notes: string[] = [];
  const covers: string[] = [];

  // ── furniture, first, so no later branch can leave the page bare ──
  const furniture = await headingAndCaption(doc, pageId, TITLE, SUMMARY);
  furniture.push(await labelFrame(doc, pageId, LABEL_LEFT, LEFT_LABEL));
  furniture.push(await labelFrame(doc, pageId, LABEL_RIGHT, RIGHT_LABEL));
  furniture.push(await labelFrame(doc, pageId, FOOTNOTE, FOOTNOTE_TEXT));

  // ── LEFT: the engine's placed image ─────────────────────────────
  // `placeImage` is Rectangle-only (IDML nests <FrameFittingOption>
  // only there), which is why both frames come from `insertFrame`.
  const placed = await doc.rectangle(pageId, PLACED);
  await doc.mutate("placeImage", {
    elementId: placed,
    uri: `x-paged-image:${placed}`,
    fit: "FillProportionally",
  });
  const size = await serveTiles(ctx, placed);
  expect(
    size.width * size.height,
    "the photograph decoded to real pixels",
  ).toBeGreaterThan(0);
  covers.push("images-graphics.placed-images");

  // A proportional FILL of a 320 × 240 photograph in a 228 × 240 frame
  // hangs (320 − 228) / 2 = 46 pt over each side. Both frames get the
  // same fitting, so the pair on the page differs only by the
  // correction (see `fitToFrame`).
  const overhang = -(size.width - (PLACED[3] - PLACED[1])) / 2;
  await fitToFrame(ctx, placed, overhang);
  covers.push("images-graphics.frame-fitting");

  // ── RIGHT: the same file, through paged.image ───────────────────
  const edited = await doc.rectangle(pageId, EDITED);
  await doc.mutate("placeImage", {
    elementId: edited,
    uri: `x-paged-image:${edited}`,
    fit: "FillProportionally",
  });
  // The SAME fitting as the left frame, so the pair differs only by the
  // correction. Without it the plugin's tile provider letterboxes the
  // 4:3 photograph inside a 228 × 240 frame and the comparison reads as
  // a difference in cropping instead.
  await fitToFrame(ctx, edited, overhang);
  // Serve the ORIGINAL first, so this frame carries the photograph on
  // every lane and the correction below is a visible CHANGE rather than
  // a frame that fills in from nothing.
  await serveTiles(ctx, edited);
  await doc.select("rectangle", edited);

  // The selection-driven command: raise the panel and ingest the
  // selected frame's placed bytes (C-5). The showcase serves this
  // frame's pixels through the TILE channel rather than as inline
  // bytes, so that ingest has nothing to read and says so. The command
  // is driven because it is the door a designer reaches for, and its
  // own answer is reported rather than hidden.
  await doc.runCommand(CMD_ADJUST);
  await doc.designer.openPanel(ADJUSTMENTS_PANEL);
  notes.push(`adjustSelected → ${await panelStatus(ctx)}`);

  // The REAL ingest: the file's own bytes through the host importer
  // registry — the lane `image-adjust.journey` proves.
  const importer = await importThroughRegistry(ctx);
  if (importer !== RASTER_IMPORTER) {
    notes.push(
      `the raster importer did not claim ${PHOTO_NAME} — got "${importer}", ` +
        "so no correction ran; the right-hand frame carries the placed " +
        "photograph unmodified",
    );
    return {
      title: TITLE,
      covers,
      elements: [...furniture, placed, edited],
      notes,
    };
  }
  covers.push(
    "plugin-platform.importer-exporter",
    "editor-shell.plugin-bundles",
    "plugin-platform.bundle-lifecycle",
  );

  // The Source readout is the engine answering "I decoded this file".
  await expect
    .poll(() => sourceReadout(ctx), { timeout: 20_000 })
    .toEqual(expect.stringContaining(PHOTO_NAME));

  // AUTO-ENHANCE — a percentile auto-levels black/white point plus a
  // gray-world white balance, both derived in Rust from the panel's own
  // histogram of the decoded pixels. It fills the Levels and
  // White-balance sliders; like every edit in this panel it stays a
  // PREVIEW until Apply.
  const autoEnhance = page.locator("[data-image-auto-enhance]");
  await expect(
    autoEnhance,
    "Auto-enhance is enabled once the histogram exists",
  ).toBeEnabled({ timeout: 20_000 });
  await autoEnhance.click();
  covers.push("image.editor.auto-enhance");

  // …and one adjustment driven by hand, so the page exercises the
  // slider lane too. Anchored on its LABEL rather than taken by index:
  // several panels are open at once in a sixteen-page build, and
  // `input[type=range]` first-match would be whichever one the dock
  // happened to mount first.
  const exposure = page
    .locator('label:text-is("Exposure (EV)")')
    .locator("xpath=following-sibling::span")
    .locator("input[type=range]")
    .first();
  if ((await exposure.count()) > 0) {
    await exposure.focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
  } else {
    notes.push(
      "the Exposure slider was not on the panel, so Auto-enhance alone " +
        "supplied the correction",
    );
  }

  // APPLY — the kernels commit. GPU-only, so this is gated on a real
  // adapter. `beforeCommit` is the page as it stands with the photograph
  // placed but uncorrected; it is the baseline the hard assertion below
  // (after `claimTiles`) is made against, because the correction may
  // land through either door — see the header.
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  const gpu = await doc.gpuActive();
  let beforeCommit: Buffer | null = null;
  let applyRendered = false;
  if (gpu) {
    await expect(apply).toBeEnabled({ timeout: 20_000 });
    beforeCommit = await doc.renderPage(pageIndex);
    await apply.click();
    notes.push(`Apply → ${await panelStatus(ctx, 20_000)}`);
    // Attribution, not a gate: did Apply's own scene layer reach the
    // page, or is the tile claim below the door that lands it? Polled,
    // because a single cold sample of a fresh render flakes.
    applyRendered = await changedWithin(doc, pageIndex, beforeCommit, 8_000);
    covers.push("image.editor.adjust-breadth");
  } else {
    notes.push(
      "no GPU render path — " +
        (await doc.gpuReason()) +
        ". paged.image's adjustment kernels are WGSL compute with no CPU " +
        "fallback, so Auto-enhance's correction was computed from the real " +
        "histogram and shown in the panel but NOT committed. The right-hand " +
        "frame shows the decoded photograph, uncorrected.",
    );
  }

  // CLAIM TILES — the C-6 provider door on the PLUGIN side: paged.image
  // serves the ingested image's level-0 tiles for the frame it was
  // ingested into, carrying whatever Apply committed.
  const beforeClaim = await doc.renderPage(pageIndex);
  await doc.runCommand(CMD_CLAIM_TILES);
  const claimStatus = await panelStatus(ctx, 20_000);
  if (claimStatus.startsWith("Claimed tile resource")) {
    covers.push("plugin-platform.image-resource");
    notes.push(
      "paged.image's tile provider does not honour the frame's " +
        "`frameFittingCrops`: both frames on this page carry the SAME " +
        "placeImage fit and the same crops, and the host-served left frame " +
        "fills its 228 × 240 box while the plugin-served right frame " +
        "letterboxes the 4:3 photograph inside it.",
    );
    if (gpu && beforeCommit) {
      const claimRendered = await changedWithin(
        doc,
        pageIndex,
        beforeClaim,
        8_000,
      );
      notes.push(
        applyRendered && claimRendered
          ? "both doors moved this page's pixels: Apply's C-1 Stage-A scene " +
              "layer AND the claimTiles tile provider on top of it"
          : applyRendered
            ? "the correction reached the page through Apply's C-1 Stage-A " +
              "scene layer; the claimTiles that followed was a measured " +
              "no-op on this linked frame"
            : claimRendered
              ? "the correction reached the page through the claimTiles tile " +
                "provider; Apply's own scene layer was a measured no-op on " +
                "this linked frame"
              : "NEITHER Apply nor claimTiles moved this page's pixels — the " +
                "assertion below turns that into a failure rather than a note",
      );
      // The whole point of the page: the corrected pixels are ON it. The
      // baseline is the uncorrected placed photograph, so this holds
      // whichever of the two doors above delivered them.
      await doc.expectRenderChanged(pageIndex, beforeCommit);
    }
  } else {
    notes.push(`claimTiles → ${claimStatus}`);
  }

  return {
    title: TITLE,
    covers,
    elements: [...furniture, placed, edited],
    notes,
  };
}
