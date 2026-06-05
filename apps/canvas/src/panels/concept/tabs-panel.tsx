// Panel-gallery pass — the Tabs panel (InDesign-parity ●●●,
// gallery "Tabs" card). Pure CONCEPT: the ruler with L/C/R/decimal
// stops, leader string and align-on character wait on a tab-stop
// surface in the paragraph model.

import { ConceptShell, Row, SeamNum, SeamSeg } from "./concept-kit";

/** Static illustration of the stop ruler — inert by design. */
function SeamRuler() {
  const stops = [18, 42, 64];
  return (
    <div
      data-seam
      data-tabs-ruler
      className="relative h-[30px] rounded-[6px] border border-input bg-background opacity-55 overflow-hidden"
      title="Tab ruler — awaiting engine support"
    >
      {/* grid ticks */}
      {Array.from({ length: 19 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${(i + 1) * 5}%`,
            background: "var(--pg-border)",
            opacity: i % 4 === 3 ? 1 : 0.45,
          }}
        />
      ))}
      {/* stop markers */}
      {stops.map((pct) => (
        <span
          key={pct}
          className="absolute bottom-[3px]"
          style={{
            left: `${pct}%`,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: "8px solid var(--pg-muted-fg)",
            transform: "translateX(-5px)",
          }}
        />
      ))}
    </div>
  );
}

export function TabsPanel() {
  return (
    <ConceptShell
      testId="tabs-panel"
      target="The InDesign Tabs ruler: L/C/R/decimal stops, leader string, align-on character, repeat — lands with tab-stop reads/writes on the paragraph model."
    >
      <Row label="Alignment">
        <SeamSeg
          options={["Left", "Center", "Right", "Decimal"]}
          active="Left"
        />
      </Row>
      <Row label="Position">
        <SeamNum value="—" icon="ui-size" />
      </Row>
      <SeamRuler />
      <Row label="Leader">
        <SeamNum value="" />
      </Row>
      <Row label="Align on">
        <SeamNum value="." />
      </Row>
      <button
        type="button"
        disabled
        data-seam
        title="Repeat tab — awaiting engine support"
        className="text-xs h-[28px] rounded-[6px] border border-input bg-background text-muted-foreground opacity-55 self-start px-3"
      >
        Repeat tab
      </button>
    </ConceptShell>
  );
}
