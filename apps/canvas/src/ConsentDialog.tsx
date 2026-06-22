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

// D-03 — the data-source-consent prompt. Renders the pending request from the
// consent controller (origins + purpose), lets the user grant a per-origin
// subset, and resolves the SDK door. Dismissing (Esc / backdrop / Deny) denies
// every origin — default-deny is the dismissal, never a hidden grant.
//
// Self-contained on purpose: the backend lives at the app layer (main.tsx wires
// `hostOptions.consent`), so the prompt does too, styled with the brand tokens
// the rest of the app uses rather than reaching across into shell-internal UI.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { ConsentController, PendingConsent } from "./plugin-consent";

export function ConsentDialog({
  controller,
}: {
  controller: ConsentController;
}) {
  const pending = useSyncExternalStore(
    controller.subscribe,
    controller.current,
    controller.current,
  );
  return pending ? <ConsentPrompt key={pending.id} pending={pending} /> : null;
}

function ConsentPrompt({ pending }: { pending: PendingConsent }) {
  // Default-deny posture: nothing is pre-checked. The user opts each origin in.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [remember, setRemember] = useState(false);

  const deny = (): void => pending.decide({ granted: [], remember: false });
  const allow = (): void =>
    pending.decide({ granted: [...checked], remember });

  // Esc denies (the safe default for an un-acknowledged prompt).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") deny();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.id]);

  const toggle = (origin: string): void =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(origin)) next.delete(origin);
      else next.add(origin);
      return next;
    });

  return (
    <div
      data-testid="consent-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) deny();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.6)",
        font: "13px/1.5 var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        data-testid="consent-dialog"
        style={{
          width: "min(440px, 92vw)",
          maxHeight: "82vh",
          overflow: "auto",
          padding: 20,
          borderRadius: "var(--radius-lg, 10px)",
          border: "1px solid var(--border, #2a2a2a)",
          background: "var(--elevated, var(--background, #161616))",
          color: "var(--fg, #e7e7e7)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <h2 id="consent-title" style={{ margin: "0 0 4px", fontSize: 15 }}>
          Allow network access?
        </h2>
        <p style={{ margin: "0 0 14px", color: "var(--muted-fg, #9a9a9a)" }}>
          A plugin wants to reach the origins below.{" "}
          <strong style={{ color: "var(--fg, #e7e7e7)" }}>{pending.purpose}</strong>
        </p>

        <ul
          data-testid="consent-origins"
          style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "grid", gap: 6 }}
        >
          {pending.origins.map((origin) => (
            <li key={origin}>
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border, #2a2a2a)",
                  background: "var(--background, #111)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  data-testid="consent-origin"
                  data-origin={origin}
                  checked={checked.has(origin)}
                  onChange={() => toggle(origin)}
                />
                <code style={{ font: "12px var(--font-mono, monospace)" }}>{origin}</code>
              </label>
            </li>
          ))}
        </ul>

        <label
          style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 16px", color: "var(--muted-fg, #9a9a9a)" }}
        >
          <input
            type="checkbox"
            data-testid="consent-remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember for this document
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            data-testid="consent-deny"
            onClick={deny}
            style={btnStyle(false)}
          >
            Deny
          </button>
          <button
            type="button"
            data-testid="consent-allow"
            onClick={allow}
            disabled={checked.size === 0}
            style={btnStyle(true, checked.size === 0)}
          >
            Allow{checked.size > 0 ? ` ${checked.size}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 7,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "1px solid var(--border, #2a2a2a)",
    background: primary ? "var(--pg-primary, #4f7cff)" : "transparent",
    color: primary ? "var(--pg-primary-fg, #fff)" : "var(--fg, #e7e7e7)",
  };
}
