// D-11 (rfc-credential-store) — the "this source uses a stored credential"
// prompt. Renders the pending `host.secrets.set` (the plugin asking + the
// credentialRef + the storage tier), lets the user confirm/edit the secret
// value, and resolves the SDK door. Dismissing (Esc / backdrop / Cancel)
// stores NOTHING — the source stays inert until the credential is entered
// (the RFC's honest degradation), never a hidden persist.
//
// Self-contained on purpose (like ConsentDialog): the backend lives at the
// app layer (main.tsx wires `hostOptions.secrets`), so the prompt does too,
// styled with the brand tokens the rest of the app uses.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type {
  PendingSecret,
  SecretPromptController,
} from "./plugin-secret-store";

export function SecretPromptDialog({
  controller,
}: {
  controller: SecretPromptController;
}) {
  const pending = useSyncExternalStore(
    controller.subscribe,
    controller.current,
    controller.current,
  );
  return pending ? <SecretPrompt key={pending.id} pending={pending} /> : null;
}

function SecretPrompt({ pending }: { pending: PendingSecret }) {
  // Pre-fill the plugin's suggested value (often a connection string the
  // user pasted into the source dialog). The user confirms or edits; only
  // what they confirm is stored.
  const [value, setValue] = useState<string>(pending.suggested);

  const cancel = (): void => pending.decide(null);
  const save = (): void => pending.decide(value);

  // Esc cancels (nothing stored — the safe default).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.id]);

  const tierNote =
    pending.tier === "webcrypto"
      ? "Stored for this document, encrypted with your passphrase (browser keychain — the weaker tier; an OS keychain ships with the desktop shell)."
      : "Held for this browser session only — it is not saved. Re-enter it after a reload (set a passphrase in settings to persist it, wrapped).";

  return (
    <div
      data-testid="secret-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
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
        aria-labelledby="secret-title"
        data-testid="secret-dialog"
        style={{
          width: "min(460px, 92vw)",
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
        <h2 id="secret-title" style={{ margin: "0 0 4px", fontSize: 15 }}>
          This source uses a stored credential
        </h2>
        <p style={{ margin: "0 0 14px", color: "var(--muted-fg, #9a9a9a)" }}>
          A plugin asked to store a credential under{" "}
          <code
            data-testid="secret-ref"
            style={{ font: "12px var(--font-mono, monospace)", color: "var(--fg, #e7e7e7)" }}
          >
            {pending.ref}
          </code>
          . The plugin keeps only this reference — never the secret itself.
        </p>

        <label
          style={{
            display: "block",
            margin: "0 0 6px",
            color: "var(--muted-fg, #9a9a9a)",
          }}
        >
          Credential
          <input
            type="password"
            data-testid="secret-input"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.length > 0) save();
            }}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 7,
              border: "1px solid var(--border, #2a2a2a)",
              background: "var(--background, #111)",
              color: "var(--fg, #e7e7e7)",
              font: "12px var(--font-mono, monospace)",
              boxSizing: "border-box",
            }}
          />
        </label>

        <p
          data-testid="secret-tier-note"
          style={{ margin: "8px 0 16px", fontSize: 12, color: "var(--muted-fg, #9a9a9a)" }}
        >
          {tierNote}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            data-testid="secret-cancel"
            onClick={cancel}
            style={btnStyle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="secret-save"
            onClick={save}
            disabled={value.length === 0}
            style={btnStyle(true, value.length === 0)}
          >
            Store credential
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
