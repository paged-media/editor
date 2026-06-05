// Cockpit — the AI Assistant card (kit inspectors.jsx AIAssistant,
// briefing §12.3: diagnose → propose → apply). VISIBLE BUT INERT:
// there is no LLM backend, so the Fix button, suggestions and the
// prompt field render exactly in the kit's composition but disabled
// — the same honest-seam rule as the command palette's AI group.
// The diagnosis line itself needs the engine's overset/PPI
// accessors before it can be real.

import { Icon } from "../../icons";

const SUGGESTIONS: Array<[string, string]> = [
  ["panel-character", "Shorten text automatically"],
  ["ui-leading", "Adjust spacing to fit"],
  ["ui-flow", "Flow to next frame"],
  ["panel-pages", "Add 1 more page"],
];

export function AIAssistantSeam() {
  return (
    <div
      data-ai-assistant-seam
      style={{
        margin: "0 14px 16px",
        padding: 14,
        borderRadius: "var(--radius-xl)",
        background: "var(--primary-soft)",
        border:
          "1px solid color-mix(in srgb, var(--pg-primary) 26%, transparent)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Icon name="ui-wand" size={17} style={{ color: "var(--pg-primary)" }} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          AI Assistant
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--pg-primary)",
            border:
              "1px solid color-mix(in srgb, var(--pg-primary) 40%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 6px",
          }}
        >
          SOON
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          padding: 11,
          borderRadius: "var(--radius-lg)",
          background: "var(--pg-bg)",
          border: "1px solid var(--pg-border)",
          marginBottom: 12,
          opacity: 0.75,
        }}
      >
        <Icon
          name="ui-wand"
          size={18}
          style={{ color: "var(--pg-muted-fg)", flexShrink: 0, marginTop: 1 }}
        />
        <div
          className="pg-ui-xs"
          style={{ flex: 1, lineHeight: 1.45, color: "var(--pg-fg)" }}
        >
          Diagnosis and one-click fixes (overset, low-resolution images,
          copyfit) land with the AI backend and the engine's preflight
          accessors.
        </div>
      </div>

      <div className="pg-label" style={{ margin: "0 0 8px" }}>
        Suggestions
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          marginBottom: 12,
          opacity: 0.5,
        }}
      >
        {SUGGESTIONS.map(([icon, label]) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 30,
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          >
            <Icon
              name={icon}
              size={15}
              style={{ color: "var(--pg-muted-fg)" }}
            />
            {label}
          </div>
        ))}
      </div>

      <div
        aria-disabled
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          padding: "0 12px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--pg-border)",
          background: "var(--pg-bg)",
          color: "var(--pg-muted-fg)",
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        <Icon name="ui-wand" size={14} style={{ color: "var(--pg-primary)" }} />
        Make this spread more premium…
      </div>
    </div>
  );
}
