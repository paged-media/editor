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

// Retouch (p91) — clone stamp, healing brush, content-aware fill, on
// the puppies photograph (Chevanon Photography, Pexels), shown as an
// honest BEFORE / AFTER pair. The before frame carries the file as
// shot; the after frame went through the session: an alt-click anchors
// the clone source (the retouch journey's gesture — the anchor click
// must never paint), strokes stamp and heal, a marquee scopes a
// content-aware fill, and the result is exported and committed as
// inline bytes.
//
// ATTRIBUTION IS MEASURED. Each tool's landing is read from the
// panel's own status line ("Painted N dabs into …" / "Filled the
// selection …"), and the final proof is byte-level: an identity export
// taken BEFORE the retouch is compared with the committed export — if
// they matched, nothing landed, the captions say so, and no tool row
// is claimed.

import type { PageContext, PageReport } from "../../types";
import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  CMD,
  EXPORTER,
  TOOL,
  armTool,
  commitBytes,
  exportDownload,
  fitPageForGesture,
  ingestIntoFrame,
  openAdjustments,
  panelStatus,
  photo,
  pointOnPage,
  replaceBytesFromFile,
  resetAdjustments,
  selectionCoverage,
  setSlider,
  strokeOnPage,
} from "./00-support";

const PUPPIES = photo("pexels-1108099-puppies.jpg");
const PUPPIES_URI = "assets/photos/pexels-1108099-puppies.jpg";

/** The pair: the puppies' own 4:3 at a 200 pt width. */
const BEFORE: [number, number, number, number] = [48, 158, 248, 308];
const AFTER: [number, number, number, number] = [264, 158, 464, 308];

/** The dab count out of a "Painted N dabs" status — 0 when absent. A
 *  committed stroke with ZERO dabs is not a landing (the paint page's
 *  proof runs matched "Painted 0 dabs" as a landing until counted). */
function dabCount(status: string | null): number {
  const m = status ? /Painted (\d+) dab/.exec(status) : null;
  return m ? Number(m[1]) : 0;
}

/** Poll the status line until it matches AND differs from `previous` —
 *  without the second clause a heal poll can instantly match the CLONE
 *  stroke's still-displayed "Painted N dabs" line and mis-attribute the
 *  landing. */
async function statusLanded(
  ctx: PageContext,
  pattern: RegExp,
  timeoutMs: number,
  previous: string | null = null,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await panelStatus(ctx);
    if (pattern.test(status) && status !== previous) return status;
    if (Date.now() >= deadline) return null;
    await ctx.page.waitForTimeout(250);
  }
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(91);
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [];

  const gpu = await doc.gpuActive();

  const head = await proseFrame(ctx, page, [48, 58, 480, 88], [
    { text: "Retouch — painting from the image", style: STYLE.head2 },
  ]);
  const intro = await proseFrame(ctx, page, [48, 92, 480, 148], [
    {
      text:
        "The clone stamp and the healing brush are the brush with a " +
        "different paint layer: the clone copies a window of the image " +
        "from an alt-clicked anchor; the heal runs the same stroke and " +
        "then tone-matches it in the gradient domain, so the patch takes " +
        "on the destination's light. Content-aware fill synthesises a " +
        "marqueed region from the rest of the picture, coarse to fine, " +
        "every written pixel copied — never averaged.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── BEFORE: the file as shot ─────────────────────────────────────
  const before = await doc.rectangle(pg, BEFORE);
  await assignLayer(ctx, "rectangle", before, LAYER.content);
  await doc.mutate("placeImage", { elementId: before, uri: PUPPIES_URI, fit: null });
  const beforeBytes = await replaceBytesFromFile(ctx, before, PUPPIES);
  elements.push(before);

  // ── AFTER: the session copy the tools work on ────────────────────
  const after = await doc.rectangle(pg, AFTER);
  await assignLayer(ctx, "rectangle", after, LAYER.content);
  await doc.mutate("placeImage", { elementId: after, uri: PUPPIES_URI, fit: null });
  await replaceBytesFromFile(ctx, after, PUPPIES);
  elements.push(after);

  let cloneLanded: string | null = null;
  let healLanded: string | null = null;
  let cafLanded: string | null = null;
  let committed: number | null = null;
  let changed = false;

  if (gpu) {
    const importer = await ingestIntoFrame(
      ctx,
      after,
      PUPPIES,
      "puppies-retouch.jpg",
      "image/jpeg",
    );
    if (importer === "media.paged.image.importer.raster") {
      await openAdjustments(ctx);
      await resetAdjustments(ctx);
      // No resample — the same handle-orphaning finding the selections
      // page records: a panel Resample leaves the selection machinery
      // bound to the freed handle, and this page's content-aware fill
      // needs a live marquee. The retouch runs at native 1600 × 1200.

      // The identity baseline: what an export says BEFORE any retouch.
      const baseline = await exportDownload(ctx, EXPORTER.jpeg);

      await fitPageForGesture(ctx, page);

      // ── clone stamp: anchor (alt-click, must not paint), stroke ──
      await armTool(ctx, TOOL.clone);
      await setSlider(ctx, "Size (px)", 120); // brush section renders first; px are IMAGE px on the 1600-wide source
      // Anchor on the flowered turf at the frame's lower left; the
      // strokes transplant it into the soft upper meadow, where a
      // stamped band of flowers is unmistakably deliberate (the first
      // proof render ran the stroke across a puppy, which read as an
      // accident rather than a retouch).
      const preClone = await panelStatus(ctx);
      const anchor = await pointOnPage(ctx, page, 292, 292);
      await ctx.page.keyboard.down("Alt");
      await ctx.page.mouse.click(anchor.x, anchor.y);
      await ctx.page.keyboard.up("Alt");
      await strokeOnPage(ctx, page, [
        [336, 186],
        [362, 192],
        [388, 186],
      ]);
      cloneLanded = await statusLanded(ctx, /Painted \d+ dab/, 20_000, preClone);

      // ── healing brush: new anchor, stroke elsewhere ──────────────
      // RESET the status line first (deselect writes its own text):
      // two strokes of similar length report the IDENTICAL "Painted N
      // dabs" line, and a differs-from-previous poll would read the
      // second landing as silence — the first heal run "landed
      // nothing" for exactly this reason.
      await doc.runCommand(CMD.deselect);
      const preHeal = await panelStatus(ctx);
      await armTool(ctx, TOOL.heal);
      const healAnchor = await pointOnPage(ctx, page, 300, 296);
      await ctx.page.keyboard.down("Alt");
      await ctx.page.mouse.click(healAnchor.x, healAnchor.y);
      await ctx.page.keyboard.up("Alt");
      await strokeOnPage(ctx, page, [
        [290, 186],
        [308, 192],
        [326, 186],
      ]);
      healLanded = await statusLanded(ctx, /Painted \d+ dab/, 20_000, preHeal);

      // ── content-aware fill on a marqueed region ──────────────────
      // The marquee sits on the flowered foreground at the lower
      // right, so the fill visibly lifts a flower cluster out of the
      // turf — synthesised from the surrounding grass, coarse to fine.
      await armTool(ctx, TOOL.marqueeRect);
      await strokeOnPage(ctx, page, [
        [416, 278],
        [446, 300],
      ]);
      const cov = await selectionCoverage(ctx);
      if (cov !== null) {
        await doc.runCommand(CMD.contentAwareFill);
        cafLanded = await statusLanded(ctx, /^Filled /, 180_000);
        await doc.runCommand(CMD.deselect);
      } else {
        notes.push(
          "the content-aware marquee landed no coverage — the fill was " +
            "not driven",
        );
      }

      // ── commit, and the byte-level proof ─────────────────────────
      const out = await exportDownload(ctx, EXPORTER.jpeg);
      if ("bytes" in out) {
        committed = await commitBytes(ctx, after, out.bytes);
        if ("bytes" in baseline) {
          changed = !out.bytes.equals(baseline.bytes);
          if (!changed) {
            notes.push(
              "the retouched export is byte-identical to the identity " +
                "baseline — no stroke landed; captions state it and no " +
                "tool row is claimed",
            );
          }
        }
      } else {
        notes.push(`retouch export: ${out.reason}`);
      }

      // A claim needs BOTH the aggregate byte-change and that tool's
      // own non-zero dab count — the aggregate alone would let a
      // 0-dab stroke ride a landed fill into a claim.
      if (changed && dabCount(cloneLanded) > 0) {
        covers.push("image.editor.clone-stamp");
      }
      if (changed && dabCount(healLanded) > 0) {
        covers.push("image.editor.healing-brush");
      }
      if (changed && cafLanded) covers.push("image.editor.content-aware-fill");
      for (const [name, landed] of [
        ["clone", cloneLanded],
        ["heal", healLanded],
        ["content-aware fill", cafLanded],
      ] as const) {
        notes.push(
          landed
            ? `${name} → ${landed.slice(0, 120)}`
            : `${name}: no landing reported by the panel`,
        );
      }
    } else {
      notes.push(`importer answered "${importer}" — retouch not driven`);
    }
  } else {
    notes.push(
      "no GPU render path — every dab composite is a WGSL dispatch, so " +
        "the retouch pair shows the photograph as shot on both sides",
    );
  }

  // ── captions from the measured outcome ───────────────────────────
  const beforeCap = await proseFrame(ctx, page, [48, 312, 248, 356], [
    {
      text:
        `BEFORE · as shot · ${beforeBytes.toLocaleString("en-US")} B inline · ` +
        "two retriever puppies, Chevanon Photography, Pexels",
      style: STYLE.specLabel,
    },
  ]);
  const afterCap = await proseFrame(ctx, page, [264, 312, 464, 356], [
    {
      text:
        committed !== null && changed
          ? `AFTER · clone + heal transplant flowered turf into the upper ` +
            `meadow; content-aware fill lifts a flower cluster from the ` +
            `lower right · ${committed.toLocaleString("en-US")} B committed`
          : "AFTER · the retouch did not land on this lane — this frame " +
            "carries the photograph as shot",
      style: STYLE.specLabel,
    },
  ]);
  elements.push(beforeCap.frameId, afterCap.frameId);

  const method = await proseFrame(ctx, page, [48, 372, 480, 470], [
    {
      text:
        "The anchor click is a separate interaction from the stroke — " +
        "alt-click sets the source and deposits nothing, because painting " +
        "the anchor is the one thing a retoucher never wants. The heal's " +
        "correction is the membrane field matching the source–destination " +
        "mismatch on the dab's boundary; where the window runs off the " +
        "image it falls back to a plain clone and says so in the panel. " +
        "Attribution on this page is measured twice: each landing is read " +
        "from the panel's status line, and the committed export is " +
        "byte-compared against an identity baseline taken before the " +
        "first stroke.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(method.frameId);

  await marginNote(
    ctx,
    page,
    "Strokes live in the plugin's session and its own undo journal, not " +
      "in the document's history; the after frame persists only as the " +
      "committed inline bytes. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 134",
      "clone stamp · healing brush · content-aware fill",
      "alt-click anchor, stroke, marquee, commit",
    ]),
  );

  return {
    title: "Retouch — clone, heal, content-aware fill",
    covers,
    elements,
    notes,
  };
}
