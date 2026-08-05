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

// Actions — record a sequence of commands, replay it against the
// current selection.
//
// The panel is a VIEW. Everything it drives lives in the shell's
// `ActionsProvider` (`packages/shell/src/actions/`), which is mounted
// above the dock precisely so recording survives this panel being
// unmounted when the user switches right-dock tabs.
//
// The scope note at the bottom of the panel is not decoration. A
// recorder tapped on the command registry cannot see gestures, typing
// or panel field edits, and an action that quietly omitted them would
// replay to a different document than the user recorded. So the panel
// states the limit permanently AND reports, per recording, how many
// uncapturable edits actually happened while it was running.

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  CockpitPanelHeader,
  CockpitBtn,
  StatusPill,
  planReplay,
  serializeForExport,
  skipReasonLabel,
  toDemoScript,
  useActions,
  verdictLabel,
  verdictTitle,
  type PagedAction,
} from "@paged-media/shell";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

const MUTED = { color: "var(--pg-muted-fg)", fontFamily: "var(--font-sans)" };

/** The permanent scope statement. Worded as facts about the tap, not
 *  as an apology — the user needs to be able to predict what an
 *  action will contain before they record it. */
const NOT_RECORDED = [
  "canvas gestures — move, resize, rotate, pen and shape drawing",
  "typing in a text frame",
  "panel field edits (font size, stroke weight, swatch values…)",
  "selection clicks, marquee and camera moves",
  "the Cmd-Z / Cmd-Shift-Z keystrokes (Edit ▸ Undo from the menu IS recorded)",
];

function download(name: string, body: string) {
  const url = URL.createObjectURL(
    new Blob([body], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ActionsPanel(_: PanelProps) {
  const actions = useActions();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const recording = actions.recording;
  const open = useMemo(
    () => actions.actions.find((a) => a.id === openId) ?? null,
    [actions.actions, openId],
  );

  const stop = useCallback(() => {
    const created = actions.stopRecording(name);
    setName("");
    if (!created) {
      setNotice(
        "Nothing recorded — no command ran. Direct manipulation (drag, typing, panel fields) is not recordable; see the scope note below.",
      );
      return;
    }
    setNotice(null);
    setOpenId(created.id);
  }, [actions, name]);

  const onImport = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const accepted = actions.importActions(await file.text());
      setNotice(
        accepted === 0
          ? "Nothing imported — the file held no actions this build understands."
          : `Imported ${accepted} action${accepted === 1 ? "" : "s"}.`,
      );
    },
    [actions],
  );

  return (
    <div
      data-actions-panel="ready"
      style={{
        height: "100%",
        overflowY: "auto",
        fontFamily: "var(--font-sans)",
      }}
    >
      <CockpitPanelHeader
        title="Actions"
        action={
          recording ? (
            <StatusPill tone="error" testId="actions-recording">
              Recording
            </StatusPill>
          ) : (
            <StatusPill tone="draft">{actions.actions.length} saved</StatusPill>
          )
        }
      />

      {/* ── record / stop ─────────────────────────────────────── */}
      <div style={{ padding: "0 14px 12px" }}>
        {recording ? (
          <div
            data-actions-recording
            style={{
              border: "1px solid var(--status-error)",
              borderRadius: "var(--radius-lg)",
              padding: 10,
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <span data-actions-step-count>{recording.steps.length}</span>{" "}
              command{recording.steps.length === 1 ? "" : "s"} captured
            </div>
            <UncapturedLine
              gestures={recording.uncaptured.gestures}
              directEdits={recording.uncaptured.directEdits}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this action"
              data-actions-name
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <CockpitBtn primary sm onClick={stop} testId="actions-stop">
                Stop
              </CockpitBtn>
              <CockpitBtn sm onClick={actions.cancelRecording}>
                Discard
              </CockpitBtn>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <CockpitBtn
              primary
              sm
              onClick={actions.startRecording}
              testId="actions-record"
            >
              Record
            </CockpitBtn>
            <CockpitBtn sm onClick={() => fileRef.current?.click()}>
              Import…
            </CockpitBtn>
            <CockpitBtn
              sm
              disabled={actions.actions.length === 0}
              onClick={() =>
                download(
                  "paged-actions.json",
                  serializeForExport(actions.actions),
                )
              }
            >
              Export all
            </CockpitBtn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                void onImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {!actions.persisted && (
          <div
            style={{
              ...MUTED,
              fontSize: 11,
              marginTop: 8,
              color: "var(--status-error)",
            }}
          >
            Browser storage refused the last write — actions exist for this
            session only. Export to keep them.
          </div>
        )}
        {notice && (
          <div
            data-actions-notice
            style={{ ...MUTED, fontSize: 11, marginTop: 8 }}
          >
            {notice}
          </div>
        )}
      </div>

      {/* ── the list ──────────────────────────────────────────── */}
      <div style={{ padding: "0 14px 12px" }}>
        {actions.actions.length === 0 && !recording && (
          <div style={{ ...MUTED, fontSize: 12 }}>
            No actions yet. Press Record, run some commands from the menu,
            palette or a panel, then press Stop.
          </div>
        )}
        {actions.actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            expanded={action.id === openId}
            playing={actions.playingId === action.id}
            busy={actions.playingId != null || recording != null}
            onToggle={() =>
              setOpenId((prev) => (prev === action.id ? null : action.id))
            }
            onPlay={() => void actions.play(action.id)}
          />
        ))}
      </div>

      {/* ── detail for the expanded action ────────────────────── */}
      {open && (
        <ActionDetail
          action={open}
          onRename={(next) => actions.rename(open.id, next)}
          onRemove={() => {
            actions.remove(open.id);
            setOpenId(null);
          }}
          onToggleStep={(i) => actions.toggleStep(open.id, i)}
          onDeleteStep={(i) => actions.deleteStep(open.id, i)}
          onIncludeDocumentBound={(v) =>
            actions.setIncludeDocumentBound(open.id, v)
          }
          onExport={() =>
            download(
              `${open.name.replace(/[^\w-]+/g, "-").toLowerCase()}.paged-action.json`,
              serializeForExport([open]),
            )
          }
        />
      )}

      {/* ── replay report ─────────────────────────────────────── */}
      {actions.lastReport && (
        <div data-actions-report style={{ padding: "0 14px 12px" }}>
          <Divider />
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Replayed “{actions.lastReport.actionName}”
          </div>
          {actions.lastReport.ran.map((r) => (
            <div
              key={r.index}
              data-actions-report-step
              style={{
                fontSize: 11,
                marginBottom: 3,
                color: r.error ? "var(--status-error)" : "var(--pg-fg)",
              }}
            >
              {r.index + 1}. {r.title}
              {r.error ? ` — failed: ${r.error}` : ""}
            </div>
          ))}
          {actions.lastReport.skipped.map((s) => (
            <div
              key={s.index}
              style={{ ...MUTED, fontSize: 11, marginBottom: 3 }}
            >
              {s.index + 1}. {s.title} — skipped ({skipReasonLabel(s.reason)})
            </div>
          ))}
          {/* Honest undo statement. A replay is NOT one undoable unit:
              every command issues its own mutation, so the engine logs
              one history entry per mutation. The engine's Mutation::Batch
              (→ LoggedMutation::Composite) plus `bindCreated` could
              collapse a whole replay into a single undo — but only if
              commands DECLARED their mutations instead of issuing them,
              which is a change to the command contract, not to this
              panel. So we report the count instead of pretending. */}
          <div style={{ ...MUTED, fontSize: 11, marginTop: 6 }}>
            {actions.lastReport.mutations === 0
              ? "No document mutations — this replay changed only the view or the UI."
              : `${actions.lastReport.mutations} document mutation${
                  actions.lastReport.mutations === 1 ? "" : "s"
                } applied. A replay is not one undoable unit — undo that many times to reverse it.`}
          </div>
          <div style={{ marginTop: 8 }}>
            <CockpitBtn sm onClick={actions.dismissReport}>
              Dismiss
            </CockpitBtn>
          </div>
        </div>
      )}

      {/* ── the permanent scope note ──────────────────────────── */}
      <div style={{ padding: "0 14px 16px" }}>
        <Divider />
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          What a recording contains
        </div>
        <div style={{ ...MUTED, fontSize: 11, lineHeight: 1.55 }}>
          Actions record <strong>commands</strong> — anything reachable from a
          menu, a keybinding, the command palette, the tool rail, a panel button
          or a plugin. Steps with no payload replay against whatever is selected
          at replay time.
          <div style={{ marginTop: 6 }}>Not recorded:</div>
          <ul style={{ margin: "3px 0 0", paddingLeft: 16, listStyle: "disc" }}>
            {NOT_RECORDED.map((line) => (
              <li key={line} style={{ marginBottom: 2 }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────── pieces

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  height: 28,
  padding: "0 8px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--pg-border)",
  background: "transparent",
  color: "var(--pg-fg)",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
};

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--pg-border)",
        margin: "0 0 10px",
      }}
    />
  );
}

function UncapturedLine({
  gestures,
  directEdits,
}: {
  gestures: number;
  directEdits: number;
}) {
  if (gestures === 0 && directEdits === 0) return null;
  return (
    <div
      data-actions-uncaptured
      style={{
        fontSize: 11,
        color: "var(--status-review)",
        marginBottom: 6,
        lineHeight: 1.5,
      }}
    >
      Not captured: {gestures} canvas gesture{gestures === 1 ? "" : "s"} and{" "}
      {directEdits} direct edit{directEdits === 1 ? "" : "s"} (typing / panel
      fields) changed the document while recording. They cannot be replayed.
    </div>
  );
}

function ActionRow({
  action,
  expanded,
  playing,
  busy,
  onToggle,
  onPlay,
}: {
  action: PagedAction;
  expanded: boolean;
  playing: boolean;
  busy: boolean;
  onToggle: () => void;
  onPlay: () => void;
}) {
  const plan = planReplay(action);
  return (
    <div
      data-actions-row={action.id}
      style={{
        border: "1px solid var(--pg-border)",
        borderRadius: "var(--radius-md)",
        padding: "7px 9px",
        marginBottom: 6,
        background: expanded ? "var(--pg-muted)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={onToggle}
          data-actions-open
          style={{
            flex: 1,
            textAlign: "left",
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--pg-fg)",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {action.name}
        </button>
        <span className="pg-value" style={{ fontSize: 11 }}>
          {plan.run.length}/{action.steps.length}
        </span>
        <CockpitBtn
          sm
          disabled={busy || plan.run.length === 0}
          onClick={onPlay}
          testId={`actions-play-${action.id}`}
        >
          {playing ? "Playing…" : "Play"}
        </CockpitBtn>
      </div>
      {plan.skip.length > 0 && (
        <div style={{ ...MUTED, fontSize: 11, marginTop: 4 }}>
          {plan.skip.length} step{plan.skip.length === 1 ? "" : "s"} will be
          skipped
        </div>
      )}
    </div>
  );
}

function ActionDetail({
  action,
  onRename,
  onRemove,
  onToggleStep,
  onDeleteStep,
  onIncludeDocumentBound,
  onExport,
}: {
  action: PagedAction;
  onRename: (name: string) => void;
  onRemove: () => void;
  onToggleStep: (index: number) => void;
  onDeleteStep: (index: number) => void;
  onIncludeDocumentBound: (value: boolean) => void;
  onExport: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hasDocBound = action.steps.some((s) => s.verdict === "documentBound");
  return (
    <div data-actions-detail={action.id} style={{ padding: "0 14px 12px" }}>
      <Divider />
      <input
        value={action.name}
        onChange={(e) => onRename(e.target.value)}
        style={{ ...inputStyle, marginTop: 0, fontWeight: 600 }}
        data-actions-rename
      />

      <UncapturedLine
        gestures={action.uncaptured.gestures}
        directEdits={action.uncaptured.directEdits}
      />

      <div style={{ marginTop: 8 }}>
        {action.steps.map((step, i) => (
          <div
            key={i}
            data-actions-step
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 0",
              opacity: step.disabled ? 0.45 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={!step.disabled}
              onChange={() => onToggleStep(i)}
              aria-label={`Step ${i + 1} enabled`}
            />
            <span style={{ fontSize: 11, flex: 1 }} title={step.command}>
              {i + 1}. {step.title}
              {step.failed && (
                <span style={{ color: "var(--status-error)" }}>
                  {" "}
                  — failed while recording
                </span>
              )}
            </span>
            <span
              title={verdictTitle(step.verdict)}
              data-actions-verdict={step.verdict}
              style={{
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 999,
                border: "1px solid var(--pg-border)",
                color:
                  step.verdict === "documentBound" ||
                  step.verdict === "unserializable"
                    ? "var(--status-review)"
                    : "var(--pg-muted-fg)",
                whiteSpace: "nowrap",
              }}
            >
              {verdictLabel(step.verdict)}
            </span>
            <button
              type="button"
              onClick={() => onDeleteStep(i)}
              aria-label={`Delete step ${i + 1}`}
              style={{
                background: "none",
                border: "none",
                color: "var(--pg-muted-fg)",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {hasDocBound && (
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            fontSize: 11,
            marginTop: 8,
            color: "var(--pg-muted-fg)",
          }}
        >
          <input
            type="checkbox"
            checked={action.includeDocumentBound}
            onChange={(e) => onIncludeDocumentBound(e.target.checked)}
            data-actions-include-docbound
          />
          <span>
            Replay steps that carry ids from the recorded document. Off by
            default — those ids do not exist in another document.
          </span>
        </label>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <CockpitBtn
          sm
          onClick={() => {
            void navigator.clipboard
              ?.writeText(toDemoScript(action))
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy as script"}
        </CockpitBtn>
        <CockpitBtn sm onClick={onExport}>
          Export…
        </CockpitBtn>
        <CockpitBtn sm onClick={onRemove} testId="actions-delete">
          Delete
        </CockpitBtn>
      </div>
      {/* Why "Copy as script" exists at all — see `toDemoScript`. The
          automation layer's `editor.runCommand(id, payload)` runs
          against this same registry, so the steps ARE a script; the
          step list stays the primitive only because a script cannot
          carry the per-step verdicts. */}
      <div style={{ ...MUTED, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
        “Copy as script” emits the same steps as{" "}
        <code>editor.runCommand(…)</code> calls for the demo/automation runner.
      </div>
    </div>
  );
}
