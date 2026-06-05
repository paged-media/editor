// Panel-gallery pass — the Table panel (InDesign-parity ●●●,
// gallery "Table" card). Pure CONCEPT: every control waits on the
// Table NodeId surface (engine gap 8 — table selection + ops);
// Cell/Table Styles already list the document's table resources.

import {
  ConceptShell,
  Kicker,
  Row,
  SeamNum,
  SeamSeg,
  SeamSelect,
  SeamSwitch,
} from "./concept-kit";

export function TablePanel() {
  return (
    <ConceptShell
      testId="table-panel"
      target="Live Table panel: rows/cols, alternating strokes & fills, header/footer rows, cell insets, diagonals — lands with the engine's table selection surface (gap 8)."
    >
      <div className="pg-label">Dimensions</div>
      <Row label="Rows">
        <SeamNum value="—" icon="ui-rows" />
      </Row>
      <Row label="Columns">
        <SeamNum value="—" icon="ui-cols-2" />
      </Row>
      <Row label="Row height">
        <div className="grid grid-cols-[1fr_72px] gap-1">
          <SeamSelect value="At least" />
          <SeamNum value="—" />
        </div>
      </Row>
      <Row label="Col width">
        <SeamNum value="—" icon="ui-size" />
      </Row>
      <Kicker>Alternating</Kicker>
      <Row label="Fills">
        <SeamSelect value="Every other row" />
      </Row>
      <Row label="Strokes">
        <SeamSelect value="Horizontal" />
      </Row>
      <Row label="Header rows">
        <SeamSwitch on />
      </Row>
      <Row label="Footer rows">
        <SeamSwitch />
      </Row>
      <Kicker>Cells</Kicker>
      <Row label="Cell inset">
        <SeamNum value="—" icon="ui-size" />
      </Row>
      <Row label="Vert. justify">
        <SeamSeg options={["Top", "Center", "Bottom"]} active="Top" />
      </Row>
    </ConceptShell>
  );
}
