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

// File ▸ New from a brief… (ADR 221): describe a document, Claude builds
// it. The dialog mints a blank page of the chosen size (the same path as
// File ▸ New, including the discard question), then runs the agent in
// document mode: styles and swatches first, then page by page, checking
// each for overset text and rendering it where the layout matters. Every
// step is an ordinary undoable script write, visible on the canvas as it
// happens.

import { useCallback, useEffect, useState } from "react";

import { describeAiError, plainSummary, runEditorAgent } from "../ai/editor-ai";
import { PoweredByClaude } from "../ai/powered-by-claude";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { confirmDiscard, mintBlankDocument } from "../state/commands/file-commands";
import { useOptionalPaged } from "../state/paged-editor";

type DialogAction = "open" | "close";
const listeners = new Set<(action: DialogAction) => void>();

/** Open/close the dialog from anywhere (the notifyPalette pattern). */
export function notifyNewFromBriefDialog(action: DialogAction): void {
  for (const fn of listeners) fn(action);
}

const SIZES: Array<{ id: string; label: string; pt: [number, number] }> = [
  { id: "a4", label: "A4", pt: [595, 842] },
  { id: "letter", label: "US Letter", pt: [612, 792] },
  { id: "a5", label: "A5", pt: [420, 595] },
  { id: "a3", label: "A3", pt: [842, 1191] },
  { id: "square", label: "Square 210 mm", pt: [595, 595] },
];

type Phase =
  | { kind: "idle" }
  | { kind: "running"; step: number; controller: AbortController }
  | { kind: "done"; summary: string; stopped: boolean }
  | { kind: "error"; message: string };

export function NewFromBriefDialog() {
  const editor = useOptionalPaged();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [sizeId, setSizeId] = useState("a4");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    const fn = (action: DialogAction) => {
      setOpen(action === "open");
      if (action === "open") setPhase({ kind: "idle" });
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const generate = useCallback(async () => {
    if (!editor || !brief.trim() || phase.kind === "running") return;
    const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0]!;
    if (!(await confirmDiscard(editor, "Creating a new document"))) return;
    const controller = new AbortController();
    setPhase({ kind: "running", step: 0, controller });
    try {
      await mintBlankDocument(editor, size.pt, { setStatus: () => {}, pushWarning: () => {} });
      const result = await runEditorAgent(editor.client, {
        mode: "document",
        prompt: `${brief.trim()}\n\nPage size: ${size.label} (${size.pt[0]} × ${size.pt[1]} pt). The document is open with one blank page of that size.`,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "script") setPhase((p) => (p.kind === "running" ? { ...p, step: p.step + 1 } : p));
        },
      });
      if (result.outcome === "refused") setPhase({ kind: "error", message: "Claude declined this brief." });
      else setPhase({ kind: "done", summary: plainSummary(result.summary) || "Done.", stopped: result.outcome !== "done" });
    } catch (err) {
      setPhase({ kind: "error", message: describeAiError(err) });
    }
  }, [editor, brief, sizeId, phase.kind]);

  const running = phase.kind === "running";

  return (
    <Dialog open={open} onOpenChange={(next) => !running && setOpen(next)}>
      <DialogContent data-new-from-brief style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle>New document from a brief</DialogTitle>
          <DialogDescription>Describe the document. Claude builds it page by page in a new document; every step can be undone.</DialogDescription>
        </DialogHeader>

        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={running}
          rows={6}
          placeholder="A four-page spring catalogue for a small tea shop: cover with a large headline, two pages of products with prices, a back page with opening hours and the address."
          aria-label="Brief"
          data-brief-input
          style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: "var(--radius-md)", border: "1px solid var(--pg-border)", background: "var(--pg-bg)", color: "var(--pg-fg)", resize: "vertical" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ opacity: 0.8 }}>Page size</span>
          <select
            value={sizeId}
            onChange={(e) => setSizeId(e.target.value)}
            disabled={running}
            data-brief-size
            style={{
              background: "var(--pg-muted)",
              color: "var(--pg-fg)",
              border: "1px solid var(--chrome-divider)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              minHeight: 26,
              padding: "0 6px",
            }}
          >
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {phase.kind === "running" && (
          <div data-brief-status style={{ fontSize: 12, opacity: 0.8 }}>
            Building… {phase.step > 0 ? `step ${phase.step}` : "planning"}
          </div>
        )}
        {phase.kind === "done" && (
          <div data-brief-summary style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {phase.summary}
            {phase.stopped ? " (It stopped before finishing.)" : ""}
          </div>
        )}
        {phase.kind === "error" && (
          <div data-brief-error role="alert" style={{ fontSize: 12, color: "var(--status-error)" }}>
            {phase.message}
          </div>
        )}

        <DialogFooter style={{ alignItems: "center" }}>
          <span style={{ marginRight: "auto" }}>
            <PoweredByClaude size={10} />
          </span>
          {running ? (
            <Button variant="outline" onClick={() => phase.controller.abort()} data-action="brief-stop">
              Stop
            </Button>
          ) : phase.kind === "done" ? (
            <Button onClick={() => setOpen(false)} data-action="brief-close">
              Close
            </Button>
          ) : (
            <Button onClick={() => void generate()} disabled={!brief.trim() || !editor} data-action="brief-generate">
              Build document
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
