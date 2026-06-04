import { useState, type CSSProperties } from "react";

import {
  SCREEN_MODES,
  useScreenMode,
  type ScreenMode,
} from "../state/screen-mode-context";

// Concept 1 (T7) — the screen-mode control at the foot of the rail.
// Cycles Normal / Preview / Bleed / Slug / Presentation. View state
// only; nothing is written to the document.

const MODE_GLYPH: Record<ScreenMode, string> = {
  normal: "▢",
  preview: "◼",
  bleed: "▣",
  slug: "▦",
  presentation: "⬛",
};

export function ScreenModeSelector() {
  const { screenMode, setScreenMode } = useScreenMode();
  const [open, setOpen] = useState(false);
  const current = SCREEN_MODES.find((m) => m.mode === screenMode);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        title={`Screen mode: ${current?.label ?? screenMode}`}
        data-screen-mode={screenMode}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
      >
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
          {MODE_GLYPH[screenMode]}
        </span>
      </button>
      {open && (
        <>
          <div
            style={backdropStyle}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div style={menuStyle} role="menu">
            {SCREEN_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={mode === screenMode}
                data-screen-mode-option={mode}
                onClick={() => {
                  setScreenMode(mode);
                  setOpen(false);
                }}
                style={
                  mode === screenMode
                    ? { ...itemStyle, ...itemActiveStyle }
                    : itemStyle
                }
              >
                <span aria-hidden style={{ width: 16 }}>
                  {MODE_GLYPH[mode]}
                </span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  width: 30,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--chrome-divider)",
  borderRadius: 5,
  background: "var(--elevated)",
  color: "var(--chrome-icon)",
  cursor: "pointer",
  padding: 0,
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 49,
};

const menuStyle: CSSProperties = {
  position: "absolute",
  left: "calc(100% + 4px)",
  bottom: 0,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  minWidth: 150,
  padding: 4,
  borderRadius: 6,
  border: "1px solid var(--chrome-divider)",
  background: "var(--elevated)",
  boxShadow: "var(--shadow-pop)",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 26,
  padding: "0 8px",
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "var(--chrome-menu-text)",
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left",
};

const itemActiveStyle: CSSProperties = {
  background: "var(--chrome-slot-active)",
  color: "var(--elevated)",
};
