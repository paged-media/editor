// Cockpit — the document title bar atop the canvas column (kit
// canvas.jsx CanvasArea header): name · dirty state · a mode badge
// outside Design. All real: documentName + dirty from the worker's
// DocumentMeta, the badge from the mode registry.

import { useDocumentMeta } from "../../catalog/use-collection";
import { useWorkflowMode } from "../../state/workflow-mode-context";
import { useRegistries } from "../../state/registries-context";

export function DocTitleBar() {
  const meta = useDocumentMeta();
  const { mode } = useWorkflowMode();
  const registries = useRegistries();
  const modeTitle = registries.modes.get(mode)?.title;
  const loaded = meta != null && meta.pageCount > 0;

  return (
    <div
      data-doc-title-bar
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 14px",
        background: "var(--chrome-panel-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans)",
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {loaded ? meta.documentName || "Untitled document" : "No document"}
      </span>
      {loaded && meta.dirty && (
        <span style={{ fontSize: 11.5, color: "var(--pg-muted-fg)" }}>
          Edited
        </span>
      )}
      {mode !== "design" && modeTitle && (
        <span
          data-doc-title-mode-badge
          style={{
            marginLeft: 8,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--pg-primary)",
            border:
              "1px solid color-mix(in srgb, var(--pg-primary) 35%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 7px",
          }}
        >
          {modeTitle}
        </span>
      )}
    </div>
  );
}
