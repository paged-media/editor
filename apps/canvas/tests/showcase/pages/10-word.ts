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

// Spread 10 — paged.doc: a Word document placed into the open layout.
//
// WHAT THIS PAGE DEMONSTRATES. "Place Word document…" picks a `.docx`
// through the host file picker, the bundle's OOXML engine lowers it to
// a `LoweredDoc` IR, and `placeEmbedded` pours that IR into the OPEN
// document as NATIVE stories — real paragraphs, real character runs,
// real styles SYNTHESIZED from the document's own `word/styles.xml`
// and created through `createParagraphStyle` / `createCharacterStyle`
// before the first `applyStyle` references them. Nothing about the
// result needs the plugin to render: it is Paged content from the
// moment the pour commits. The source `.docx` is kept alongside it as a
// namespaced container part (`paged/media.paged.doc/<story>/source.docx`)
// so the byte-level save-back lane can patch the original later.
//
// It is NON-DESTRUCTIVE by construction — this is a place, not an open.
// The showcase document keeps its own fifteen other spreads.
//
// THE ONE BUNDLE THAT IS NOT AN npm CANARY. Every other plugin the
// showcase drives arrives as a published `@paged-media/*` canary.
// `@paged-media/doc` has never been published, so the editor consumes it
// through a pnpm override — `"@paged-media/doc":
// "link:../plugins/plugin-doc/packages/doc-bundle"` in the workspace
// root `package.json`. This page's behaviour therefore depends on the
// LOCAL `~/paged/plugins/plugin-doc` checkout being present and built,
// and a change there changes this page with no version bump in between.
//
// RECIPE FROM: `tests/journey/plugins/doc.journey.spec.ts` (place →
// outline panel → the poured story paints → the .docx exporter).
//
// WHERE IT LANDS. `place.ts` resolves its page as `meta.activePage ??
// pages[0]`, so this module supplies the active page around the whole
// ingest — not just around the command, which returns before the pour
// (`handler: () => void pickAndIngest()`). The pour then arrives here,
// in a frame sized to the .docx's own section margins; the module moves
// that frame down into the page's content slot, which is a same-page
// resize and nothing more.
//
// The module still ASKS where the frame landed instead of assuming, and
// still carries a fallback for the answer "not on this page": thread the
// placed frame into one here (`linkFrames`) and park the original at 6pt
// and invisible. That fallback is verified by a RENDER DIFF rather than
// by a story-id read, because a story-id read answers with the target
// frame's own story either way and would report a success that is not on
// the page. If it does not carry, the pour is parked rather than deleted
// — the lowered story and the source part still travel in the container,
// and the page says so.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withActivePage } from "../active-page";
import type { Bounds } from "../driver";
import {
  CONTENT_TOP_PT,
  ConsoleTap,
  headingAndCaption,
  labelFrame,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
} from "../plugin-support";
import type { PageContext, PageReport } from "../types";

const DOCX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/doc-memo.docx",
);

const PLACE_CMD = "media.paged.doc.command.placeDoc";
const OUTLINE_PANEL = "media.paged.doc.panel.outline";

/** Where the memo reads on THIS page once it is threaded forward. */
const MEMO: Bounds = [CONTENT_TOP_PT, 72, 660, 540];

/** The 6pt box the page-1 frame is shrunk to so nothing fits in it and
 *  the whole story oversets into {@link MEMO}. It is also marked
 *  invisible, so it paints nothing at all. */
const PARKED: Bounds = [72, 72, 78, 78];

const HEADING = "A Word document, poured in";

const CAPTION =
  "The memo below started as a .docx. The plugin lowered its OOXML to native " +
  "paragraphs and character runs and created the paragraph and character styles it " +
  "needs before applying them, so what you are reading is Paged content — not an " +
  "embedded viewer. The original file travels inside the container beside it.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pageId = ctx.pageIds[0];
  const pageIndex = ctx.pageIndexes[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers = [
    "editor-shell.plugin-bundles",
    "frames-paths.frame.insert",
    "stories-text.text.insert",
    "stories-text.style-apply-range",
  ];

  elements.push(...(await headingAndCaption(doc, pageId, HEADING, CAPTION)));

  const tap = new ConsoleTap(page, /paged\.doc|\[doc\]/i);
  let placedNote =
    "The Word document did not place in this lane, so this page shows no poured content.";
  try {
    // ── 1. PLACE ────────────────────────────────────────────────────
    // Fire-and-feed: the command promise resolves only after ingest, so
    // the filechooser has to be armed before it is invoked.
    const framesBefore = await sceneRefs(page, "textFrame");
    await withActivePage(page, pageId, async () => {
      const chooser = page.waitForEvent("filechooser");
      const placed = doc.runCommand(PLACE_CMD);
      await (await chooser).setFiles(DOCX_FIXTURE);
      await placed;
      // `placeDoc`'s handler is `() => void pickAndIngest()`: it returns
      // BEFORE the pour, so the active page has to stay supplied until
      // the frame actually exists, not until the command resolves.
      await settle(
        page,
        async () => (await newRefs(page, "textFrame", framesBefore)).length > 0,
        30_000,
      );
    });
    covers.push("plugin-platform.file-picker");

    // The importer raises its outline panel on a successful place; the
    // panel renders from the RETAINED LoweredDoc, so its presence is
    // evidence the read path produced an IR.
    // `locator.isVisible()` does NOT retry — it answers about the DOM as
    // it stands, and the ingest is asynchronous behind a command that
    // returns immediately (`handler: () => void pickAndIngest()`). This
    // has to WAIT, or the whole placement reads as "nothing was poured"
    // a few milliseconds before it is.
    const panelReady = page.locator('[data-doc-panel="ready"]');
    const panelShown = await panelReady
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (panelShown) {
      covers.push("plugin-doc.outline-panel", "plugin-doc.read-path");
      const readiness = await page
        .locator("[data-doc-readiness]")
        .getAttribute("data-doc-readiness")
        .catch(() => null);
      if (readiness) {
        notes.push(`paged.doc save-back readiness on this lane: ${readiness}.`);
      }
    } else {
      notes.push(
        `the paged.doc outline panel (${OUTLINE_PANEL}) never reported ready — the DOCX ` +
          `read path did not complete. Plugin log: ${tap.join() || "nothing"}`,
      );
    }

    // ── 2. FIND THE POURED FRAME ────────────────────────────────────
    // Poll rather than sample: the pour is a chain of host mutations
    // behind an unawaited command, so "no frame yet" is not "no frame".
    await settle(
      page,
      async () => (await newRefs(page, "textFrame", framesBefore)).length > 0,
      20_000,
    );
    const minted = await newRefs(page, "textFrame", framesBefore);
    const { here, elsewhere } = await partitionByPage(page, minted, pageId);

    if (here.length === 0 && elsewhere.length === 0) {
      notes.push(
        "placeDoc created no text frame at all — nothing was poured. " +
          `Plugin log: ${tap.join() || "nothing"}`,
      );
      elements.push(
        await labelFrame(doc, pageId, [672, 72, 720, 540], placedNote),
      );
      return {
        title: "paged.doc — a Word document poured into the layout",
        covers: [...new Set(covers)],
        elements,
        notes,
      };
    }

    covers.push("plugin-doc.embedded-placement");
    // `placeEmbedded` writes the source .docx to
    // `paged/media.paged.doc/<story>/source.docx` through the container
    // parts door, and warns on the log when that write fails. Claim the
    // door on the absence of that warning, not on the placement alone.
    if (!tap.saw(/could not persist source part/i)) {
      covers.push("package-anatomy.paged-parts-door");
    }

    if (here.length > 0) {
      // THE NORMAL PATH. The pour lands on this page, in a frame sized
      // to the .docx's OWN section margins — which is the full live
      // area, over this page's heading and caption. Moving it down into
      // the page's content slot is ordinary layout (same page, same
      // story, same styles), and it is what a designer would do next.
      elements.push(...here.map((r) => r.id));
      await doc.mutate("resizeFrame", { frameId: here[0].id, bounds: MEMO });
      const chars = await doc.storyChars(await doc.storyOf(pageId, MEMO));
      placedNote =
        `Poured onto this page as a native story of ${chars} characters, with the ` +
        "paragraph and character styles the .docx declared synthesized into the " +
        "document's own catalog. The source file travels beside it inside the container.";
      if (here.length > 1) {
        notes.push(
          `placeDoc created ${here.length} frames on this page; only the first was ` +
            "placed into the content slot.",
        );
      }
    } else {
      // ── 3. TRY TO CARRY IT HERE, AND VERIFY BY PIXELS ─────────────
      //
      // Threading is the only carry the wire can express: `linkFrames`
      // rewrites the source frame's `NextTextFrame` so the story reflows
      // into the target, and the target is then the frame that renders
      // it. Shrinking the source to a 6pt box and marking it invisible
      // should leave the whole story oversetting forward into the frame
      // on this page.
      //
      // MEASURED, NOT ASSUMED — and on the engine this ran against it
      // does NOT carry: `apply_link_frames` sets `next_text_frame` but
      // leaves the target frame's `parent_story` pointing at its own
      // (empty) story, so the composer keeps rendering that instead.
      // The check below is a RENDER DIFF for exactly that reason: a
      // story-id read answers with the frame's own story either way, so
      // it would report a success that is not on the page. When the
      // carry fails, both the empty frame here and the poured frame on
      // the other page are removed rather than left as litter.
      const strayed = elsewhere[0];
      const beforeCarry = await doc.renderPage(pageIndex);
      const memoFrame = await doc.textFrame(pageId, MEMO);

      await doc.linkFrames(strayed.id, memoFrame);
      await doc.mutate("resizeFrame", { frameId: strayed.id, bounds: PARKED });
      await doc.setProperty("textFrame", strayed.id, "elementVisible", {
        type: "bool",
        value: false,
      });

      const carried = await settle(
        page,
        async () =>
          (await doc.designer.renderDiffPixels(
            new Uint8Array(beforeCarry),
            new Uint8Array(await doc.renderPage(pageIndex)),
          )) > 64,
        15_000,
      );

      if (carried) {
        covers.push("layout-model.text-frame-chain");
        elements.push(memoFrame);
        placedNote =
          "A native story lowered from the .docx and threaded onto this page. The plugin " +
          "poured it into a frame on another page — it resolves its target as " +
          "`meta.activePage ?? pages[0]` and the engine reports no active page — so the " +
          "showcase threaded that frame into this one and parked the original.";
        notes.push(
          "placeDoc poured into a full-margin frame on another page; the frame was " +
            "threaded into a frame on this page, then shrunk to 6pt and marked invisible, " +
            "so the whole story renders here.",
        );
      } else {
        // The carry failed. Do NOT delete the pour: the lowered story
        // and the container part are the real evidence that a .docx
        // became native Paged content, and they travel with the file
        // whether or not this page can render them. The empty frame
        // here goes (unlink first, so nothing points at a deleted
        // frame), and the poured frame stays where the plugin put it —
        // parked at 6pt and invisible, so it paints nothing on a page
        // that belongs to another spread while its story still exports.
        await doc.mutate("unlinkFrames", { frame: strayed.id });
        await removeRefs(doc, [{ kind: "textFrame", id: memoFrame }]);
        notes.push(
          "the Word document POURED correctly but could not be brought to this page. " +
            "`placeEmbedded` resolves its page as `meta.activePage ?? pages[0]` and the " +
            "engine always answers activePage=null, so the memo landed on another " +
            "spread's page; `MoveNode` (reparenting) is not on the wire; and `linkFrames` " +
            "applies without reflowing — it sets the source frame's NextTextFrame but " +
            "leaves the target's parent_story on its own empty story, so the composer " +
            "renders nothing new (verified here by a 0-pixel render diff). The poured " +
            "frame was parked at 6pt and made invisible rather than deleted, so the " +
            "lowered story and its source part still travel in the exported container.",
        );
        placedNote =
          "The .docx lowered to native paragraphs, character runs and synthesized styles, " +
          "and both that story and the original file travel inside this container — but " +
          "the pour landed on another page, and no operation on the wire can carry a page " +
          "item across pages. The run notes record the three doors that would have to " +
          "change for it to read here.";
      }
    }
  } finally {
    tap.stop();
  }

  elements.push(await labelFrame(doc, pageId, [672, 72, 720, 540], placedNote));

  return {
    title: "paged.doc — a Word document poured into the layout",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
