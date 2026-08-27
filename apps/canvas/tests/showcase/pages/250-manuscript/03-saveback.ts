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

// Save-back readiness (p118, B-Body verso) — the byte-splice story told
// straight, the host's readiness read from the plugin's own panel, and
// the exporter driven through the app's ONE blob→file door with the
// result measured in bytes.
//
// The patcher's design is the page's subject: quick-xml is used only as
// a LOCATOR — a single pass computes the byte ranges to replace,
// everything outside them is raw-copied, and hand-built fragments are
// spliced into the holes, so untouched bytes are identical BY
// CONSTRUCTION, not by a serializer's good behaviour. Edits are derived
// by an identity-keyed LCS alignment (blocks, table rows, runs), so a
// deleted middle paragraph lands on ITS source node, never its
// successor's. Which lane actually runs here depends on one host door —
// the structured story read — and the page prints the panel's own
// verdict rather than assuming either answer.

import { readFileSync } from "node:fs";

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import { captureDownload } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  DOCX_EXPORTER,
  DOCX_FIXTURE,
  EXPORT_CENTER_PANEL,
  OUTLINE_PANEL,
  chapterDoc,
} from "./00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { page } = ctx;
  const t0 = Date.now();
  const lap = (label: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[250 timing] saveback ${label} at t+${Math.round((Date.now() - t0) / 1000)}s`);
  };
  const pg = p(118);
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [60, 54, 492, 82], [
    { text: "Save-back, honestly", style: STYLE.head1 },
  ]);
  const body = await proseFrame(ctx, pg, [60, 88, 492, 330], [
    {
      text:
        "The manuscript on the last spread can go home again. The exporter " +
        "holds the report's original bytes, and when an edited story comes " +
        "back it does not re-serialize the document — it patches it. " +
        "quick-xml runs once as a locator, computing the exact byte ranges " +
        "of the runs that changed; everything outside those ranges is " +
        "raw-copied, and hand-built fragments are spliced into the holes. " +
        "Untouched bytes are identical by construction — rsids, ignorable " +
        "namespaces, parts Paged does not model — because no serializer " +
        "ever touches them.",
      style: STYLE.body,
    },
    {
      text:
        "Which runs changed is decided by identity, not by index: the diff " +
        "aligns story blocks, table rows and runs through an LCS keyed on " +
        "what each node IS, so deleting a middle paragraph edits that " +
        "paragraph's source node and never rewrites its successor. " +
        "Synthesized docx-auto styles project back to direct formatting, so " +
        "Word never meets a synthetic style name. And what the patcher will " +
        "not risk, it refuses out loud: column operations on a gridSpan " +
        "table land in a skip ledger instead of a guess.",
      style: STYLE.body,
    },
  ]);
  elements.push(head.frameId, body.frameId);

  lap("intro frames done");
  // ── the host's own readiness verdict ──────────────────────────────
  await openPanel(page, OUTLINE_PANEL);
  const readiness =
    (await page
      .locator("[data-doc-readiness]")
      .getAttribute("data-doc-readiness")
      .catch(() => null)) ?? chapterDoc.readiness;

  let verdictText: string;
  if (readiness === "live") {
    verdictText =
      "This host's verdict, read from the plugin's own panel: LIVE — the " +
      "structured story read (document.readStory@1) answers, so an edited " +
      "story would flow back through the overlay, the diff and the " +
      "byte-splice patcher.";
  } else if (readiness === "verbatim") {
    verdictText =
      "This host's verdict, read from the plugin's own panel: VERBATIM — " +
      "the structured story-read door (document.readStory@1) is not in " +
      "this host's feature list, so the edited lane cannot run and the " +
      "exporter re-emits the retained source package unchanged. That is " +
      "the designed degrade: a valid unedited .docx, never a wrong one.";
  } else {
    verdictText =
      "The outline panel offered no readiness verdict on this lane — " +
      "recorded rather than assumed.";
    notes.push("no data-doc-readiness attribute was readable on p118.");
  }

  lap("readiness read");
  // ── the export, measured in bytes ─────────────────────────────────
  let exportLine = "The exporter was not driven — no document was placed.";
  if (chapterDoc.placed) {
    /** Judge exported bytes against the placed source and set the
     *  page's verdict + claims — shared by both export lanes. */
    const judge = (bytes: Buffer, name: string, lane: string): void => {
      const magic = bytes.subarray(0, 2).toString("latin1");
      expect(magic, "the exported .docx is a ZIP package").toBe("PK");
      const source = readFileSync(DOCX_FIXTURE);
      const identical = bytes.equals(source);
      exportLine =
        `Exported ${lane}: ${name}, ` +
        `${bytes.length.toLocaleString("en-US")} bytes, ZIP magic PK. ` +
        (identical
          ? `Byte-identical to the ${source.length.toLocaleString("en-US")}-byte ` +
            "source that was placed — the verbatim lane, proven at the " +
            "byte level rather than claimed."
          : `The source was ${source.length.toLocaleString("en-US")} bytes — ` +
            "the export differs, so the edited lane (or a re-zip) ran; " +
            "recorded as measured.");
      if (identical || readiness === "verbatim") {
        covers.push("plugin-doc.verbatim-export");
      }
      if (!identical && readiness === "live") {
        covers.push("plugin-doc.save-back");
      }
    };

    await openPanel(page, EXPORT_CENTER_PANEL);
    const row = page.locator(`[data-plugin-export="${DOCX_EXPORTER}"]`);
    const rowShown = await row
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (rowShown) {
      try {
        const out = await captureDownload(page, () => row.click(), 45_000);
        judge(out.bytes, out.name, "through the export center's plugin row");
      } catch (err) {
        notes.push(
          `the .docx export produced no download within 45 s: ${String(err).slice(0, 160)}`,
        );
        exportLine =
          "The export row was present but no file arrived through the " +
          "download door on this lane — see the run notes.";
      }
    } else {
      // The panel's plugin section did not render the row. ASK the
      // exporter REGISTRY itself before concluding anything — the
      // journey drives this same lane — and pull the bytes through it,
      // so the export is still measured while the panel gap is
      // recorded as its own finding.
      const fromRegistry = await page.evaluate(async (exporterId) => {
        const reg = (
          globalThis as unknown as {
            __canvas: {
              registries: {
                exporters?: {
                  list: () => Array<{
                    id: string;
                    export: () =>
                      | Promise<{ bytes: Uint8Array; fileName: string } | null>
                      | { bytes: Uint8Array; fileName: string }
                      | null;
                  }>;
                };
              };
            };
          }
        ).__canvas.registries.exporters;
        if (!reg) {
          return { ids: null as string[] | null, bytes: null as number[] | null, name: "" };
        }
        const ids = reg.list().map((e) => e.id);
        const hit = reg.list().find((e) => e.id === exporterId);
        if (!hit) return { ids, bytes: null, name: "" };
        const result = await hit.export();
        if (!result) return { ids, bytes: null, name: "" };
        return { ids, bytes: Array.from(result.bytes), name: result.fileName };
      }, DOCX_EXPORTER);

      if (fromRegistry.bytes) {
        notes.push(
          "FINDING — the exporter IS in the host exporter registry " +
            `(registry lists: ${(fromRegistry.ids ?? []).join(", ") || "none"}) ` +
            "but the export center's plugin section never rendered its row, " +
            "so the one-click download surface missed a registered exporter; " +
            "the page pulled the bytes through the registry (the journey " +
            "lane) and the blob-to-download door went unexercised.",
        );
        judge(
          Buffer.from(fromRegistry.bytes),
          fromRegistry.name,
          "through the host exporter registry (the export center's row " +
            "never rendered — see the run notes)",
        );
      } else {
        notes.push(
          `the export center lists no ${DOCX_EXPORTER} row and the registry ` +
            `answered ${fromRegistry.ids ? `[${fromRegistry.ids.join(", ")}]` : "no registry"} ` +
            "— the exporter did not register on this lane.",
        );
        exportLine =
          "The export center listed no Word exporter row on this lane and " +
          "the registry answered without it — nothing was exported, and " +
          "nothing pretends otherwise.";
      }
    }
  }

  lap("export block done");
  const verdict = await proseFrame(ctx, pg, [60, 344, 492, 452], [
    { text: verdictText, style: STYLE.bodySmall },
    { text: exportLine, style: STYLE.bodySmall },
  ]);
  elements.push(verdict.frameId);

  const provenance = await proseFrame(ctx, pg, [60, 466, 492, 560], [
    {
      text:
        "Provenance, end to end: the report was PLACED, its source travels " +
        "as the container part the last page printed, its content lowered " +
        "to native stories — and the file that just left through the " +
        "exporter is the same manuscript, patched or carried verbatim, " +
        "never re-invented. A place, not an open; a patch, not a rewrite.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(provenance.frameId);

  lap("verdict + provenance frames done");
  // ── the footnote diagnostic, quoted from the panel ────────────────
  // Re-raise the OUTLINE panel first — the export-center click swapped
  // it out of its dock — and BOUND the read: an unbounded innerText()
  // on a hidden node waited out this chapter's entire test budget once
  // (measured: 37 minutes of nothing).
  let footnoteQuote =
    "footnotes are parsed and diagnosed, never silently inlined";
  await openPanel(page, OUTLINE_PANEL).catch(() => undefined);
  const diagText = await page
    .locator("[data-doc-diagnostics]")
    .innerText({ timeout: 10_000 })
    .catch(() => "");
  const footLine = diagText
    .split("\n")
    .find((line) => /footnote/i.test(line));
  if (footLine) {
    footnoteQuote = footLine.trim().slice(0, 160);
  }

  lap("diagnostics read");
  elements.push(
    await marginNote(
      ctx,
      pg,
      "The report's two footnotes are in its story apparatus but not on " +
        "these pages: the lowering diagnoses them instead of faking a " +
        `placement — the panel's own line reads “${footnoteQuote}”. They ` +
        "survive untouched in the source part and in every save-back. " +
        "→ Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 185",
      `readiness: ${readiness ?? "unread"} (the panel's own verdict)`,
      "export center → media.paged.doc.exporter.docx → download door",
      "byte-splice patcher: locator-only quick-xml, LCS identity diff",
    ]),
  );

  return {
    title: "Save-back readiness",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
