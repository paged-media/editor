/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Design system (publishing cockpit) — the 44px context toolbar
// between the header and the body row. The LEFT segment is
// mode-aware (the active ModeContribution's `toolbarLeft`); the
// RIGHT side carries the kit's constant view cluster
// (Overview/Spread/Story pills as visible seams until the view
// modes land; Focus mode is REAL — it invokes the Tab chrome-hide
// command).

import type { ReactNode } from "react";

import { Icon } from "../icons";
import { useRegistries } from "../state/registries-context";
import { useWorkflowMode } from "../state/workflow-mode-context";
import {
  useOptionalEditContextStack,
  type EditContextFrame,
} from "../state/edit-context-stack";

export interface ContextToolbarProps {
  /** Editor handle threaded into the mode's toolbar segment. */
  paged: unknown;
  /** Constant right-side controls (app-supplied view pills). */
  right?: ReactNode;
}

export function ContextToolbar({ paged, right }: ContextToolbarProps) {
  const { mode } = useWorkflowMode();
  const { modes, commands } = useRegistries();
  const contribution = modes.get(mode);
  const Left = contribution?.toolbarLeft;
  // ADR 024 — the toolbar follows the CONTEXT when there is one.
  //
  // Its left segment is the workflow MODE's, and a mode is a
  // workspace-level choice while a context is a content-level fact —
  // two different axes, of which only one was wired. So editing a
  // spreadsheet kept the host's design-tool pills on the bar directly
  // above the canvas: controls for page items, over content that has
  // none.
  //
  // This does NOT decide the larger question ADR 024 leaves open (may a
  // context CONTRIBUTE toolbar segments?). It needs no new contribution
  // surface at all — the context already declares `toolIds`, and the
  // tool registry already knows their titles. When a context is active
  // the bar states where you are and what applies; otherwise nothing
  // changes.
  const editContexts = useOptionalEditContextStack();
  const active = editContexts?.active ?? null;

  return (
    <div
      data-context-toolbar
      data-mode={mode}
      data-edit-context={active?.type ?? undefined}
      style={barStyle}
    >
      <div style={leftStyle}>
        {active ? (
          <ContextSegment frame={active} />
        ) : Left ? (
          <Left paged={paged} />
        ) : (
          <span className="pg-ui-xs" style={{ paddingLeft: 2 }}>
            {contribution?.blurb ?? ""}
          </span>
        )}
      </div>
      <div style={rightStyle}>
        {right}
        <ViewPill name="ui-grid" title="Overview — coming soon" disabled />
        {/* D1 — `active` with no `onClick` and no `disabled` rendered a
            pointer-cursor, permanently-highlighted button that swallowed
            every click. That is precisely the failure the tool rail's
            own doctrine names: an affordance that accepts a click and
            silently does nothing is WORSE than an empty slot, because
            the user reads the dead control as a fault in their own
            input. Spread view is not wired, so it says so and refuses
            the click like its two neighbours. */}
        <ViewPill name="ui-cols-2" title="Spread view — coming soon" disabled />
        <ViewPill name="ui-rows" title="Story view — coming soon" disabled />
        <span style={sepStyle} />
        <ViewPill
          name="ui-expand"
          title="Focus mode (Tab)"
          onClick={() => void commands.invoke("paged.chrome.toggleAll")}
        />
      </div>
    </div>
  );
}

/**
 * What the bar says while a plugin content type is being edited: the
 * content you are in, and the tools that apply to it.
 *
 * The empty case is a STATEMENT, not a blank. A context declaring
 * `toolIds: []` has said no canvas tool edits its content — a
 * spreadsheet, a web frame, a data binding — and saying so out loud is
 * the point of the declaration. Rendering nothing there would leave the
 * user to infer it from an absence, which is how they conclude the app
 * is broken.
 */
function ContextSegment({ frame }: { frame: EditContextFrame }) {
  const { tools } = useRegistries();
  const label = frame.label || frame.type;
  const applicable = (frame.toolIds ?? [])
    .map((id) => tools.get(id as never)?.title)
    .filter((t): t is string => Boolean(t));

  return (
    <span className="pg-ui-xs" style={{ paddingLeft: 2 }} data-context-segment>
      Editing {label}
      {frame.toolIds === null
        ? ""
        : applicable.length > 0
          ? ` — ${applicable.join(", ")}`
          : " — no canvas tools apply here"}
      <span style={{ opacity: 0.6 }}> · Esc to leave</span>
    </span>
  );
}

/** Kit chrome.jsx Pill — 30px icon toggle; active fills the soft
 *  violet, disabled seams render dimmed with an honest tooltip. */
function ViewPill({
  name,
  title,
  active,
  disabled,
  onClick,
}: {
  name: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      data-view-pill={name}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-md)",
        border: "none",
        background: active ? "var(--selected-bg)" : "transparent",
        color: active ? "var(--pg-primary)" : "var(--chrome-icon)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
        padding: 0,
      }}
    >
      <Icon name={name} size={18} />
    </button>
  );
}

const sepStyle: React.CSSProperties = {
  width: 1,
  height: 22,
  background: "var(--pg-border)",
  margin: "0 6px",
  flexShrink: 0,
};

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
