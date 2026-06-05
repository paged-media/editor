// Panel-gallery pass — the Bullets & Numbering panel
// (InDesign-parity ●●●, gallery "Bullets & Numbering" card). Pure
// CONCEPT: list definitions, level nesting, number format, restart
// and position wait on a list-definition surface in the paragraph
// model.

import {
  ConceptShell,
  Kicker,
  Row,
  SeamNum,
  SeamSeg,
  SeamSelect,
} from "./concept-kit";

export function BulletsPanel() {
  return (
    <ConceptShell
      testId="bullets-panel"
      target="List type, level, glyph/number format, restart, tab position, convert-to-text — lands with list definitions on the paragraph model."
    >
      <Row label="List type">
        <SeamSeg options={["None", "Bullet", "Number"]} active="Number" />
      </Row>
      <Row label="List">
        <SeamSelect value="[Default]" />
      </Row>
      <Row label="Level">
        <SeamNum value="1" />
      </Row>
      <Kicker>Numbering style</Kicker>
      <Row label="Format">
        <SeamSelect value="1, 2, 3, 4…" />
      </Row>
      <Row label="Number">
        <SeamNum value="^#.^t" />
      </Row>
      <Row label="Char style">
        <SeamSelect value="[None]" />
      </Row>
      <Row label="Restart">
        <SeamSelect value="At this level" />
      </Row>
      <Kicker>Position</Kicker>
      <Row label="Alignment">
        <SeamSeg options={["Left", "Center", "Right"]} active="Left" />
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
    </ConceptShell>
  );
}
