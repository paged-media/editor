// Design system (publishing cockpit) — the 44px context toolbar
// between the header and the body row. The LEFT segment is
// mode-aware (the active ModeContribution's `toolbarLeft`); the
// RIGHT side carries the constant view pills (screen-mode cluster
// lives in the rail foot today — this keeps the seam for the kit's
// Overview/Spread/Story/Focus pills without duplicating it yet).

import type { ReactNode } from "react";

import { useRegistries } from "../state/registries-context";
import { useWorkflowMode } from "../state/workflow-mode-context";

export interface ContextToolbarProps {
  /** Editor handle threaded into the mode's toolbar segment. */
  paged: unknown;
  /** Constant right-side controls (app-supplied view pills). */
  right?: ReactNode;
}

export function ContextToolbar({ paged, right }: ContextToolbarProps) {
  const { mode } = useWorkflowMode();
  const { modes } = useRegistries();
  const contribution = modes.get(mode);
  const Left = contribution?.toolbarLeft;

  return (
    <div data-context-toolbar data-mode={mode} style={barStyle}>
      <div style={leftStyle}>
        {Left ? (
          <Left paged={paged} />
        ) : (
          <span className="pg-ui-xs" style={{ paddingLeft: 2 }}>
            {contribution?.blurb ?? ""}
          </span>
        )}
      </div>
      <div style={rightStyle}>{right}</div>
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 44,
  padding: "0 10px",
  gap: 12,
  background: "var(--chrome-panel-bg)",
  borderBottom: "1px solid var(--chrome-border)",
  flexShrink: 0,
};

const leftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "hidden",
};

const rightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};
