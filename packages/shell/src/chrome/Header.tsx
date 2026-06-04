// Design system — the 46px cockpit header (kit chrome.jsx is the
// reference): wordmark · menu bar · centred ⌘K command trigger ·
// right-side utility cluster (app extras, status, theme toggle).
//
// Deliberately OMITTED from the kit composition: collaborator
// avatars, Share, Comments and Notifications — they presume a
// multiplayer/notification backend the product doesn't ship yet.
// When that lands, they mount in the right cluster before the
// theme toggle.

import { type ReactNode, useState } from "react";

import { Icon } from "../icons";
import { useTheme } from "../state/theme-context";
import { FileDrop } from "./FileDrop";
import { MenuBar } from "./MenuBar";
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
        <FileDrop onFile={onFile} compact />
        {headerExtras}
        {status ? (
          <span className="pg-ui-xs" data-shell-status>
            {status}
          </span>
        ) : null}
        <ThemeToggle />
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
        height: 32,
        padding: "0 14px",
        borderRadius: "var(--radius-full)",
        background: "var(--pg-muted)",
        border: "1px solid var(--pg-border)",
        color: "var(--pg-muted-fg)",
        cursor: "text",
      }}
    >
      <Icon name="ui-search" size={15} />
      <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>
        Search commands…
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
