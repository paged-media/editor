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

// SDK Phase 3 / gallery pixel-parity — Paragraph panel, composed
// to the deep1 card (gallery-deep1.jsx `Paragraph`):
//
//   Align              (stacked label + icon segments)     LIVE
//   [0|0|0]            (3-up indents, sub-labels below)    LIVE
//   [0 pt | 6 pt]      (2-up space metrics)                LIVE
//   [Drop 0 | lines 0] (2-up + "Drop cap" caption)         LIVE
//   Hyphenate          (check row)                         LIVE
//   Align to baseline grid (check row)                     seam
//   Keep options       (disclosure)                        LIVE (v64)
//   Span columns       (disclosure)                        LIVE (v64)
//   Paragraph rules    (disclosure: above / below structs) LIVE (bespoke)
//
// Protocol 64 (2026-10-01) — the keep options, break-before rule and
// span/split columns became settable paragraph paths, so InDesign's
// Keep Options and Span Columns dialogs land here as two collapsible
// sections. "Keep with next" moved into Keep options and became the
// line COUNT it is in IDML (`KeepWithNext` is a count; the wire reads
// and writes `Value::Length`). It used to be a toggle that committed
// `Value::Bool`, which the engine refuses — and since the readback is
// a Length the pill could only ever show mixed.
//
// W2.1 (2026-06-06) — protocol v28 lands the paragraph layout paths
// (gap 12 closed). L/R indents, drop caps, hyphenation and keep
// options flip seam→live here; rule above/below are rendered bespoke
// in paragraph-panel.tsx (whole-struct `Value::ParagraphRule`, which
// no catalog leaf emits). Align-to-baseline-grid stays seamed (no
// matching PropertyPath on the v28 wire). Content-scope; paragraph
// paths round the range to whole paragraphs.

import type { Binding, CompositionNode } from "@paged-media/catalog";
import type { PropertyPath } from "@paged-media/client";
import {
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

/** Content-scope binding over one paragraph path. */
function para(path: PropertyPath): Record<string, Binding> {
  return {
    value: {
      kind: "selectionProperty" as const,
      scope: "content" as const,
      path,
    },
  };
}

/** The "inherit" option every paragraph-level enum select carries: the
 *  engine stores the empty string as "no override", so the paragraph
 *  takes its style's value. */
const STYLE_DEFAULT = { value: "", label: "[Style default]" };

/** Protocol 64 — InDesign's Keep Options dialog, inline. Counts ride
 *  `Value::Length` (integer-as-Length; em-dash = inherited), the
 *  toggles `Value::Bool`, the break-before rule `Value::Text` carrying
 *  the IDML `StartParagraph` string. All reflow-affecting. */
const keepOptionsSection: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Keep options", collapsible: true, defaultOpen: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Keep with next", suffix: "lines" },
      bindings: para("paragraphKeepWithNext"),
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Keep lines together" },
      bindings: para("paragraphKeepLinesTogether"),
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "All lines in paragraph" },
      bindings: para("paragraphKeepAllLinesTogether"),
    },
    {
      // "At start/end of paragraph" — the orphan / widow counts the
      // engine applies while keep-lines is on and all-lines is off.
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, sublabels: ["Start lines", "End lines"] },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Start" },
          bindings: para("paragraphKeepFirstLines"),
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "End" },
          bindings: para("paragraphKeepLastLines"),
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Start paragraph",
        labelPosition: "stack",
        options: [
          STYLE_DEFAULT,
          { value: "Anywhere", label: "Anywhere" },
          { value: "NextColumn", label: "In next column" },
          { value: "NextFrame", label: "In next frame" },
          { value: "NextPage", label: "On next page" },
          { value: "NextOddPage", label: "On next odd page" },
          { value: "NextEvenPage", label: "On next even page" },
        ],
      },
      bindings: para("paragraphStartParagraph"),
    },
  ],
};

/** Protocol 64 — InDesign's Span Columns dialog, inline. The layout
 *  and the column count are `Value::Text` (the count is "All" or a
 *  whole number — an enum-or-number no Length can say); the four
 *  spacings are `Value::Length` in pt. */
const spanColumnsSection: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Span columns", collapsible: true, defaultOpen: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Paragraph layout",
        labelPosition: "stack",
        options: [
          STYLE_DEFAULT,
          { value: "SingleColumn", label: "Single column" },
          { value: "SpanColumns", label: "Span columns" },
          { value: "SplitColumns", label: "Split column" },
        ],
      },
      bindings: para("paragraphSpanColumnType"),
    },
    {
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Columns",
        options: [
          STYLE_DEFAULT,
          { value: "All", label: "All" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
        ],
      },
      bindings: para("paragraphSpanSplitColumnCount"),
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, sublabels: ["Space before", "Space after"] },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: para("paragraphSpanColumnMinSpaceBefore"),
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: para("paragraphSpanColumnMinSpaceAfter"),
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, sublabels: ["Inside gutter", "Outside gutter"] },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size" },
          bindings: para("paragraphSplitColumnInsideGutter"),
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size" },
          bindings: para("paragraphSplitColumnOutsideGutter"),
        },
      ],
    },
  ],
};

export const paragraphComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Paragraph", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
        labelPosition: "stack",
        options: [
          { value: "LeftAlign", label: "ui-align-left" },
          { value: "CenterAlign", label: "ui-align-center" },
          { value: "RightAlign", label: "ui-align-right" },
          { value: "LeftJustified", label: "ui-align-justify" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphJustification",
        },
      },
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: {
        count: 3,
        sublabels: ["L indent", "R indent", "1st indent"],
      },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-left", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphLeftIndent",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-right", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphRightIndent",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-left", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphFirstLineIndent",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphSpaceBefore",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphSpaceAfter",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, caption: "Drop cap" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Drop" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphDropCapCharacters",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Lines" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphDropCapLines",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Hyphenate" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphHyphenation",
        },
      },
    },
    {
      // Engine gap — no align-to-baseline-grid PropertyPath on the
      // v28 wire; stays an honest seam.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Align to baseline grid", seam: true },
      bindings: {},
    },
    keepOptionsSection,
    spanColumnsSection,
  ],
};
