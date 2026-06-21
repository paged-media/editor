// Demo narration overlay — the in-GUI message box that `demo.showInfo` / `demo.pause`
// drives. A guided-tour primitive: a script can describe a step, the box appears
// over the editor, and the SCRIPT SUSPENDS until the user clicks Next (or it
// auto-advances). Also usable for in-app tutorials beyond demos.
//
// Module-singleton controller (same pattern as CommandPalette's notifyPalette) so
// the script runner — which lives outside React — can call it and await a promise.

import { useEffect, useReducer } from "react";

export interface DemoInfoRequest {
  title: string;
  body?: string;
  /** "Next" for mid-sequence, "Done" for the last step (cosmetic). */
  cta?: string;
  /** Auto-advance after N ms instead of waiting for a click. */
  autoMs?: number;
  /** Optional step position, e.g. shows "2 / 5". */
  index?: number;
  total?: number;
}

interface Pending {
  req: DemoInfoRequest;
  resolve: () => void;
}

let current: Pending | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

/**
 * Show the narration box and resolve when the user advances. If a box is already
 * open it's resolved first (sequential stepping). Returns a promise the runner
 * awaits — that await is the script's pause point.
 */
export function demoShowInfo(req: DemoInfoRequest): Promise<void> {
  if (current) {
    const prev = current;
    current = null;
    prev.resolve();
  }
  return new Promise<void>((resolve) => {
    current = { req, resolve };
    notify();
  });
}

/** Dismiss the current box (the Next/Done action). */
function advance(): void {
  const c = current;
  current = null;
  notify();
  c?.resolve();
}

/** Clear any open box without resolving (used on teardown / restart). */
export function demoResetOverlay(): void {
  current = null;
  notify();
}

/**
 * Mount once near the shell root (alongside CommandPalette). Renders the current
 * narration box, if any. Fixed/high-z so it floats over the cockpit.
 */
export function DemoOverlay(): React.ReactElement | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    subscribers.add(force);
    return () => {
      subscribers.delete(force);
    };
  }, []);

  const req = current?.req;
  useEffect(() => {
    if (!req || !req.autoMs) return;
    const t = setTimeout(advance, req.autoMs);
    return () => clearTimeout(t);
  }, [req]);

  if (!req) return null;
  const cta = req.cta ?? "Next";
  const step = req.index != null && req.total != null ? `${req.index} / ${req.total}` : null;

  return (
    <div
      data-demo-overlay
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 9000,
        maxWidth: 360,
        background: "var(--chrome-panel-bg, #1e1e22)",
        color: "var(--pg-fg, #fff)",
        border: "1px solid var(--pg-border, #333)",
        borderRadius: "var(--radius-md, 8px)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        padding: "14px 16px",
        fontFamily: "var(--font-sans)",
      }}
    >
      {step ? (
        <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pg-muted-fg, #999)", marginBottom: 6 }}>
          {step}
        </div>
      ) : null}
      <div style={{ fontSize: 14, fontWeight: 640, marginBottom: req.body ? 4 : 10 }}>{req.title}</div>
      {req.body ? <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--pg-muted-fg, #bbb)", marginBottom: 12 }}>{req.body}</div> : null}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-demo-advance
          onClick={advance}
          style={{
            font: "inherit",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            color: "var(--pg-primary-fg, #fff)",
            background: "var(--pg-primary, #6b5cff)",
            border: "none",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "5px 14px",
          }}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
