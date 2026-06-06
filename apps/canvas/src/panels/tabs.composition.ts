// W2.4 (2026-06-06) — Tabs panel composition. The Tabs ruler is a
// bespoke whole-list editor (see tabs-panel.tsx): protocol v28's
// `paragraphTabStops` path replaces the paragraph's entire
// `<TabList>` in one op (`Value::TabStops(TabStopSpec[])`), the
// gradient-feather stop-list precedent — `Value` has no per-element
// list-edit form, so the panel commits the full new stop list per
// change.
//
// No catalog leaf models a variable-length struct list, so this file
// carries only the section wrapper that gives the panel its
// `data-section` hook; every stop row is hand-wired in the panel over
// the single content-scope `paragraphTabStops` binding.

import type { CompositionNode } from "@paged-media/catalog";
import { PAGED_LAYOUT_SECTION } from "@paged-media/shell";

export const tabsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Tabs", heading: false },
  bindings: {},
  children: [],
};
