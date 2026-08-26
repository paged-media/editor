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

// Page 13 — conditional text.
//
// Conditional text is the feature that lets ONE document be several
// documents: runs tagged `Draft` or `Print-only` are dropped before
// layout rather than hidden after it, so hiding a condition REFLOWS
// the text around it instead of leaving a gap. That distinction is the
// whole point, and it is what this page shows — the same paragraph,
// composed twice, with different runs alive.
//
// The condition DEFINITIONS come from the base fixture because the
// wire has no create-condition op: `SetConditionVisible` and
// `ActivateConditionSet` toggle conditions that already exist, and
// nothing mints one. That is a real gap and the page says so in its
// caption rather than pretending the document authored them.

import type { PageContext, PageReport } from "../types";
import { STYLE } from "../names";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const elements: string[] = [];
  const notes: string[] = [];

  const headBounds: [number, number, number, number] = [72, 72, 108, 540];
  const head = await doc.textFrame(pageId, headBounds);
  const headStory = await doc.storyOf(pageId, headBounds);
  await doc.insertText(headStory, "Conditional text");
  await doc.applyStyle(
    headStory,
    0,
    "Conditional text".length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );
  elements.push(head);

  // The body carries three runs: one unconditional, one that will be
  // tagged, one unconditional again. Tagging the middle run and hiding
  // its condition must close the gap, not leave one.
  const bodyBounds: [number, number, number, number] = [130, 72, 420, 540];
  const body = await doc.textFrame(pageId, bodyBounds);
  const bodyStory = await doc.storyOf(pageId, bodyBounds);
  elements.push(body);

  const lead = "A conditional document is one document that ships as several. ";
  const tagged =
    "This sentence is tagged Draft, and exists only in the internal cut. ";
  const tail =
    "Because a hidden condition is dropped BEFORE composition, the " +
    "surrounding text reflows to close the space — it does not leave a " +
    "hole where the run used to be. That is the difference between " +
    "conditional text and simply colouring something white.";
  const full = lead + tagged + tail;
  await doc.insertText(bodyStory, full);
  await doc.applyStyle(
    bodyStory,
    0,
    full.length,
    await doc.paragraphStyle(STYLE.body),
    "paragraph",
  );

  // Tag the middle run. `appliedConditions` is a StoryRange property,
  // so it is addressed through the generic setElementProperty door
  // rather than a bespoke op.
  const start = lead.length;
  const end = start + tagged.length;
  let conditionName: string | null = null;
  try {
    const conditions = (await doc.designer.collection("conditions")) as Array<{
      selfId: string;
      name?: string;
    }>;
    // The wire keys conditions by SELF-ID (`Condition/Draft`); the
    // display name is prose. Passing the name here was refused as
    // "entry not found" on every prior run — the note that used to
    // sit in the colophon and made both condition ops look unproven.
    const conditionId = conditions[0]?.selfId ?? null;
    conditionName = conditions[0]?.name ?? conditionId;
    if (!conditionId || !conditionName)
      throw new Error("document declares no conditions");
    // `appliedConditions` takes a Value::Text whose payload is a
    // whitespace-separated list of condition ids — and every Value on
    // the wire is adjacently tagged, so a bare string is refused as a
    // malformed message rather than coerced.
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(bodyStory, start, end),
      "appliedConditions",
      { type: "text", value: conditionId },
    );
    // Toggle it off and back on: off proves the drop path composes, on
    // leaves the finished document readable. A page that shipped with
    // its own body text hidden would be a poor advertisement.
    await doc.mutate("setConditionVisible", {
      condition: conditionId,
      visible: false,
    });
    await doc.mutate("setConditionVisible", {
      condition: conditionId,
      visible: true,
    });
    // The set door, same key discipline: activate the fixture's set so
    // BOTH condition ops are exercised for real (they were the last two
    // "unsupported" rows in the capability table).
    const sets = (await doc.designer.collection("conditionSets")) as Array<{
      selfId: string;
    }>;
    if (sets[0]?.selfId) {
      await doc.mutate("activateConditionSet", { set: sets[0].selfId });
    }
  } catch (err) {
    notes.push(
      `condition tagging skipped: ${err instanceof Error ? err.message : String(err)}. ` +
        `Conditions must be DEFINED by the base fixture — the wire has no ` +
        `create-condition op.`,
    );
  }

  const capBounds: [number, number, number, number] = [440, 72, 560, 540];
  const cap = await doc.textFrame(pageId, capBounds);
  const capStory = await doc.storyOf(pageId, capBounds);
  const caption = conditionName
    ? `The middle sentence carries the "${conditionName}" condition. ` +
      "Conditions are DEFINED in the document, not authored over the wire: " +
      "setConditionVisible and activateConditionSet toggle what already " +
      "exists, and no mutation mints a condition. This page's definitions " +
      "come from the generated base fixture."
    : "This document declares no conditions, so nothing could be tagged. " +
      "The wire has no create-condition op — definitions must exist in the " +
      "document before the toggles mean anything.";
  await doc.insertText(capStory, caption);
  await doc.applyStyle(
    capStory,
    0,
    caption.length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );
  elements.push(cap);

  return {
    title: "Conditional text",
    covers: conditionName
      ? [
          "conditional-text.applied-conditions",
          "conditional-text.condition-ops",
          "conditional-text.visibility-filtering",
        ]
      : ["stories-text.text.insert"],
    elements,
    notes,
  };
}
