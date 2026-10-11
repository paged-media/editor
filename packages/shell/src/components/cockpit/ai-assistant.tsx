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

// Cockpit — the AI Assistant card (kit inspectors.jsx AIAssistant,
// briefing §12.3: diagnose → propose → apply), live since ADR 221.
//
// - Diagnose: computed here, with no model call — overset stories, low-res
//   and missing images, missing fonts, from the same collections the
//   Publication health panel reads.
// - Propose / apply: a suggestion or a typed request goes to Claude with
//   the selection and the diagnosis; the agent writes and runs paged.*
//   scripts through the undoable script door until the change is made.
// - Undo: reverts exactly Claude's steps, and only while nothing was
//   edited after it (the undo stack is shared with the user's own edits).

import { useCallback, useMemo, useState } from "react";

import type { FontSummary, LinkSummary } from "@paged-media/client";

import { describeAiError, plainSummary, runEditorAgent, undoBackTo, undoTop } from "../../ai/editor-ai";
import { PoweredByClaude } from "../../ai/powered-by-claude";
import { useCollection, useDocumentStats } from "../../catalog/use-collection";
import { useCanvasClient } from "../../state/canvas-client-context";
import { Icon } from "../../icons";
import { useContentSelection } from "../../state/content-selection-context";
import { useSelection } from "../../state/selection-context";

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

type RunState =
  | { phase: "idle" }
  | { phase: "running"; label: string; controller: AbortController }
  | { phase: "done"; summary: string; before: number; after: number; changed: boolean }
  | { phase: "error"; message: string };

export function AIAssistant({ kind }: { kind: AssistantKind }) {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const stats = useDocumentStats();
  const links = useCollection<LinkSummary>("links");
  const fonts = useCollection<FontSummary>("fonts");
  const [request, setRequest] = useState("");
  const [state, setState] = useState<RunState>({ phase: "idle" });

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
    const lines = [`The user has a ${kind} selected.`];
    const ids = elementSelection.filter((e) => typeof e.id === "string").map((e) => `${e.kind}:${e.id as string}`);
    if (ids.length) lines.push(`Selected elements: ${ids.join(", ")}.`);
    if (contentSelection) {
      const { storyId, start, end } = contentSelection;
      lines.push(start === end ? `Text caret in ${storyId} at offset ${start}.` : `Selected text: storyRange:${storyId}@${start}..${end}.`);
    }
    lines.push(diagnosis.length ? `Document issues: ${diagnosis.join(", ")}.` : "The document has no overset text, image or font issues.");
    return lines.join("\n");
  }, [kind, elementSelection, contentSelection, diagnosis]);

  const ask = useCallback(
    async (what: string) => {
      const text = what.trim();
      if (!text || state.phase === "running") return;
      const controller = new AbortController();
      setState({ phase: "running", label: "Thinking…", controller });
      try {
        const before = await undoTop(client);
        const result = await runEditorAgent(client, {
          mode: "assist",
          prompt: `${context()}\n\nRequest: ${text}`,
          signal: controller.signal,
          onEvent: (e) => {
            if (e.type === "script") setState((s) => (s.phase === "running" ? { ...s, label: "Changing the document…" } : s));
            else if (e.type === "render") setState((s) => (s.phase === "running" ? { ...s, label: "Checking the page…" } : s));
          },
        });
        const after = await undoTop(client);
        if (result.outcome === "refused") {
          setState({ phase: "error", message: "Claude declined this request." });
          return;
        }
        const note = result.outcome === "done" ? "" : " It stopped before finishing.";
        setState({ phase: "done", summary: (plainSummary(result.summary) || "Done.") + note, before, after, changed: after !== before });
        setRequest("");
      } catch (err) {
        setState({ phase: "error", message: describeAiError(err) });
      }
    },
    [client, context, state.phase],
  );

  const revert = useCallback(async () => {
    if (state.phase !== "done") return;
    const ok = await undoBackTo(client, state.before, state.after);
    setState(ok ? { phase: "idle" } : { phase: "error", message: "The document changed after Claude's edit, so it was not undone. Use Edit ▸ Undo instead." });
  }, [client, state]);

  const running = state.phase === "running";

  return (
    <div
      data-ai-assistant
      data-ai-assistant-state={state.phase}
      style={{
        margin: "0 14px 16px",
        padding: 14,
        borderRadius: "var(--radius-xl)",
        background: "var(--primary-soft)",
        border: "1px solid color-mix(in srgb, var(--pg-primary) 26%, transparent)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="ui-wand" size={17} style={{ color: "var(--pg-primary)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>AI Assistant</span>
        <span style={{ marginLeft: "auto" }}>
          <PoweredByClaude size={10} />
        </span>
      </div>

      <div
        data-ai-diagnosis
        style={{
          display: "flex",
          gap: 10,
          padding: 11,
          borderRadius: "var(--radius-lg)",
          background: "var(--pg-bg)",
          border: "1px solid var(--pg-border)",
          marginBottom: 12,
        }}
      >
        <Icon name="ui-wand" size={18} style={{ color: diagnosis.length ? "var(--status-warn, var(--pg-primary))" : "var(--pg-muted-fg)", flexShrink: 0, marginTop: 1 }} />
        <div className="pg-ui-xs" style={{ flex: 1, lineHeight: 1.45, color: "var(--pg-fg)" }}>
          {diagnosis.length ? `This document has ${diagnosis.join(", ")}.` : "No overset text, image or font issues found."}
        </div>
      </div>

      {state.phase === "running" ? (
        <div data-ai-status style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12 }}>
          <span style={{ flex: 1, color: "var(--pg-muted-fg)" }}>{state.label}</span>
          <button type="button" className="pg-ui-xs" onClick={() => state.controller.abort()} data-action="ai-stop">
            Stop
          </button>
        </div>
      ) : state.phase === "done" ? (
        <div data-ai-result style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.45 }}>
          <div style={{ marginBottom: 8, whiteSpace: "pre-wrap" }} data-ai-summary>
            {state.summary}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {state.changed && (
              <button type="button" className="pg-ui-xs" onClick={() => void revert()} data-action="ai-undo">
                Undo
              </button>
            )}
            <button type="button" className="pg-ui-xs" onClick={() => setState({ phase: "idle" })} data-action="ai-dismiss">
              Done
            </button>
          </div>
        </div>
      ) : state.phase === "error" ? (
        <div data-ai-error role="alert" style={{ marginBottom: 12, fontSize: 12, color: "var(--status-error)" }}>
          {state.message}
        </div>
      ) : null}

      <div className="pg-label" style={{ margin: "0 0 8px" }}>
        Suggestions
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        {SUGGESTIONS[kind].map(([icon, label]) => (
          <button
            type="button"
            key={label}
            disabled={running}
            onClick={() => void ask(label)}
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
          void ask(request);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          padding: "0 12px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--pg-border)",
          background: "var(--pg-bg)",
        }}
      >
        <Icon name="ui-wand" size={14} style={{ color: "var(--pg-primary)" }} />
        <input
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          disabled={running}
          placeholder="Make this spread more premium…"
          aria-label="Ask the AI Assistant"
          data-ai-input
          style={{ flex: 1, minWidth: 0, fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--pg-fg)" }}
        />
      </form>
    </div>
  );
}
