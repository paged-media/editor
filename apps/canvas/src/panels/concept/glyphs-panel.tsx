// Panel-gallery pass — the Glyphs panel (InDesign-parity ●●●,
// gallery "Glyphs" card). PARTIALLY LIVE: clicking a glyph with an
// active text caret inserts the character through the real
// `insertText` mutation (undoable, same op the keyboard rides);
// without a caret the grid renders inert (you can't insert into
// nothing). Recently-used is panel-local state. The font scope
// selects, OpenType-feature filter and alternates flyout wait on
// the engine's font registry (Show = Entire Font only).

import { useState } from "react";

import { useCanvasClient, useContentSelection } from "@paged-media/shell";

import { ConceptShell, Row, SeamSelect } from "./concept-kit";

/** The gallery grid — punctuation, legal marks, fractions,
 *  currency; the full character map lands with the font registry. */
const GLYPHS = [
  "–",
  "—",
  "·",
  "“",
  "”",
  "‘",
  "’",
  "…",
  "a",
  "á",
  "à",
  "â",
  "ä",
  "ã",
  "@",
  "&",
  "%",
  "¶",
  "§",
  "†",
  "‡",
  "©",
  "®",
  "™",
  "½",
  "¼",
  "¾",
  "°",
  "€",
  "£",
  "¥",
  "#",
];

export function GlyphsPanel() {
  const client = useCanvasClient();
  const { contentSelection } = useContentSelection();
  const [recent, setRecent] = useState<string[]>([]);
  const caret = contentSelection != null;

  const insert = (glyph: string) => {
    if (!contentSelection) return;
    void client
      .mutate({
        op: "insertText",
        args: {
          storyId: contentSelection.storyId,
          offset: contentSelection.end,
          text: glyph,
        },
      })
      .then(() => {
        setRecent((prev) =>
          [glyph, ...prev.filter((g) => g !== glyph)].slice(0, 8),
        );
      })
      .catch(() => {});
  };

  const grid = (glyphs: string[], testId: string) => (
    <div
      className="grid grid-cols-8 gap-[3px]"
      data-glyph-grid={testId}
      data-caret={caret ? "true" : "false"}
    >
      {glyphs.map((g, i) => (
        <button
          key={`${g}-${i}`}
          type="button"
          disabled={!caret}
          data-glyph={g}
          title={caret ? `Insert ${g}` : "Place a text caret to insert glyphs"}
          onClick={() => insert(g)}
          className="aspect-square rounded-[5px] border border-input bg-background text-[15px] leading-none flex items-center justify-center cursor-pointer disabled:cursor-default disabled:opacity-45 hover:bg-muted/60"
          style={{ fontFamily: "var(--font-serif, serif)" }}
        >
          {g}
        </button>
      ))}
    </div>
  );

  return (
    <ConceptShell
      testId="glyphs-panel"
      live
      target="Insert any glyph of any font: full character map, OpenType-feature filter, alternates flyout, glyph sets — the grid inserts via insertText today; font scope lands with the engine's font registry."
    >
      <Row label="Show">
        <SeamSelect value="Entire Font" />
      </Row>
      <Row label="Font">
        <div className="grid grid-cols-[1fr_84px] gap-1">
          <SeamSelect value="—" />
          <SeamSelect value="—" />
        </div>
      </Row>
      {!caret && (
        <div className="text-xs text-muted-foreground italic" data-glyphs-hint>
          Place a text caret to insert glyphs.
        </div>
      )}
      {recent.length > 0 && (
        <>
          <div className="pg-label">Recently used</div>
          {grid(recent, "recent")}
        </>
      )}
      <div className="pg-label">Glyphs</div>
      {grid(GLYPHS, "all")}
    </ConceptShell>
  );
}
