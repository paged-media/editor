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

// Design system — the 46px cockpit header (kit chrome.jsx is the
// reference): wordmark · menu bar · centred "Ask or search
// anything…" pill · collaboration cluster (visible, inert — no
// backend yet) · theme toggle · zoom dropdown.
//
// File intake has no header widget (kit): File ▸ Open IDML…, canvas
// drag-drop, and a hidden `<input type="file">` for the Playwright
// suite cover it.

import { type ReactNode, useState } from "react";

import { Icon } from "../icons";
import { useTheme } from "../state/theme-context";
import { CollabCluster } from "./CollabCluster";
import { FileDrop } from "./FileDrop";
import { MenuBar } from "./MenuBar";
import { ZoomControl } from "./ZoomControl";
import { notifyPalette } from "./CommandPalette";

export interface HeaderProps {
  onFile: (file: File) => void;
  headerExtras?: ReactNode;
  status?: string;
}

export function Header({ onFile, headerExtras, status }: HeaderProps) {
  return (
    <header style={headerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <Brand />
        <div style={{ width: 1, height: 18, background: "var(--pg-border)" }} />
        <MenuBar />
      </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <CommandTrigger />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <FileDrop onFile={onFile} hidden />
        {headerExtras}
        {status ? (
          // Kit header carries no status line — the worker state
          // compacts to an honest dot, full text in the tooltip.
          <span
            data-shell-status
            title={status}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background: /ready/i.test(status)
                ? "var(--status-approved)"
                : "var(--status-review)",
            }}
          />
        ) : null}
        <CollabCluster />
        <ThemeToggle />
        <ZoomControl />
      </div>
    </header>
  );
}

/** The `paged.` wordmark — the oxblood period IS the mark. */
function Brand() {
  return (
    <span
      className="pg-wordmark"
      style={{ fontSize: 19, color: "var(--pg-fg)" }}
    >
      paged
      <span className="dot" style={{ color: "var(--wordmark-dot)" }}>
        .
      </span>
    </span>
  );
}

/** Centred pill that opens the command palette (the ⌘K affordance). */
function CommandTrigger() {
  return (
    <button
      type="button"
      data-command-trigger
      onClick={() => notifyPalette("open")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "min(460px, 100%)",
        height: 36,
        padding: "0 14px",
        borderRadius: "var(--radius-full)",
        background: "var(--pg-muted)",
        border: "1px solid var(--pg-border)",
        color: "var(--pg-muted-fg)",
        cursor: "text",
      }}
    >
      <Icon name="ui-search" size={16} style={{ flexShrink: 0 }} />
      <span
        style={{
          flex: 1,
          textAlign: "left",
          fontSize: 13.5,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        Ask or search anything…
      </span>
      <kbd
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--pg-muted-fg)",
          border: "1px solid var(--pg-border)",
          borderRadius: "var(--radius-sm)",
          padding: "2px 6px",
          background: "hsl(var(--paged-bg))",
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}

/** Sun/moon — dark is the primary surface, light one click away. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-theme-toggle
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      onClick={toggleTheme}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-md)",
        border: "none",
        background: hover ? "var(--hover)" : "transparent",
        color: "var(--chrome-icon)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <Icon name={theme === "dark" ? "ui-sun" : "ui-moon"} size={17} />
    </button>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 46,
  padding: "0 14px",
  gap: 16,
  background: "var(--chrome-panel-bg)",
  borderBottom: "1px solid var(--chrome-border)",
  flexShrink: 0,
  position: "relative",
  zIndex: 30,
};
