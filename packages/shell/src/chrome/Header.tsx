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

// Design system — the 46px cockpit header, in zones separated by
// hairlines:
//
//   brand · document | menus (core, then context) | search | theme · Share
//
// - The DOCUMENT chip names what is open and carries one status dot:
//   the engine's state while it is not ready, else the save state (it
//   moved here from the bottom bar, where it sat apart from the name).
// - Search shrinks with the space it is given and becomes an icon
//   below 220 px, so nothing is pushed off the right edge.
// - Zoom lives in the bottom bar only (it was in both).
//
// File intake has no header widget: File ▸ Open…, canvas drag-drop,
// and a hidden `<input type="file">` for the Playwright suite cover it.

import { type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "../icons";
import { useDocumentMeta } from "../catalog/use-collection";
import { useDocument } from "../state/document-context";
import { useTheme } from "../state/theme-context";
import { ShareButton } from "./CollabCluster";
import { FileDrop } from "./FileDrop";
import { MenuBar, prettyKey } from "./MenuBar";
import { notifyPalette } from "./CommandPalette";

export interface HeaderProps {
  onFile: (file: File) => void;
  headerExtras?: ReactNode;
  status?: string;
}

export function Header({ onFile, headerExtras, status }: HeaderProps) {
  return (
    <header style={headerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <Brand />
        <DocumentChip status={status} />
        <span style={zoneDividerStyle} aria-hidden />
        <MenuBar />
      </div>

      <div style={{ flex: 1, minWidth: 36, display: "flex", justifyContent: "center" }}>
        <CommandTrigger />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <FileDrop onFile={onFile} hidden />
        {headerExtras != null && (
          <div style={{ display: "flex", maxWidth: 200, minWidth: 0, overflow: "hidden" }}>
            {headerExtras}
          </div>
        )}
        <ThemeToggle />
        <span style={zoneDividerStyle} aria-hidden />
        <ShareButton />
      </div>
    </header>
  );
}

/** What is open, and its state in one dot. */
function DocumentChip({ status }: { status?: string }) {
  const { handle, sourceName } = useDocument();
  const meta = useDocumentMeta();
  const ready = !status || /ready/i.test(status);
  const name = handle
    ? meta?.documentName || sourceName || "Untitled document"
    : "No document";
  // U14 — honest wording: dirty means edits since load; nothing writes
  // to disk on its own, so neither state may claim a save happened.
  const state = !ready
    ? status
    : !handle
      ? null
      : meta?.dirty
        ? "Edited — not saved"
        : "No unsaved edits";
  const dot = !ready
    ? "var(--status-review)"
    : meta?.dirty
      ? "var(--status-review)"
      : "var(--status-approved)";
  return (
    <span
      data-document-chip
      title={state ? `${name} — ${state}` : name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minWidth: 0,
        maxWidth: "clamp(90px, 14vw, 220px)",
        color: handle ? "var(--pg-fg)" : "var(--pg-muted-fg)",
        fontSize: 13,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      {(state || !ready) && (
        <span
          // Both hooks the suite and scripts read: the worker state and
          // the save state, now one dot.
          data-shell-status={status}
          data-save-state={handle && ready ? (meta?.dirty ? "dirty" : "saved") : undefined}
          aria-label={state ?? undefined}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: dot,
          }}
        />
      )}
    </span>
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

/** Centred pill that opens the command palette (the ⌘K affordance).
 *  It fills the space between the menus and the right cluster up to
 *  460 px and, given less than 220 px, collapses to a search icon. */
function CommandTrigger() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < 220));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <button
        type="button"
        data-command-trigger
        data-compact={compact ? "true" : undefined}
        aria-label={`Search or ask (${prettyKey("cmd+k")})`}
        title={compact ? `Search or ask (${prettyKey("cmd+k")})` : undefined}
        onClick={() => notifyPalette("open")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "center" : "flex-start",
          gap: 9,
          width: compact ? 34 : "min(460px, 100%)",
          height: 34,
          padding: compact ? 0 : "0 12px",
          borderRadius: "var(--radius-full)",
          background: "var(--pg-muted)",
          border: "1px solid var(--pg-border)",
          color: "var(--pg-muted-fg)",
          cursor: compact ? "pointer" : "text",
          flexShrink: 0,
        }}
      >
        <Icon name="ui-search" size={16} style={{ flexShrink: 0 }} />
        {!compact && (
          <>
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
              Search or ask…
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
              {prettyKey("cmd+k")}
            </kbd>
          </>
        )}
      </button>
    </div>
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

const zoneDividerStyle: React.CSSProperties = {
  width: 1,
  height: 18,
  background: "var(--pg-border)",
  flexShrink: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 46,
  padding: "0 12px 0 14px",
  gap: 14,
  background: "var(--chrome-panel-bg)",
  borderBottom: "1px solid var(--chrome-border)",
  flexShrink: 0,
  position: "relative",
  zIndex: 30,
};
