// W3.2 — the edit-context BREADCRUMB (closes plugin-draw B-02 /
// plugin-web W-03). Renders the entered-context stack root→top as a
// trail; clicking a crumb pops back to that level, Esc pops one. Shows
// nothing when no context is active (the default editing surface is
// unchanged — an honest seam, never chrome-when-idle).
//
// The crumb labels are the context TYPE title-cased (`vectorGraphic` →
// "Vector graphic"); the plugin owns no label string (the type IS the
// identity, kept minimal). Selection-magenta accent marks the active
// (top) crumb — the DTP "you are editing inside this" cue.

import { useEditContextStack } from "../state/edit-context-stack";

/** `vectorGraphic` → `Vector graphic`; `webFrame` → `Web frame`. */
function titleCase(type: string): string {
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function EditContextBreadcrumb() {
  const { breadcrumb, pop } = useEditContextStack();
  if (breadcrumb.length === 0) return null;

  // Pop back to (and including) the clicked level: pop until that crumb
  // is the top. Clicking the LAST (active) crumb pops it (exits one).
  const popTo = (index: number) => {
    const popsNeeded = breadcrumb.length - index;
    for (let i = 0; i < popsNeeded; i++) pop();
  };

  return (
    <nav
      data-edit-context-breadcrumb
      aria-label="Edit context"
      style={barStyle}
    >
      <span className="pg-ui-xs" style={kickerStyle}>
        Editing
      </span>
      {breadcrumb.map((frame, i) => {
        const isActive = i === breadcrumb.length - 1;
        return (
          <span key={`${frame.type}:${i}`} style={crumbWrapStyle}>
            {i > 0 && (
              <span aria-hidden style={sepStyle}>
                ›
              </span>
            )}
            <button
              type="button"
              data-edit-context-crumb={frame.type}
              data-active={isActive ? "true" : undefined}
              onClick={() => popTo(i)}
              style={{
                ...crumbStyle,
                color: isActive ? "var(--overlay-selection, #d4127a)" : "var(--pg-muted-fg)",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {titleCase(frame.label)}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        data-edit-context-exit
        onClick={() => pop()}
        title="Exit edit context (Esc)"
        style={exitStyle}
      >
        Esc
      </button>
    </nav>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2, 6px)",
  height: 28,
  padding: "0 var(--space-3, 10px)",
  borderBottom: "1px solid var(--chrome-border, rgba(255,255,255,0.08))",
  background: "var(--chrome-bg, transparent)",
  fontSize: 12,
};

const kickerStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-wide, 0.06em)",
  color: "var(--pg-muted-fg)",
  marginRight: 2,
};

const crumbWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2, 6px)",
};

const crumbStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "2px 4px",
  cursor: "pointer",
  font: "inherit",
};

const sepStyle: React.CSSProperties = {
  color: "var(--pg-muted-fg)",
  opacity: 0.6,
};

const exitStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "none",
  border: "1px solid var(--chrome-border, rgba(255,255,255,0.12))",
  borderRadius: "var(--radius-1, 4px)",
  padding: "1px 6px",
  fontSize: 11,
  color: "var(--pg-muted-fg)",
  cursor: "pointer",
};
