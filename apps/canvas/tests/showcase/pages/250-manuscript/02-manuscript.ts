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

// The placed manuscript (p116–p117, the spread) — "Place Word
// document…" with the PRE-ARMED filechooser feeds annual-report.docx to
// the bundle's OOXML engine; the lowering pours it into the open layout
// as NATIVE stories, and the poured content IS the exhibit. Every tier
// the read path handles is IN the report on these two pages: styles
// synthesized from the document's own word/styles.xml, both list
// families (2-level bullets AND decimals), the gridSpan+vMerge
// circulation table, the embedded plate-mark image, hyperlinks in BOTH
// Word encodings, tab-stop ledger lines — and two footnotes, which are
// parsed, diagnosed, and honestly NOT inlined (the save-back page
// carries that note).
//
// The pour arrives in ONE frame sized to the .docx's own section
// margins (this report was authored at the annual's page size, so they
// agree); the page re-frames it into the spread's exhibit slot and
// threads a second frame on the recto — ordinary layout, then a real
// frame chain carrying one story across the spread. Threading is ASKED
// about, not assumed: on the engine one publish earlier the same op
// changed the model and moved no pixels.
//
// RECIPE FROM: tests/journey/plugins/doc.journey.spec.ts (place → panel
// → render) and the retired pages/10-word.ts (the pre-armed chooser +
// the ask-where-it-landed discipline).

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { withActivePage } from "../../active-page";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  ConsoleTap,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
} from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  DOCX_FIXTURE,
  PLACE_CMD,
  chapterDoc,
  listParts,
  spreadOffset,
  storyOverset,
} from "./00-support";

/** The exhibit slots, page-space (x0, y0, x1, y1). */
const F1_SLOT: [number, number, number, number] = [60, 176, 492, 560];
const F2_SLOT: [number, number, number, number] = [48, 54, 480, 600];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg116 = p(116);
  const pg117 = p(117);
  const versoId = ctx.pageIds[0];
  const rectoId = ctx.pageIds[1];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg116, [60, 54, 492, 82], [
    { text: "A manuscript, poured", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg116, [60, 88, 492, 170], [
    {
      text:
        "The circulation report below began as annual-report.docx. The " +
        "plugin lowered its OOXML to native paragraphs and character runs, " +
        "synthesized the styles its word/styles.xml declares, and poured it " +
        "here — what you are reading is Paged content, not an embedded " +
        "viewer, and it flows across this spread through an ordinary frame " +
        "chain. The source file travels inside this container beside it.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const t0 = Date.now();
  const lap = (label: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[250 timing] ${label} at t+${Math.round((Date.now() - t0) / 1000)}s`);
  };
  const tap = new ConsoleTap(page, /paged\.doc|\[doc\]/i);
  let summaryText: string | null = null;
  let pouredNote =
    "The Word document did not place on this lane — the spread shows its " +
    "furniture and the run notes say why.";
  let overset: boolean | null = null;
  let threaded = false;

  try {
    // ── 1. PLACE (fire-and-feed: arm the chooser BEFORE the command;
    //    the handler returns before the pour, so the active page has to
    //    stay supplied until the frame exists). ─────────────────────
    const framesBefore = await sceneRefs(page, "textFrame");
    await withActivePage(page, versoId, async () => {
      const chooser = page.waitForEvent("filechooser");
      const placed = doc.runCommand(PLACE_CMD);
      await (await chooser).setFiles(DOCX_FIXTURE);
      await placed;
      await settle(
        page,
        async () => (await newRefs(page, "textFrame", framesBefore)).length > 0,
        45_000,
      );
    });

    lap("place settled (first frame present)");

    // ── 2. THE OUTLINE PANEL (renders from the RETAINED lowering — its
    //    readiness is the read path's own receipt). ─────────────────
    // The panel renders ready only after the WHOLE ingest returns —
    // which on the op-by-op pour lane can be minutes after the first
    // frame appears (measured; 30 s read "not ready" a beat before it
    // was).
    const panelReady = page.locator('[data-doc-panel="ready"]');
    const panelShown = await panelReady
      .waitFor({ state: "visible", timeout: 300_000 })
      .then(() => true)
      .catch(() => false);
    if (panelShown) {
      covers.push("plugin-doc.outline-panel", "plugin-doc.read-path");
      summaryText = (
        await page
          .locator("[data-doc-summary]")
          .innerText()
          .catch(() => "")
      ).trim();
      chapterDoc.readiness = await page
        .locator("[data-doc-readiness]")
        .getAttribute("data-doc-readiness")
        .catch(() => null);
      if (chapterDoc.readiness) {
        notes.push(
          `paged.doc save-back readiness on this lane: ${chapterDoc.readiness}.`,
        );
      }
    } else {
      notes.push(
        "the paged.doc outline panel never reported ready — the DOCX read " +
          `path did not complete. Plugin log: ${tap.join() || "nothing"}`,
      );
    }

    lap("outline panel wait done");

    // ── 3. FIND THE POUR, RE-FRAME IT, THREAD THE SPREAD ───────────
    const minted = await newRefs(page, "textFrame", framesBefore);
    const { here, elsewhere } = await partitionByPage(page, minted, versoId);

    if (here.length > 0) {
      covers.push("plugin-doc.embedded-placement", "editor-shell.plugin-bundles", "plugin-platform.file-picker");
      chapterDoc.placed = true;
      const pouredFrame = here[0];
      if (here.length > 1) {
        await removeRefs(doc, here.slice(1));
        notes.push(
          `placeDoc created ${here.length} frames on the verso; the extras were removed.`,
        );
      }
      if (elsewhere.length > 0) {
        await removeRefs(doc, elsewhere);
        notes.push(
          `${elsewhere.length} placed frame(s) landed on another page despite the ` +
            "supplied active page — removed.",
        );
      }

      // Re-frame into the exhibit slot. The resize lane speaks STORED
      // coordinates, so the verso's measured spread offset folds in.
      const off = await spreadOffset(ctx, versoId);
      await doc.mutate("resizeFrame", {
        frameId: pouredFrame.id,
        bounds: [
          F1_SLOT[1] + off[1],
          F1_SLOT[0] + off[0],
          F1_SLOT[3] + off[1],
          F1_SLOT[2] + off[0],
        ],
      });
      await doc
        .setProperty("textFrame", pouredFrame.id, "itemLayer", {
          type: "text",
          value: await doc.layerId(LAYER.content),
        })
        .catch(() => undefined);
      elements.push(pouredFrame.id);

      const storyId = await doc.storyOf(versoId, F1_SLOT);
      chapterDoc.storyId = storyId;

      // WAIT OUT THE POUR. The frame appears on the FIRST mutation of a
      // long chain — on an engine that rejects one batch the bundle
      // replays op by op, and the story keeps growing for minutes.
      // Threading or measuring against a half-poured story would record
      // nonsense, so poll the story's length until it holds still.
      let lastChars = -1;
      let stableRuns = 0;
      const pourDeadline = Date.now() + 300_000;
      for (;;) {
        const chars = await doc.storyChars(storyId).catch(() => -1);
        // THREE equal samples 4 s apart: a single equal pair can be two
        // reads inside one slow op (in-chain mutations run seconds each).
        if (chars === lastChars && chars > 0) {
          stableRuns += 1;
          if (stableRuns >= 3) break;
        } else {
          stableRuns = 0;
        }
        lastChars = chars;
        if (Date.now() >= pourDeadline) {
          notes.push(
            `the pour never settled within 300 s (story at ${chars} chars) — ` +
              "measurements below read a possibly incomplete story.",
          );
          break;
        }
        await page.waitForTimeout(4_000);
      }
      lap(`pour settled (${lastChars} chars)`);
      if (tap.saw(/rejected a pour op/i)) {
        notes.push(
          "the engine rejected at least one pour op — an applyStyle over an " +
            "EMPTY range (start == end), which the host-model emitted for a " +
            "zero-length style span; the pour continued and the refusal was " +
            "logged, never swallowed (ADR-007).",
        );
      }
      notes.push(
        "FINDING — the poured story renders visually UNSTYLED on this lane: " +
          "the synthesized heading/caption styles and both list families " +
          "are applied over the story (the outline panel counts them) but " +
          "the paint shows one face and size, no bold, no bullet or number " +
          "glyphs, and the docx docDefaults face does not reach the render.",
        "FINDING — the embedded plate-mark PNG lowers to an anchored image " +
          "frame that paints the missing-image placeholder (its bytes have " +
          "no URI-addressable home through insertAnchoredFrame) and the " +
          "anchored frame overlaps the table rows beneath it; the ledger " +
          "lines' dot-leader tabs paint as substitute glyphs.",
      );

      // The recto continuation — a real frame chain, then the ASK.
      const f2 = await doc.textFrame(rectoId, F2_SLOT);
      await doc.linkFrames(pouredFrame.id, f2);
      await doc.renderPage(pg117); // force the compose the read reflects
      const f2Story = await doc.storyOf(rectoId, F2_SLOT).catch(() => null);
      threaded = f2Story === storyId;
      if (threaded) {
        covers.push("layout-model.text-frame-chain");
        elements.push(f2);
        await doc
          .setProperty("textFrame", f2, "itemLayer", {
            type: "text",
            value: await doc.layerId(LAYER.content),
          })
          .catch(() => undefined);
      } else {
        await doc.mutate("unlinkFrames", { frame: pouredFrame.id }).catch(() => undefined);
        await removeRefs(doc, [{ kind: "textFrame", id: f2 }]);
        notes.push(
          "linkFrames did not carry the manuscript's story into the recto " +
            "frame (the target kept its own story) — the continuation frame " +
            "was removed and the report reads on the verso alone.",
        );
      }

      lap("threading verified");
      overset = await storyOverset(page, storyId);
      pouredNote =
        `Poured as one native story${threaded ? " threaded across the spread" : ""}. ` +
        (summaryText
          ? `The outline panel's own summary of the retained lowering: ${summaryText.replace(/\s+/g, " ")}. `
          : "") +
        (overset === true
          ? "The report is longer than the spread's two frames — the tail " +
            "oversets and the margin says so."
          : overset === false
            ? "The whole report paints within the chain."
            : "");
    } else if (elsewhere.length > 0) {
      // The pour missed the supplied page. Park it 6pt and invisible
      // rather than deleting — the lowered story and the source part
      // still travel in the container (the 10-word precedent).
      const strayed = elsewhere[0];
      await doc.mutate("resizeFrame", {
        frameId: strayed.id,
        bounds: [72, 72, 78, 78],
      });
      await doc.setProperty("textFrame", strayed.id, "elementVisible", {
        type: "bool",
        value: false,
      });
      notes.push(
        "placeDoc poured onto another page despite the supplied active page " +
          "— the frame was parked at 6pt and made invisible rather than " +
          "deleted, so the lowered story and its source part still travel.",
      );
    } else {
      notes.push(
        `placeDoc created no text frame at all — nothing was poured. Plugin ` +
          `log: ${tap.join() || "nothing"}`,
      );
    }

    // ── 4. THE SOURCE PART — single-prefix path, read from the
    //    container's own listing. ────────────────────────────────────
    lap("overset read");
    const parts = await listParts(page, "paged/media.paged.doc/");
    if (parts.length > 0) {
      chapterDoc.partPath = parts[0];
      const doubled = parts.some(
        (path) => (path.match(/media\.paged\.doc/g) ?? []).length !== 1,
      );
      expect(
        doubled,
        `the source part path doubled its namespace prefix: ${parts.join(", ")}`,
      ).toBe(false);
      if (!tap.saw(/could not persist source part/i)) {
        covers.push("package-anatomy.paged-parts-door");
      }
    } else if (chapterDoc.placed) {
      notes.push(
        "the container lists no paged/media.paged.doc/ part — the source " +
          ".docx was not persisted (the write warned: " +
          `${tap.saw(/could not persist/i) ? "yes" : "no"}).`,
      );
    }
  } finally {
    tap.stop();
  }

  // ── the spread's captions, from measured facts ────────────────────
  const capLeft = await proseFrame(ctx, pg116, [60, 568, 240, 656], [
    {
      text:
        "Tiers on this page: the report's Heading 1 / Heading 2 / caption " +
        "styles were synthesized into this document's catalog and applied " +
        "over these paragraphs, and the counting rules and press calendar " +
        "carry its two list families. Measured honestly: on this engine " +
        "the applied styles and list glyphs do not change the paint — the " +
        "story reads complete but renders in one face and size. Recorded, " +
        "not retouched.",
      style: STYLE.caption,
    },
  ]);
  const capRight = await proseFrame(ctx, pg116, [252, 568, 492, 656], [
    {
      text: pouredNote,
      style: STYLE.caption,
    },
  ]);
  elements.push(capLeft.frameId, capRight.frameId);

  const capRecto = await proseFrame(ctx, pg117, [48, 606, 480, 666], [
    {
      text:
        "Tiers continuing here: the circulation table keeps its gridSpan " +
        "title row and vMerge'd Alpine cell; the plate mark arrives as an " +
        "anchored image frame that paints the missing-image marker — the " +
        "embedded PNG's bytes have no URI the anchored-frame door can " +
        "fetch — and it overlaps the rows beneath it; “paged.media/annual” " +
        "and “docs.paged.media” are the two Word hyperlink encodings — " +
        "w:hyperlink and a HYPERLINK field — both lowered to native links. " +
        (chapterDoc.partPath
          ? `Source part, from the container's own listing: ${chapterDoc.partPath}`
          : "The container listing carried no source part on this lane."),
      style: STYLE.caption,
    },
  ]);
  elements.push(capRecto.frameId);

  elements.push(
    await marginNote(
      ctx,
      pg117,
      overset === true
        ? "The report is longer than this spread's two frames — its tail " +
            "(the dot-leader ledger lines and the closing paragraph) is " +
            "overset, present in the story and the save-back, unpainted " +
            "here. → Appendix A"
        : "The pour arrives in one frame sized to the .docx's own section " +
            "margins; this spread re-framed and threaded it — ordinary " +
            "layout, and the only kind of move there is. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg116, [
      "Specimen No. 183",
      "placeDoc · shell.pickFile (pre-armed chooser)",
      "OOXML → LoweredDoc → native pour (synthesized styles)",
      "outline panel = the retained lowering's receipt",
    ]),
  );
  elements.push(
    await specLabel(ctx, pg117, [
      "Specimen No. 184",
      threaded
        ? "linkFrames → one story across the spread (asked, not assumed)"
        : "linkFrames carry FAILED on this engine — recorded",
      "gridSpan+vMerge table · embedded PNG · both hyperlink forms",
      "listPagedParts → single-prefix source part",
    ]),
  );

  return {
    title: "The placed manuscript",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
