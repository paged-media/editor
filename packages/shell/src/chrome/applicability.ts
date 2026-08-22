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
//   "elsewhere" applies, but not where you are standing — and acting on
//               it LEAVES for where it does apply. Dimmed and still
//               interactive. This is the important one and the rail
//               invented it: an escape hatch, not a wall. Someone who
//               clicks the Rectangle tool inside a sheet almost
//               certainly means "leave the sheet and draw a rectangle",
//               and the rail already does exactly that.
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

/** The visual treatment for a state. Numbers rather than class names so
 *  the inline-style surfaces (rail, toolbar) and the class-based ones
 *  (menus) can both honour it without one of them having to convert. */
export interface ApplicabilityStyle {
  opacity: number;
  /** False only for `absent`. `elsewhere` stays interactive ON PURPOSE —
   *  that is what makes it an escape hatch instead of a wall. */
  interactive: boolean;
  /** Goes on the element as `data-applies`, so a spec (and the F4 guard)
   *  can assert the state a surface decided on rather than infer it from
   *  a computed opacity. */
  attr: Applicability;
}

export const APPLICABILITY: Record<Applicability, ApplicabilityStyle> = {
  here: { opacity: 1, interactive: true, attr: "here" },
  // 0.35 is the rail's existing value, kept so this module DESCRIBES what
  // already shipped rather than restyling a surface that was already
  // right. Standardising on the outlier would have made the one correct
  // implementation the one that changed.
  elsewhere: { opacity: 0.35, interactive: true, attr: "elsewhere" },
  absent: { opacity: 0.45, interactive: false, attr: "absent" },
};

/** Resolve a surface item's state.
 *
 *  `exists` false ⇒ `absent`, whatever the context says: a control for
 *  an unbuilt feature does not become applicable by standing somewhere
 *  else. Order matters here and is the whole of the logic. */
export function applicabilityOf(opts: {
  exists: boolean;
  appliesHere: boolean;
}): Applicability {
  if (!opts.exists) return "absent";
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
