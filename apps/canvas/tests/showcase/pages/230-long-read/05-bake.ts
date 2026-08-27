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

// The bake (p107–p108) — the chapter's closing argument, staged as a
// comparison across the two pages this module owns:
//
//   · p107 (recto) — the BAKED lane. The article's frame, flattened by
//     `bakeWebFrame` into REAL swatches, rectangles, paths and text
//     frames. Native content: it exports to IDML and PDF and survives
//     every reload with no plugin engine anywhere in the pipeline.
//   · p108 (verso) — the LIVE lane. The same source authored through
//     the source PANEL (make-web-frame → editors → "Save to document",
//     which persists the envelope AND its container part) and rendered
//     by the engine into a C-1 scene layer. Alive, editable — and gone
//     the moment this chapter's checkpoint reloads.
//
// WHY THE BAKE SITS ON THE RECTO, recorded rather than hidden: the
// bake materializes native items at the source frame's geometry as the
// geometry door reports it, and on a facing VERSO that answer is
// spread-space — the first two passes of this chapter baked thirty
// perfect items onto the PASTEBOARD left of the page (geometry
// answered no page for every one). On a recto, spread and page agree.
// The margin note keeps that finding on the page.
//
// The counts the bake reports are printed EXACTLY as reported,
// deferred kinds included — the honest v0: text at the document
// default face, solid rects, single-subpath paths; gradients, images,
// multi-subpath fills and strokes are counted and said, never faked.
// And the ledger's registry row for the bake is NOT claimed:
// `plugin-web.bake-to-native` is recorded partial by the project's own
// registry, so this page demonstrates and annotates instead of
// advertising. That restraint, plus the live-versus-baked asymmetry,
// IS the lesson of the spread.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../../fidelity/canvas-driver";
import { assignLayer, marginNote, proseFrame, specLabel, type Para } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import {
  ConsoleTap,
  newRefs,
  pagesOf,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
  type Ref,
} from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  WEB_CMD,
  WEB_PANEL,
  WEB_PARTS_PREFIX,
  hairline,
  listParts,
  readReport,
  setWebSource,
  splitHtmlAsset,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTICLE = pathResolve(__dirname, "..", "..", "assets", "web", "long-read.html");

/** The two equivalent frames, page-space (x0, y0, x1, y1). */
const BAKE_FRAME: [number, number, number, number] = [48, 186, 300, 560];
const LIVE_FRAME: [number, number, number, number] = [60, 186, 312, 560];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg107 = ctx.pageIds[0];
  const pg108 = ctx.pageIds[1];
  const notes: string[] = [];
  const covers: string[] = ["plugin-platform.document-metadata"];
  const elements: string[] = [];

  const source = splitHtmlAsset(ARTICLE);
  const tap = new ConsoleTap(page, /(render|bake)WebFrame:|\[web\]/i);
  let liveRendered = false;
  let baked = { rects: 0, texts: 0, paths: 0 };
  let bakeReadout = "";

  try {
    // ── p107: the BAKED lane (recto — where spread and page agree) ──
    const head107 = await proseFrame(ctx, p(107), [48, 96, 480, 124], [
      { text: "The baked lane", style: STYLE.head1 },
    ]);
    elements.push(head107.frameId);

    const bakeHost = await doc.rectangle(pg107, BAKE_FRAME);
    await hairline(doc, "rectangle", bakeHost, SWATCH.slate);
    await assignLayer(ctx, "rectangle", bakeHost, LAYER.content);
    await setWebSource(doc, bakeHost, source);
    elements.push(bakeHost);

    const rectsBefore = await sceneRefs(page, "rectangle");
    const textsBefore = await sceneRefs(page, "textFrame");
    const pathsBefore = await sceneRefs(page, "polygon");
    const swatchesBefore = (await doc.designer.collection("swatches")) as Array<{
      selfId: string;
    }>;

    await doc.select("rectangle", bakeHost);
    // The command reads the React selection mirror — give the state a
    // beat to propagate before invoking on it.
    await page.waitForTimeout(300);
    try {
      await doc.runCommand(`${WEB_CMD}.bakeWebFrame`);
    } catch (err) {
      notes.push(
        "bakeWebFrame died in the plugin lane: " +
          String(err).split("\n")[0].slice(0, 140),
      );
    }
    await settle(page, () => tap.saw(/bakeWebFrame:/i), 30_000);

    // Freshly minted items can answer `pageId: null` until the page
    // recomposes — and a null partitioned as "elsewhere" would DELETE
    // the just-baked content (an earlier pass of this chapter did
    // exactly that). Compose, POLL until the ids resolve, remove only
    // items that RESOLVE to a different page, and keep + note the ones
    // the door never places.
    const pageIndexOf = new Map<string, number>();
    for (const info of await doc.refreshPages()) {
      pageIndexOf.set(info.selfId, info.index);
    }
    const keep = async (kind: string, before: Ref[]): Promise<Ref[]> => {
      const fresh = await newRefs(page, kind, before);
      if (fresh.length === 0) return [];
      await doc.renderPage(p(107));
      await settle(
        page,
        async () => {
          const where = await pagesOf(page, fresh);
          return fresh.every((r) => where.get(`${r.kind}:${r.id}`) != null);
        },
        10_000,
      );
      const split = await partitionByPage(page, fresh, pg107);
      if (split.elsewhere.length === 0) return split.here;
      const where = await pagesOf(page, split.elsewhere);
      const strays = split.elsewhere.filter(
        (r) => where.get(`${r.kind}:${r.id}`) != null,
      );
      const unresolved = split.elsewhere.filter(
        (r) => where.get(`${r.kind}:${r.id}`) == null,
      );
      if (strays.length > 0) {
        const spots = [
          ...new Set(
            strays.map((r) => {
              const pid = where.get(`${r.kind}:${r.id}`);
              const idx = pid ? pageIndexOf.get(pid) : undefined;
              return idx !== undefined ? `p${idx + 1}` : String(pid);
            }),
          ),
        ].join(", ");
        await removeRefs(doc, strays).catch(() => undefined);
        notes.push(`the bake put ${strays.length} ${kind}(s) on ${spots}; removed`);
      }
      if (unresolved.length > 0) {
        notes.push(
          `geometry answers NO page for ${unresolved.length} baked ${kind}(s) ` +
            "— kept; whether they paint is the visual record's call",
        );
      }
      return [...split.here, ...unresolved];
    };
    const bakedRects = await keep("rectangle", rectsBefore);
    const bakedTexts = await keep("textFrame", textsBefore);
    const bakedPaths = await keep("polygon", pathsBefore);
    baked = {
      rects: bakedRects.length,
      texts: bakedTexts.length,
      paths: bakedPaths.length,
    };
    elements.push(
      ...bakedRects.map((r) => r.id),
      ...bakedTexts.map((r) => r.id),
      ...bakedPaths.map((r) => r.id),
    );

    const swatchesAfter = (await doc.designer.collection("swatches")) as Array<{
      selfId: string;
    }>;
    const mintedSwatches = swatchesAfter.filter(
      (s) => !swatchesBefore.some((b) => b.selfId === s.selfId),
    );

    bakeReadout = await readReport(page, "bake");
    if (bakeReadout) covers.push("plugin-web.render-readout");

    const totalBaked = baked.rects + baked.texts + baked.paths;
    if (totalBaked === 0) {
      notes.push(
        "bakeWebFrame produced no native items on p107 — the spread has " +
          "no baked lane on this run",
      );
    } else {
      notes.push(
        `the bake materialized ${totalBaked} native item(s): ${baked.rects} ` +
          `rectangle(s), ${baked.texts} text frame(s), ${baked.paths} path(s), ` +
          `plus ${mintedSwatches.length} minted swatch(es)`,
      );
    }

    // The receipt block: the counts as REPORTED, deferred kinds
    // included; the readout split on its own separators so the narrow
    // column does not wrap a mono line one word deep.
    const readoutLines = bakeReadout
      ? bakeReadout
          .split(" · ")
          .slice(0, 5)
          .map((s, i) => (i === 0 ? `  readout: ${s.slice(0, 26)}` : `  ${s.slice(0, 26)}`))
      : ["  readout: (none published)"];
    const receipts: Para[] = [
      "bakeWebFrame — this run's receipt:",
      `  native rectangles   ${baked.rects}`,
      `  native text frames  ${baked.texts}`,
      `  native paths        ${baked.paths}`,
      `  minted swatches     ${mintedSwatches.length} (Color/wb-…)`,
      ...readoutLines,
    ].map((text) => ({ text, style: STYLE.codeBlock }));
    const block = await proseFrame(ctx, p(107), [312, 186, 480, 400], receipts);
    elements.push(block.frameId);

    const cap107 = await proseFrame(ctx, p(107), [312, 412, 480, 560], [
      {
        text:
          "Everything the bake could not lower honestly it counted and " +
          "reported instead — the deferred kinds above are the plugin " +
          "keeping its books straight. What it did lower is ordinary page " +
          "content now: these rectangles and text frames export to IDML " +
          "and PDF like anything else in this annual, engine or no engine.",
        style: STYLE.bodySmall,
      },
    ]);
    elements.push(cap107.frameId);

    // The container's answer: which web parts travel with the file.
    const parts = await listParts(page, WEB_PARTS_PREFIX);
    expect(
      parts.length,
      "the container carries paged/media.paged.web/* source parts",
    ).toBeGreaterThan(0);
    covers.push("package-anatomy.paged-parts-door");
    notes.push(
      `listPagedParts ${WEB_PARTS_PREFIX} — ${parts.length} part(s): ` +
        parts.map((path) => path.replace(WEB_PARTS_PREFIX, "")).join(", "),
    );
    // Below the bake's own spill: the pull-quote path the bake minted
    // reaches ~590 pt, so the apparatus line clears it at 600.
    const partsBlock = await proseFrame(ctx, p(107), [48, 600, 480, 640], [
      {
        text:
          `listPagedParts ${WEB_PARTS_PREFIX} → ${parts.length} part(s): ` +
          parts.map((path) => path.replace(WEB_PARTS_PREFIX, "")).join(" · "),
        style: STYLE.codeBlock,
      },
    ]);
    elements.push(partsBlock.frameId);

    // ── p108: the LIVE lane, authored through the PANEL ─────────────
    const head108 = await proseFrame(ctx, p(108), [60, 96, 492, 124], [
      { text: "The live lane", style: STYLE.head1 },
    ]);
    elements.push(head108.frameId);

    const live = await doc.rectangle(pg108, LIVE_FRAME);
    await hairline(doc, "rectangle", live, SWATCH.slate);
    await assignLayer(ctx, "rectangle", live, LAYER.content);
    elements.push(live);

    await doc.select("rectangle", live);
    await openPanel(page, WEB_PANEL);
    // The panel resolves a bare rectangle into its convert lane; a
    // frame already carrying an envelope opens the editors. Wait for
    // whichever lane it chose.
    const convert = page.locator("[data-web-make]");
    const htmlLane = page.locator("[data-web-html] [data-code-input]");
    await Promise.race([
      convert.waitFor({ state: "visible", timeout: 120_000 }).catch(() => undefined),
      htmlLane.waitFor({ state: "visible", timeout: 120_000 }).catch(() => undefined),
    ]);
    if (await convert.isVisible().catch(() => false)) {
      await convert.click();
    }
    await expect(htmlLane, "the source panel opened its editors").toBeVisible({
      timeout: 120_000,
    });
    await htmlLane.fill(source.html);
    const cssLane = page.locator("[data-web-css] [data-code-input]");
    await expect(cssLane, "the CSS lane").toBeVisible({ timeout: 120_000 });
    await cssLane.fill(source.css);
    const commit = page.locator("[data-web-commit]");
    await expect(commit, "the Save to document affordance").toBeEnabled({
      timeout: 120_000,
    });
    await commit.click();
    await expect(page.locator("[data-web-dirty]")).toHaveAttribute(
      "data-web-dirty",
      "false",
      { timeout: 120_000 },
    );
    covers.push("plugin-web.source-panel", "plugin-web.metadata-persistence");

    // The single-frame render has reported a not-rendered outcome right
    // after a flows render while the BAKE's identical render succeeded
    // moments earlier — so a first refusal gets ONE retry before the
    // page takes the degraded branch (the flakiness itself is a
    // recorded finding).
    for (let attempt = 0; attempt < 2 && !liveRendered; attempt += 1) {
      await doc.select("rectangle", live);
      await page.waitForTimeout(300);
      try {
        await doc.runCommand(`${WEB_CMD}.renderWebFrame`);
      } catch (err) {
        notes.push(
          "renderWebFrame died in the plugin lane (a scene-layer submit " +
            `was refused): ${String(err).split("\n")[0].slice(0, 140)}`,
        );
        break;
      }
      await settle(
        page,
        () => tap.saw(/scene layer submitted/i) || tap.saw(/engine not loaded/i),
        25_000,
      );
      liveRendered = tap.saw(/scene layer submitted/i);
      if (!liveRendered && attempt === 0) {
        notes.push(
          "the live lane's first renderWebFrame reported no submitted " +
            "layer (the plugin printed its engine-not-loaded fallback) — " +
            "retried once",
        );
        tap.lines.length = 0;
        await page.waitForTimeout(1_500);
      }
    }
    if (liveRendered) {
      covers.push("plugin-web.engine-rendering", "plugin-platform.scene-layer");
    } else {
      notes.push(
        "the live lane never submitted a scene layer on this run — p108 " +
          "carries the panel-committed source without live paint; " +
          "plugin-web.engine-rendering is NOT claimed by this module",
      );
    }

    const cap108 = await proseFrame(ctx, p(108), [324, 186, 492, 560], [
      {
        text: liveRendered
          ? "This frame is being drawn by the web engine right now: a scene " +
            "layer composed inside the frame, recomputed on every render. " +
            "It is the better reading experience and the weaker artifact — " +
            "session state, owned by the running plugin."
          : "This frame carries the article's panel-committed source; on " +
            "this run the render lane declined after the chapter's flow " +
            "renders, so the live paint is absent — which previews the " +
            "very asymmetry this spread is about.",
        style: STYLE.bodySmall,
      },
      {
        text:
          "Turn back one leaf: the same source, flattened to native " +
          "content that needs no engine at all.",
        style: STYLE.bodySmall,
      },
    ]);
    elements.push(cap108.frameId);
  } finally {
    tap.stop();
  }

  // ── the margin notes this spread exists for ──────────────────────
  elements.push(
    await marginNote(
      ctx,
      p(107),
      "The registry records bake-to-native as PARTIAL (text at the " +
        "default face, solid rects, single-subpath paths; the rest " +
        "deferred and counted), so this ledger demonstrates the bake and " +
        "claims no registry row for it. And the bake sits on a RECTO " +
        "deliberately: on a facing verso the geometry door answers in " +
        "spread space and the bake materializes onto the pasteboard — " +
        "measured, twice. → Appendix A",
    ),
    await marginNote(
      ctx,
      p(108),
      "This page's render — when it paints — is a scene layer and will " +
        "NOT survive the chapter checkpoint; the baked page overleaf " +
        "will. That asymmetry is not a defect to apologise for; it is " +
        "the difference between a view and an artifact. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(107), [
      "Specimen No. 174",
      "bakeWebFrame — swatches · rects · text frames · paths",
      "deferred kinds counted, printed, unclaimed",
      "listPagedParts paged/media.paged.web/*",
    ]),
    await specLabel(ctx, p(108), [
      "Specimen No. 175",
      "source panel — make web frame · editors · Save to document",
      "renderWebFrame — the live scene layer",
    ]),
  );

  return { title: "The bake — live versus native", covers, elements, notes };
}
