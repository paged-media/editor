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

// Phase F — ONE vocabulary for "this doesn't apply here".
//
// The 2026-08-22 audit found context-sensitivity was not a gap but FOUR
// rules, one per surface, each defensible alone and incoherent together:
//
//   tool rail        dims to 0.35 and stays CLICKABLE — picking it
//                    leaves the context and does the thing
//   context toolbar  replaces its left segment with prose
//                    ("Editing sheet — no canvas tools apply here")
//   Window menu      greys the item, label still readable
//   menu bar         nothing at all
//
// A designer cannot build a mental model from that, because each surface
// teaches a different rule. The problem was never which pattern to pick;
// it is that four were picked, independently, each one reasonable.
//
// THE THREE STATES. Every surface uses these and only these:
//
//   "here"      applies right now. Normal.
//
//   "elsewhere" applies, but not where you are standing. The TREATMENT
//               depends on the surface kind (see SurfaceKind): hidden on
//               a palette the eye scans, greyed-but-clickable on the
//               menu bar, which is navigated by position. The rail
//               invented the greyed-and-clickable escape hatch and it is
//               right — until 57 of 60 tools take it, at which point it
//               is a wall of grey rather than a hatch.
//
//   "absent"    does not exist yet. Disabled, and badged `soon` where
//               the surface has room. MenuBar already draws this
//               distinction deliberately — a `soon` badge means "not
//               built"; a false `when` means "not here" — and the rest
//               of the app should adopt that rather than reinvent it.
//
// WHY A MODULE AND NOT A CONVENTION. Because a convention is exactly
// what produced the four rules. Four independent right-looking decisions
// drifted apart over time and nothing could notice, since there was no
// single thing for them to disagree with. There is now.

export type Applicability = "here" | "elsewhere" | "absent";

/** What KIND of surface is rendering the state, because the right
 *  treatment for `elsewhere` differs between them and a single rule is
 *  wrong for one of them.
 *
 *  `"palette"` — a surface the eye SCANS: the tool rail, panel lists,
 *  the command palette. The user is searching, so every inapplicable
 *  item costs. Inapplicable items are HIDDEN.
 *
 *  `"map"` — a surface navigated by POSITION: the menu bar. Muscle
 *  memory goes to a location, so hiding makes the bar jump and File /
 *  Edit / View move under the hand. Inapplicable items are GREYED.
 *
 *  THIS SPLIT REPLACES A UNIFORM RULE, and the numbers are why. The rail
 *  holds 60 tools (28 built-in + 19 draw + 13 image). Inside `sheet`,
 *  whose context declares `toolIds: []`, ALL 60 would dim; inside draw's
 *  own `vectorGraphic`, which declares 3 of draw's 19, 57 would. Dimming
 *  is an escape hatch when a few things do not apply and a wall of grey
 *  when almost nothing does — it makes the context read as a degraded
 *  version of the app rather than a place with its own tools.
 *
 *  Hiding suits scanning; greying suits pointing. */
export type SurfaceKind = "palette" | "map";

export interface ApplicabilityStyle {
  /** Render at all. False only for `elsewhere` on a palette. */
  visible: boolean;
  opacity: number;
  /** False only for `absent`. A greyed `elsewhere` on a MAP stays
   *  interactive on purpose — clicking it leaves the context and does
   *  the thing, which is the escape hatch the rail invented. */
  interactive: boolean;
  /** Emitted as `data-applies`, so a spec asserts the decision the
   *  surface made rather than inferring it from a computed opacity. */
  attr: Applicability;
}

export function applicabilityStyle(
  state: Applicability,
  surface: SurfaceKind,
): ApplicabilityStyle {
  if (state === "here") {
    return { visible: true, opacity: 1, interactive: true, attr: "here" };
  }
  if (state === "absent") {
    return { visible: true, opacity: 0.45, interactive: false, attr: "absent" };
  }
  return surface === "palette"
    ? { visible: false, opacity: 0, interactive: false, attr: "elsewhere" }
    : // 0.35 is the rail's original value, kept for the surfaces that
      // still dim so this DESCRIBES what shipped rather than restyling
      // something that was already right.
      { visible: true, opacity: 0.35, interactive: true, attr: "elsewhere" };
}

/** Tools that stay visible in a palette however narrow the context is.
 *
 *  These are NAVIGATION AND INSPECTION, not authoring, which is why a
 *  content type narrowing its authoring tools has no business hiding
 *  them. InDesign's isolation mode keeps exactly this set.
 *
 *  Selection is the universal "get me out": with it and the breadcrumb's
 *  Esc button, hiding costs nothing because leaving is never more than
 *  one obvious click. Hand and Zoom are how you look at the thing you
 *  are editing, in any context.
 *
 *  Direct Selection earns its place for a sharper reason. It is what
 *  `Cmd`-hold spring-loads, and a spring-load PUSHES the tool whether or
 *  not the context lists it — so hiding it produced an app where holding
 *  Cmd activated a tool with no slot to activate. Found by the K-1 modal
 *  session spec, which uses that slot going active as its witness that
 *  the override engaged, and which went red the moment the slot stopped
 *  existing. The test was right and the hiding rule was incomplete. */
export const ALWAYS_IN_PALETTE: readonly string[] = [
  "paged.tool.select",
  "paged.tool.directSelect",
  "paged.tool.hand",
  "paged.tool.zoom",
];

/** Resolve a surface item's state.
 *
 *  `exists` false ⇒ `absent`, whatever the context says: a control for
 *  an unbuilt feature does not become applicable by standing somewhere
 *  else. Order matters here and is the whole of the logic. */
export function applicabilityOf(opts: {
  exists: boolean;
  appliesHere: boolean;
  /** Skips the context narrowing — see {@link ALWAYS_IN_PALETTE}. */
  id?: string;
}): Applicability {
  if (!opts.exists) return "absent";
  if (opts.id && ALWAYS_IN_PALETTE.includes(opts.id)) return "here";
  return opts.appliesHere ? "here" : "elsewhere";
}

/** Tooltip suffix, so every surface explains the state the same way. */
export function applicabilityHint(state: Applicability): string {
  switch (state) {
    case "elsewhere":
      return " — leaves this context";
    case "absent":
      return " — coming soon";
    default:
      return "";
  }
}
