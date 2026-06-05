// Panel-gallery pass — Object Export Options (EPUB / accessible-PDF
// output surface; INDESIGN_PARITY.md ●● in scope). CONCEPT with a
// LIVE tab switcher (local UI state): per-object alt text,
// tagged-PDF role and EPUB/HTML conversion wait on export-metadata
// writes against the element model.

import { useState } from "react";

import { ConceptShell, Row, SeamSelect, SeamSwitch } from "./concept-kit";

type ExportTab = "Alt Text" | "Tagged PDF" | "EPUB & HTML";

const TABS: ExportTab[] = ["Alt Text", "Tagged PDF", "EPUB & HTML"];

export function ObjectExportPanel() {
  const [tab, setTab] = useState<ExportTab>("Alt Text");
  return (
    <ConceptShell
      testId="object-export-panel"
      target="Per-object alt text (source: custom/XMP/structure), tagged-PDF role (Figure/Artifact), EPUB/HTML conversion + CSS class — feeds accessible PDF + EPUB output."
    >
      {/* Tab switcher is live local state; the fields are seams. */}
      <div
        className="flex border-b border-input"
        role="tablist"
        data-object-export-tabs
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-export-tab={t}
            data-active={tab === t ? "true" : "false"}
            onClick={() => setTab(t)}
            className="text-xs px-2.5 h-[28px] border-0 bg-transparent cursor-pointer"
            style={{
              color: tab === t ? "var(--pg-primary)" : "var(--pg-muted-fg)",
              boxShadow:
                tab === t ? "inset 0 -2px 0 var(--pg-primary)" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Alt Text" && (
        <>
          <Row label="Source">
            <SeamSelect value="Custom" />
          </Row>
          <div className="text-xs text-muted-foreground">
            Alt text (read by screen readers)
          </div>
          <textarea
            disabled
            data-seam
            placeholder="—"
            className="w-full h-[64px] text-xs p-2 rounded-[6px] border border-input bg-background text-muted-foreground opacity-55 resize-none"
          />
        </>
      )}
      {tab === "Tagged PDF" && (
        <>
          <Row label="Apply tag">
            <SeamSelect value="Based on object" />
          </Row>
          <Row label="Role">
            <SeamSelect value="Figure" />
          </Row>
          <Row label="Actual text">
            <SeamSelect value="From structure" />
          </Row>
          <Row label="Use as artifact">
            <SeamSwitch />
          </Row>
        </>
      )}
      {tab === "EPUB & HTML" && (
        <>
          <Row label="Layout">
            <SeamSelect value="Inline / reflow" />
          </Row>
          <Row label="Convert">
            <SeamSelect value="Optimized (PNG)" />
          </Row>
          <Row label="Resolution">
            <SeamSelect value="150 PPI" />
          </Row>
          <Row label="CSS class">
            <SeamSelect value=".figure" />
          </Row>
          <Row label="Preserve look">
            <SeamSwitch on />
          </Row>
        </>
      )}
    </ConceptShell>
  );
}
