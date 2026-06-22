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
      <div style={rightStyle}>
        {right}
        <ViewPill name="ui-grid" title="Overview — coming soon" disabled />
        <ViewPill name="ui-cols-2" title="Spread view" active />
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
