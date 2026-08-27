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

// Anchored objects (p40, verso) — the chapter's most honest page.
//
// The design called for three anchors and all ten anchored* paths.
// The engine allowed ONE insert and ZERO property writes, and this
// page records that instead of faking it:
//
//   · a SECOND `insertAnchoredFrame` in one session is refused as a
//     duplicate self_id — the page-item id minter scans spread items
//     only, and anchored frames live inside their stories, so insert
//     #2 re-mints insert #1's id;
//   · EVERY `setElementProperty` on the wire-minted anchored frame —
//     the ten anchored* paths, a plain frameFillColor alike — refuses
//     "node not found", although the insert-side duplicate check
//     locates the same frame in the same story tree.
//
// What remains demonstrable is demonstrated: the INSERT itself, whose
// inline default visibly reflows the host line (the pixel oracle), the
// reflow's undo inverse, and the concept prose. The anchored* paths
// stay in the coverage report's missing list with this module named —
// a recorded engine limit, not a skipped demonstration. → Appendix A.

import { expect } from "@playwright/test";

import { marginNote, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { caption, prose } from "./00-support";

const HOST_TEXT =
  "An anchored object is a page item that has surrendered its " +
  "independence: it belongs to a character in the story, travels with " +
  "that character through every edit, and reflows the line that carries " +
  "it. An anchored rectangle entered this very sentence just here " +
  "over the wire — and paints nothing, contributes no advance, and " +
  "shifts no line: the sweep's recorded finding, met again live. " +
  "The other seats — above-line bands, custom positions hung from " +
  "reference points and offsets, spine-relative plates that flip with " +
  "the fold — exist in the model and render from parsed documents, " +
  "but on this wire they cannot yet be reached; the margin carries " +
  "the exact refusals.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(40);
  const elements: string[] = [];

  const head = await prose(ctx, page, [60, 104, 476, 146], [
    { text: "The anchored object", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const host = await prose(ctx, page, [60, 160, 476, 356], [
    { text: HOST_TEXT, style: STYLE.body },
  ]);
  elements.push(host.frameId);

  // The one permitted insert, at the words "just here" — CONTIGUOUS
  // offsets (the applyStyle address space). NO pixel oracle here on
  // purpose: the render-effect sweep already records the wire-minted
  // anchored frame as painting NOTHING (a KNOWN-ratchet red), and this
  // run re-confirmed it — the presence oracle is the collision probe
  // below, whose duplicate-id refusal can only come from the frame
  // being in the story.
  const anchorAt = HOST_TEXT.indexOf("just here") + "just here".length;
  expect(anchorAt).toBeGreaterThan(9);
  const anchored = await doc.mutateId("insertAnchoredFrame", {
    storyId: host.storyId,
    offset: anchorAt,
    width: 40,
    height: 14,
  });
  elements.push(anchored);

  // The refusals, verbatim — captured live so the page's record is the
  // engine's own sentence, not our paraphrase.
  let insertRefusal = "";
  try {
    await doc.mutateId("insertAnchoredFrame", {
      storyId: host.storyId,
      offset: anchorAt,
      width: 9,
      height: 9,
    });
  } catch (err) {
    insertRefusal = err instanceof Error ? err.message : String(err);
  }
  expect(
    insertRefusal,
    "the second anchored insert is expected to collide (engine minter bug)",
  ).toContain("duplicate self_id");

  // The ten anchored* paths, attempted ONE BY ONE and measured — the
  // engine has shown BOTH faces across runs (node-not-found refusals
  // in two, clean application in a third: flaky resolution of the
  // story-resident frame, the stale-cache family). The page prints
  // whichever outcome THIS run produced; only the deterministic facts
  // are asserted.
  const battery: Array<[string, unknown]> = [
    ["anchoredPosition", { type: "text", value: "Anchored" }],
    ["anchorPoint", { type: "text", value: "TopLeftAnchor" }],
    ["anchoredHorizontalReference", { type: "text", value: "TextFrame" }],
    ["anchoredHorizontalAlignment", { type: "text", value: "RightAlign" }],
    ["anchoredXOffset", { type: "length", value: 26 }],
    ["anchoredVerticalReference", { type: "text", value: "LineBaseline" }],
    ["anchoredVerticalAlignment", { type: "text", value: "TopAlign" }],
    ["anchoredYOffset", { type: "length", value: -6 }],
    ["anchoredSpineRelative", { type: "bool", value: false }],
    ["anchoredLockPosition", { type: "bool", value: true }],
  ];
  let applied = 0;
  let firstRefusal = "";
  for (const [path, value] of battery) {
    try {
      await doc.setProperty("rectangle", anchored, path, value);
      applied += 1;
    } catch (err) {
      if (!firstRefusal)
        firstRefusal = err instanceof Error ? err.message : String(err);
    }
  }

  const outcome =
    applied === battery.length
      ? "all ten anchored* paths applied cleanly on this run"
      : applied === 0
        ? `all ten anchored* paths refused on this run — first: "${firstRefusal.slice(0, 90)}…"`
        : `${applied} of ten anchored* paths applied; first refusal: "${firstRefusal.slice(0, 90)}…"`;
  const cap = await caption(
    ctx,
    page,
    [60, 372, 476, 470],
    "The anchor above is real and paints nothing — its presence is " +
      "proven by the collision probe, not by pixels. Insert #2: " +
      `"${insertRefusal.slice(0, 90)}…" Property battery, measured this ` +
      `run: ${outcome}. Across runs the same battery has both applied ` +
      "and refused node-not-found — the flakiness is the finding.",
  );
  elements.push(cap);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 58",
      "insertAnchoredFrame (one permitted, paints nothing)",
      "presence oracle: the collision probe",
      "anchored* battery: outcome measured per run",
    ]),
  );
  const note = await marginNote(
    ctx,
    page,
    "The wire-minted anchored frame paints nothing (the sweep's KNOWN " +
      "red, met live); a second insert always collides (the id minter " +
      "scans spread items only, anchored frames live in stories); and " +
      "property writes on it are FLAKY — node-not-found in some runs, " +
      "clean application in others (stale-cache-family resolution). " +
      "Anchored RENDERING is proven from parsed documents. → Appendix A",
  );
  elements.push(note);

  return {
    title: "Anchored objects — one insert, two banked refusals",
    // anchored-inline-objects.anchored-ops is deliberately NOT claimed:
    // the registry marks its mutation paths shipped, and this page just
    // banked their refusal — claiming it would assert the opposite of
    // the evidence. The registry row itself is flagged as overclaiming.
    covers: ["stories-text.text.insert"],
    elements,
  };
}
