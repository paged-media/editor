// W2.4 (2026-06-06) — Bullets & Numbering panel. LIVE on the W0.2
// wire: protocol v28's list-authoring text paths
// (`paragraphListType` + `paragraphBulletCharacter` +
// `paragraphNumberingFormat`) flip the gallery's List type segments
// and the bullet glyph / numbering format fields seam→live.
//
// List type rides the declarative composition (a ToggleGroupLeaf over
// `Value::Text`). The bullet glyph + numbering format are free text,
// which no catalog leaf emits, so they are hand-wired here over the
// same content-scope bindings on the effects-panel / paragraph-rules
// precedent — a single `setElementProperty` mutate per commit
// (Enter / blur), undoable. Content scope; the apply layer rounds the
// StoryRange to whole paragraphs.
//
// The gallery's List definition / Level / numbering style picker /
// Char style / Restart / Position rows wait on a list-definition
// surface on the paragraph model (the run carries only the type +
// glyph + format expression today), so they stay honest seams.

import {
  CatalogRegistryProvider,
  CompositionRenderer,
  useBindings,
} from "@paged-media/shell";
import type { Value } from "@paged-media/client";

import { appCatalogRegistry } from "../catalog-registry";
import { bulletsNumberingComposition } from "../bullets-numbering.composition";
import { Kicker, Row, SeamNum, SeamSelect } from "./concept-kit";

const TEXT_BINDINGS = {
  bullet: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphBulletCharacter" as const,
  },
  format: {
    kind: "selectionProperty" as const,
    scope: "content" as const,
    path: "paragraphNumberingFormat" as const,
  },
};

/** Unwrap a `Value::Text` to its string (empty = cleared override). */
function unwrapText(v: Value | null): string {
  if (!v || v.type !== "text") return "";
  return v.value;
}

/** Kit-styled bare text field bound to a `Value::Text` content path.
 *  Commits the whole string on Enter / blur (one mutate per commit);
 *  an empty string clears the per-paragraph override on the engine
 *  side. Disabled (no commit) when there is no content selection. */
function TextField({
  testId,
  value,
  placeholder,
  mono,
  disabled,
  onCommit,
}: {
  testId: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  onCommit?: (next: Value) => void;
}) {
  const commit = (raw: string) => {
    if (disabled) return;
    if (raw === value) return;
    onCommit?.({ type: "text", value: raw } as Value);
  };
  return (
    <input
      data-bullets-field={testId}
      defaultValue={value}
      // Re-key on the resolved value so an external change (undo /
      // selection switch) re-seeds the uncontrolled field.
      key={value}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      onBlur={(e) => commit(e.target.value)}
      aria-label={testId}
      className="h-[28px] w-full rounded-[6px] border border-input bg-background px-2 text-[11.5px] text-foreground disabled:opacity-55"
      style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)" }}
    />
  );
}

export function BulletsPanel() {
  const text = useBindings(TEXT_BINDINGS);
  const bullet = unwrapText(text.bullet.value);
  const format = unwrapText(text.format.value);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <div
        className="flex flex-col gap-2 p-3"
        data-bullets-panel="ready"
      >
        {/* LIVE — list type segment (paragraphListType). */}
        <CompositionRenderer composition={bulletsNumberingComposition} />

        {/* List definition + level await a list-definition surface. */}
        <Row label="List">
          <SeamSelect value="[Default]" />
        </Row>
        <Row label="Level">
          <SeamNum value="1" />
        </Row>

        <Kicker>Numbering style</Kicker>
        {/* Format picker (1,2,3 vs i,ii,iii…) needs the list
            definition model; the raw expression below is live. */}
        <Row label="Style">
          <SeamSelect value="1, 2, 3, 4…" />
        </Row>
        <Row label="Number">
          {/* LIVE — paragraphNumberingFormat (e.g. "^#.^t"). */}
          <TextField
            testId="numbering-format"
            value={format}
            placeholder="^#.^t"
            mono
            disabled={text.format.onCommit == null}
            onCommit={text.format.onCommit}
          />
        </Row>
        <Row label="Char style">
          <SeamSelect value="[None]" />
        </Row>
        <Row label="Restart">
          <SeamSelect value="At this level" />
        </Row>

        <Kicker>Bullet</Kicker>
        <Row label="Glyph">
          {/* LIVE — paragraphBulletCharacter (the glyph itself). */}
          <TextField
            testId="bullet-character"
            value={bullet}
            placeholder="•"
            disabled={text.bullet.onCommit == null}
            onCommit={text.bullet.onCommit}
          />
        </Row>

        <Kicker>Position</Kicker>
        <Row label="Alignment">
          <SeamSelect value="Left" />
        </Row>
        <Row label="Indent">
          <SeamNum value="—" icon="ui-size" />
        </Row>
        <Row label="Tab">
          <SeamNum value="—" icon="ui-size" />
        </Row>

        {/* The gallery preview box — static illustration. */}
        <div
          data-seam
          data-bullets-preview
          className="rounded-[7px] border border-input bg-background px-3 py-2 opacity-70"
          style={{
            fontFamily: "var(--font-serif, serif)",
            fontSize: 12.5,
            lineHeight: 1.7,
          }}
        >
          <div>1.&emsp;Solid oak frame</div>
          <div>2.&emsp;Natural oil finish</div>
        </div>
      </div>
    </CatalogRegistryProvider>
  );
}
