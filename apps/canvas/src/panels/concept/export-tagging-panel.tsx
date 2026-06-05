// Panel-gallery pass — Export Tagging (EPUB / accessible-PDF
// output surface; INDESIGN_PARITY.md ●● in scope). CONCEPT with a
// LIVE scope toggle (local UI state): mapping each paragraph/
// character style to an HTML tag + CSS class + PDF tag waits on
// style-level export-metadata writes.

import { useState } from "react";

import {
  ConceptShell,
  Kicker,
  Row,
  SeamSelect,
  SeamSwitch,
} from "./concept-kit";

type Scope = "Paragraph" | "Character";

export function ExportTaggingPanel() {
  const [scope, setScope] = useState<Scope>("Paragraph");
  const para = scope === "Paragraph";
  return (
    <ConceptShell
      testId="export-tagging-panel"
      target="Map each paragraph/character style to an HTML tag + CSS class (and PDF tag) for clean EPUB/HTML and tagged PDF."
    >
      <div
        className="inline-flex w-full overflow-hidden rounded-[6px] border border-input"
        role="group"
        data-tagging-scope
      >
        {(["Paragraph", "Character"] as Scope[]).map((s, i) => (
          <button
            key={s}
            type="button"
            data-scope={s}
            data-active={scope === s ? "true" : "false"}
            onClick={() => setScope(s)}
            className="flex-1 text-xs h-[27px] border-0 cursor-pointer"
            style={{
              borderRight: i === 0 ? "1px solid var(--pg-border)" : "none",
              background:
                scope === s ? "var(--chrome-slot-active)" : "var(--pg-bg)",
              color:
                scope === s
                  ? "var(--chrome-icon-active)"
                  : "var(--pg-muted-fg)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <Row label="Style">
        <SeamSelect value="—" />
      </Row>
      <Kicker>EPUB &amp; HTML</Kicker>
      <Row label="Tag">
        <SeamSelect value={para ? "p" : "span"} />
      </Row>
      <Row label="Class">
        <SeamSelect value="—" />
      </Row>
      <Row label="EPUB:type">
        <SeamSelect value={para ? "bodymatter" : "—"} />
      </Row>
      <Row label="Emit CSS">
        <SeamSwitch on />
      </Row>
      <Kicker>Tagged PDF</Kicker>
      <Row label="PDF tag">
        <SeamSelect value={para ? "P" : "Span"} />
      </Row>
      {/* The gallery code preview — static illustration. */}
      <div
        data-seam
        data-tagging-preview
        className="rounded-[6px] border border-input px-2.5 py-2 opacity-70 pg-value text-[11px]"
        style={{ background: "var(--canvas-surround, var(--pg-muted))" }}
      >
        {para ? '<p class="…">…</p>' : '<span class="…">…</span>'}
      </div>
    </ConceptShell>
  );
}
