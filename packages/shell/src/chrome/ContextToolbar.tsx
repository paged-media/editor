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
// RIGHT side carries the app's view controls and Focus mode (REAL —
// it invokes the Tab chrome-hide command).

import type { ReactNode } from "react";

import { Icon, hasIcon } from "../icons";
import { useRegistries } from "../state/registries-context";
import { useOptionalTool } from "../state/tool-context";
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
        {/* Overview / Spread / Story were three disabled "coming soon"
            pills here, permanently, on the bar directly above the work.
            They return when the view modes exist. */}
        {right != null && <span style={sepStyle} />}
        <ViewPill
          name="ui-expand"
          title="Focus mode (Tab)"
          onClick={() => void commands.invoke("paged.chrome.toggleAll")}
        />
      </div>
    </div>
  );
}

/** `rasterImage` → `Raster image` — the breadcrumb's rule. */
function titleCase(type: string): string {
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** What the segment shows for a context: its name, the tools that edit
 *  it, and whether it declared that none do. */
export interface ContextSegmentModel {
  label: string;
  tools: Array<{ id: string; title: string; icon: string }>;
  /** True for a DECLARED list none of whose tools exist (`[]`, or ids
   *  the registry does not know): "no canvas tools apply here". */
  noTools: boolean;
}

export function contextSegmentModel(
  frame: Pick<EditContextFrame, "label" | "type" | "toolIds">,
  lookup: (id: string) => { title: string; icon: string } | undefined,
): ContextSegmentModel {
  const tools = (frame.toolIds ?? []).flatMap((id) => {
    const t = lookup(id);
    return t ? [{ id, title: t.title, icon: t.icon }] : [];
  });
  return {
    label: titleCase(frame.label || frame.type),
    tools,
    noTools: frame.toolIds !== null && tools.length === 0,
  };
}

/**
 * What the bar shows while a plugin content type is being edited: the
 * content you are in, and the tools that edit it — as TOOLS, pressable
 * and showing which one is in hand. It used to be one sentence, the
 * context's raw type and a comma-separated list of every tool title
 * ("Editing rasterImage — Brush (raster), Pencil (raster), …"), which
 * named the tools without offering them.
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
  const tool = useOptionalTool();
  const model = contextSegmentModel(frame, (id) => {
    const t = tools.get(id as never);
    return t ? { title: t.title, icon: t.icon } : undefined;
  });
  const inHand = tool?.toolState.base ?? null;

  return (
    <span
      className="pg-ui-xs"
      style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 2, minWidth: 0 }}
      data-context-segment
    >
      <span data-context-label style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
        {model.label}
      </span>
      {model.tools.length > 0 && <span style={sepStyle} aria-hidden />}
      {model.tools.map((t) => (
        <ViewPill
          key={t.id}
          name={t.icon}
          title={t.title}
          active={inHand === t.id}
          toolId={t.id}
          onClick={() => tool?.setBaseTool(t.id)}
        />
      ))}
      {model.noTools && (
        <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
          no canvas tools apply here
        </span>
      )}
      <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>Esc to leave</span>
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
  toolId,
}: {
  name: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Set when the pill arms a tool (the context segment). */
  toolId?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      data-view-pill={toolId ? undefined : name}
      data-context-tool={toolId}
      aria-pressed={toolId ? Boolean(active) : undefined}
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
      {hasIcon(name) ? (
        <Icon name={name} size={18} />
      ) : (
        // A bundle glyph the shell does not know: the title's initial, as
        // the tool rail falls back.
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {title.slice(0, 1).toUpperCase()}
        </span>
      )}
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
