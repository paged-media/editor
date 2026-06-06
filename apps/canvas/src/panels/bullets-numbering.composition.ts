// W2.4 (2026-06-06) — Bullets & Numbering panel, composed to the
// gallery "Bullets & Numbering" card's top rows. Protocol v28 lands
// the list-authoring text paths (`paragraphListType` +
// `paragraphBulletCharacter` + `paragraphNumberingFormat`), so the
// list-type segment flips seam→live here.
//
// List type rides the declarative toggle group: `ToggleGroupLeaf`
// reads/writes a `Value::Text`, and the engine carries the IDML enum
// string verbatim (`NoList` / `BulletList` / `NumberedList`). The
// bullet glyph + numbering-format fields are free text (no catalog
// leaf emits a bare text field), so they are hand-wired in
// bullets-panel.tsx over the same content-scope bindings.
//
// Content-scope bindings; the apply layer rounds the StoryRange to
// whole paragraphs (list type is a paragraph attribute). The list
// definition / level / restart / position rows from the gallery wait
// on a list-definition surface on the paragraph model and stay honest
// seams in the panel.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const bulletsNumberingComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Bullets & numbering", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "List type",
        options: [
          { value: "NoList", label: "None" },
          { value: "BulletList", label: "Bullet" },
          { value: "NumberedList", label: "Number" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphListType",
        },
      },
    },
  ],
};
