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

// The AI Assistant panel (ADR 221) — the one place Claude works in the
// editor. It started as a card at the bottom of the Properties panel
// (kit inspectors.jsx AIAssistant: diagnose → propose → apply) and keeps
// that look; as a docked panel it also holds what the card could not:
//
// - "Ask": the document's diagnosis (computed locally, no model call),
//   suggestions for the selection, and a free request. With a selection
//   Claude makes that one change; without one it works on the document.
// - "New document": a brief and a page size; Claude builds the document
//   page by page while you watch the canvas (File ▸ New from a brief).
// - Progress: one line per script Claude runs, then its summary, Stop,
//   and an Undo that reverts exactly Claude's steps.
//
// Every entry point — the palette's "Ask Claude", the File menu, the
// Properties shortcut — feeds the same session store (ai/assistant-session),
// so a run started anywhere is shown here.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { FontSummary, LinkSummary } from "@paged-media/client";

import {
  dismissAssistantRun,
  getAssistantState,
  setAssistantDraft,
  setAssistantView,
  startAssistantRun,
  stopAssistantRun,
  subscribeAssistant,
  takeAssistantAutoRun,
  undoAssistantRun,
  type AssistantStep,
} from "../../ai/assistant-session";
import { PoweredByClaude } from "../../ai/powered-by-claude";
import { useCollection, useDocumentMeta, useDocumentStats } from "../../catalog/use-collection";
import { Icon } from "../../icons";
import { useCanvasClient } from "../../state/canvas-client-context";
import { confirmDiscard, mintBlankDocument } from "../../state/commands/file-commands";
import { useContentSelection } from "../../state/content-selection-context";
import { useDocument } from "../../state/document-context";
import { useOptionalPaged } from "../../state/paged-editor";
import { useSelection } from "../../state/selection-context";
import { Btn, PanelHeader, Section } from "./kit";

/** The panels' shared low-res floor (publication-health-panel). */
const LOW_RES_PPI = 150;

export type AssistantKind = "text" | "image" | "frame" | "page";

const SUGGESTIONS: Record<AssistantKind, Array<[icon: string, label: string]>> = {
  text: [
    ["panel-character", "Shorten text to fit"],
    ["ui-leading", "Adjust spacing to fit"],
    ["ui-flow", "Flow into a new frame"],
    ["panel-pages", "Add 1 more page"],
  ],
  image: [
    ["ui-wand", "Fit the image proportionally"],
    ["ui-wand", "Centre the image in its frame"],
  ],
  frame: [
    ["ui-wand", "Centre on the page"],
    ["ui-wand", "Align to the margins"],
  ],
  page: [
    ["ui-wand", "Tidy the layout of this page"],
    ["panel-pages", "Add 1 more page"],
  ],
};

const SIZES: Array<{ id: string; label: string; pt: [number, number] }> = [
  { id: "a4", label: "A4", pt: [595, 842] },
  { id: "letter", label: "US Letter", pt: [612, 792] },
  { id: "a5", label: "A5", pt: [420, 595] },
  { id: "a3", label: "A3", pt: [842, 1191] },
  { id: "square", label: "Square 210 mm", pt: [595, 595] },
];

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--pg-bg)",
  color: "var(--pg-fg)",
  border: "1px solid var(--pg-border)",
  borderRadius: "var(--radius-lg)",
  fontFamily: "var(--font-sans)",
  fontSize: 12.5,
  lineHeight: 1.45,
  padding: "8px 10px",
  resize: "vertical",
  outline: "none",
};

const select: React.CSSProperties = {
  background: "var(--pg-muted)",
  color: "var(--pg-fg)",
  border: "1px solid var(--chrome-divider)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  minHeight: 26,
  padding: "0 6px",
};

export function AIAssistant() {
  const client = useCanvasClient();
  const editor = useOptionalPaged();
  const { handle } = useDocument();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const stats = useDocumentStats();
  const links = useCollection<LinkSummary>("links");
  const fonts = useCollection<FontSummary>("fonts");
  const session = useSyncExternalStore(subscribeAssistant, getAssistantState);
  const meta = useDocumentMeta();
  // The engine's own page count, not only the shell's handle: a document
  // loaded through the client directly (an automation, a test) has no handle.
  const hasDocument = (handle?.pageCount ?? 0) > 0 || (meta?.pageCount ?? 0) > 0;
  const view = hasDocument ? session.view : "brief";
  const run = session.run;
  const running = run.phase === "running";

  const kind: AssistantKind | null = contentSelection
    ? "text"
    : elementSelection.length === 0
      ? hasDocument
        ? "page"
        : null
      : elementSelection.some((e) => e.kind === "textFrame")
        ? "text"
        : "frame";

  const diagnosis = useMemo(() => {
    const issues: string[] = [];
    const overset = stats?.overset_stories ?? 0;
    if (overset > 0) issues.push(`${overset} overset ${overset === 1 ? "story" : "stories"}`);
    const lowRes = links?.filter((l) => l.effectivePpi != null && l.effectivePpi < LOW_RES_PPI).length ?? 0;
    if (lowRes > 0) issues.push(`${lowRes} low-resolution ${lowRes === 1 ? "image" : "images"}`);
    const missingLinks = links?.filter((l) => l.status === "missing").length ?? 0;
    if (missingLinks > 0) issues.push(`${missingLinks} missing ${missingLinks === 1 ? "image" : "images"}`);
    const missingFonts = fonts?.filter((f) => f.isMissing).length ?? 0;
    if (missingFonts > 0) issues.push(`${missingFonts} missing ${missingFonts === 1 ? "font" : "fonts"}`);
    return issues;
  }, [stats, links, fonts]);

  const context = useCallback((): string => {
    const lines: string[] = [];
    const ids = elementSelection.filter((e) => typeof e.id === "string").map((e) => `${e.kind}:${e.id as string}`);
    if (ids.length) lines.push(`Selected elements: ${ids.join(", ")}.`);
    if (contentSelection) {
      const { storyId, start, end } = contentSelection;
      lines.push(start === end ? `Text caret in ${storyId} at offset ${start}.` : `Selected text: storyRange:${storyId}@${start}..${end}.`);
    }
    lines.push(diagnosis.length ? `Document issues: ${diagnosis.join(", ")}.` : "The document has no overset text, image or font issues.");
    return lines.join("\n");
  }, [elementSelection, contentSelection, diagnosis]);

  const ask = useCallback(
    (request: string) => {
      const text = request.trim();
      if (!text || running || !hasDocument) return;
      const scoped = elementSelection.length > 0 || contentSelection != null;
      startAssistantRun({
        client,
        mode: scoped ? "assist" : "script",
        prompt: `${scoped ? `The user has a ${kind ?? "frame"} selected.\n` : ""}${context()}\n\nRequest: ${text}`,
      });
    },
    [client, context, running, hasDocument, elementSelection, contentSelection, kind],
  );

  const build = useCallback(
    (brief: string, sizeId: string) => {
      const text = brief.trim();
      if (!text || running || !editor) return;
      const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0]!;
      startAssistantRun({
        client,
        mode: "document",
        prompt: `${text}\n\nPage size: ${size.label} (${size.pt[0]} × ${size.pt[1]} pt). The document is open with one blank page of that size.`,
        prepare: async () => {
          if (!(await confirmDiscard(editor, "Creating a new document"))) return false;
          await mintBlankDocument(editor, size.pt, { setStatus: () => {}, pushWarning: () => {} });
          return true;
        },
      });
    },
    [client, editor, running],
  );

  // The palette's "Ask Claude" opens this panel with a request to run.
  useEffect(() => {
    if (!session.autoRun || !hasDocument || running) return;
    const request = takeAssistantAutoRun();
    if (request) ask(request);
  }, [session.autoRun, hasDocument, running, ask]);

  return (
    <div data-ai-assistant data-ai-assistant-state={run.phase} data-ai-assistant-view={view} style={{ height: "100%", overflowY: "auto", fontFamily: "var(--font-sans)" }}>
      <PanelHeader title="AI Assistant" action={<PoweredByClaude size={10} />} />

      <div style={{ display: "flex", gap: 6, padding: "0 14px 12px" }}>
        <Btn sm tone={view === "ask" ? "soft" : undefined} disabled={!hasDocument || running} onClick={() => setAssistantView("ask")} testId="ai-view-ask">
          Ask
        </Btn>
        <Btn sm tone={view === "brief" ? "soft" : undefined} disabled={running} onClick={() => setAssistantView("brief")} testId="ai-view-brief">
          New document
        </Btn>
      </div>

      {view === "ask" ? (
        <AskView
          kind={kind ?? "page"}
          diagnosis={diagnosis}
          draft={session.draft}
          running={running}
          onAsk={ask}
        />
      ) : (
        <BriefView draft={session.draft} running={running} canBuild={editor != null} onBuild={build} />
      )}

      {run.phase !== "idle" && (
        <Section title={run.phase === "running" ? "Working" : run.phase === "done" ? "Done" : "Stopped"}>
          <div data-ai-steps style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {run.steps.length === 0 && run.phase === "running" && <StepLine step={{ label: "Thinking…", state: "info" }} />}
            {run.steps.map((s, i) => (
              <StepLine key={i} step={s} />
            ))}
          </div>
          {run.phase === "running" && (
            <div data-ai-status style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn sm onClick={() => stopAssistantRun()} testId="ai-stop">
                Stop
              </Btn>
            </div>
          )}
          {run.phase === "done" && (
            <div data-ai-result>
              <div data-ai-summary data-brief-summary style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 10 }}>
                {run.summary}
                {run.stopped ? " (It stopped before finishing.)" : ""}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {run.changed && (
                  <Btn sm onClick={() => void undoAssistantRun(client)} testId="ai-undo">
                    Undo
                  </Btn>
                )}
                <Btn sm tone="soft" onClick={() => dismissAssistantRun()} testId="ai-dismiss">
                  Done
                </Btn>
              </div>
            </div>
          )}
          {run.phase === "error" && (
            <div>
              <div data-ai-error data-brief-error role="alert" style={{ fontSize: 12.5, color: "var(--status-error)", marginBottom: 10 }}>
                {run.message}
              </div>
              <Btn sm tone="soft" onClick={() => dismissAssistantRun()} testId="ai-dismiss">
                Done
              </Btn>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function StepLine({ step }: { step: AssistantStep }) {
  const icon = step.state === "ok" ? "ui-check" : step.state === "failed" ? "ui-x" : "ui-dot";
  const color = step.state === "ok" ? "var(--status-approved)" : step.state === "failed" ? "var(--status-error)" : "var(--pg-muted-fg)";
  return (
    <div data-ai-step={step.state} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
      <Icon name={icon} size={13} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span>{step.label}</span>
    </div>
  );
}

function AskView({
  kind,
  diagnosis,
  draft,
  running,
  onAsk,
}: {
  kind: AssistantKind;
  diagnosis: string[];
  draft: string;
  running: boolean;
  onAsk: (text: string) => void;
}) {
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div
        data-ai-diagnosis
        style={{
          display: "flex",
          gap: 10,
          padding: 11,
          borderRadius: "var(--radius-lg)",
          background: "var(--primary-soft)",
          border: "1px solid color-mix(in srgb, var(--pg-primary) 26%, transparent)",
          marginBottom: 12,
        }}
      >
        <Icon name="ui-wand" size={18} style={{ color: "var(--pg-primary)", flexShrink: 0, marginTop: 1 }} />
        <div className="pg-ui-xs" style={{ flex: 1, lineHeight: 1.45, color: "var(--pg-fg)" }}>
          {diagnosis.length ? `This document has ${diagnosis.join(", ")}.` : "No overset text, image or font issues found."}
        </div>
      </div>

      <div className="pg-label" style={{ margin: "0 0 8px" }}>
        Suggestions
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        {SUGGESTIONS[kind].map(([icon, label]) => (
          <button
            type="button"
            key={label}
            disabled={running}
            onClick={() => onAsk(label)}
            data-ai-suggestion={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 30,
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              textAlign: "left",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: running ? "default" : "pointer",
              opacity: running ? 0.5 : 1,
            }}
          >
            <Icon name={icon} size={15} style={{ color: "var(--pg-muted-fg)" }} />
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAsk(draft);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <textarea
          value={draft}
          onChange={(e) => setAssistantDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onAsk(draft);
            }
          }}
          disabled={running}
          rows={3}
          placeholder="Ask for a change — “make this spread more premium”…"
          aria-label="Ask the AI Assistant"
          data-ai-input
          style={field}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn sm primary disabled={running || !draft.trim()} onClick={() => onAsk(draft)} testId="ai-ask">
            Ask Claude
          </Btn>
        </div>
      </form>
    </div>
  );
}

function BriefView({
  draft,
  running,
  canBuild,
  onBuild,
}: {
  draft: string;
  running: boolean;
  canBuild: boolean;
  onBuild: (brief: string, sizeId: string) => void;
}) {
  const sizeId = useSyncExternalStore(subscribeSize, getSize);
  return (
    <div data-new-from-brief style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="pg-ui-xs" style={{ lineHeight: 1.45, color: "var(--pg-muted-fg)" }}>
        Describe the document. Claude builds it page by page in a new document while you watch; every step can be undone.
      </div>
      <textarea
        value={draft}
        onChange={(e) => setAssistantDraft(e.target.value)}
        disabled={running}
        rows={6}
        placeholder="A four-page spring catalogue for a small tea shop: cover with a large headline, two pages of products with prices, a back page with opening hours and the address."
        aria-label="Brief"
        data-brief-input
        style={field}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ color: "var(--pg-muted-fg)" }}>Page size</span>
        <select value={sizeId} onChange={(e) => setSize(e.target.value)} disabled={running} data-brief-size style={select}>
          {SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn sm primary disabled={running || !draft.trim() || !canBuild} onClick={() => onBuild(draft, sizeId)} testId="brief-generate">
          Build document
        </Btn>
      </div>
    </div>
  );
}

// The page size survives the panel being hidden, like the rest of the session.
let size = "a4";
const sizeListeners = new Set<() => void>();
const getSize = () => size;
const subscribeSize = (l: () => void) => {
  sizeListeners.add(l);
  return () => sizeListeners.delete(l);
};
const setSize = (next: string) => {
  size = next;
  for (const l of sizeListeners) l();
};
