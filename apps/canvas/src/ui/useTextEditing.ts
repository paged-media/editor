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

// Keyboard typing + caret navigation → mutation / selection dispatch.
//
// Phase 3 UI-2 — when there's a `ContentSelection`, intercept printable
// keystrokes + Backspace/Delete and route them through the worker's
// `Mutation` channel. Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z drive Undo/Redo.
//
// W2.11 — arrow-key caret navigation + Home/End. Left/Right move ±1
// offset locally (cheap, char-granular). Up/Down and Home/End need line
// metrics the main thread doesn't have, so they round-trip through the
// engine: `client.caretNav` (the engine owns the InDesign desired-x
// "goal column") and `client.lineBounds`. Shift extends from a stable
// anchor; the focus end moves via the same nav.
//
// ONE KEY AT A TIME (ED-18). Every key's work runs on a single promise
// chain, in the order the keys arrived, against the selection the
// previous key left behind (`selRef`, written synchronously — the React
// state it mirrors lands a render later). The engine round-trips of
// End / Home / Up / Down hold the chain until they answer. Before this,
// "End" then " A" typed quickly put the space at the OLD caret, and the
// late line-bounds answer then dragged the caret back over it, so the
// next letter landed in front of the space ("for" + End + " A" → "forA ").
// An engine answer is dropped when something outside this handler (a
// click, a panel) moved the selection while it was in flight.
//
// OFFSETS ARE UTF-8 BYTES. The engine addresses story text by byte
// (`wordBounds`, `lineBounds`, `insertText.offset` alike), so an insert
// advances the caret by the text's UTF-8 length, not its UTF-16 length —
// "ü" is two bytes, and advancing by one left the caret inside it.
//
// Escape (ED-1) leaves the text — the caret clears and the host selects
// the frame that held it with the Selection tool in hand — instead of
// leaving the caret live for the next key to type into.
//
// Paste (ED-2) arrives as the DOM `paste` event, whose plain-text payload
// needs no clipboard permission; copy and cut read the range from the
// engine and write it through `navigator.clipboard`.
//
// Listener runs in the CAPTURE phase: the page-navigation shortcuts
// (`useKeyboardShortcuts`) bind Home/End/PageUp/PageDown on `window`
// too, and listener order between two `window` keydown handlers isn't
// guaranteed. Capturing here lets us consume the key and
// `stopPropagation()` before the bubble-phase page-nav listener runs
// whenever a content selection is active.
//
// W2.11 (tables v2) — the selection's `cell` qualifier (v35) rides
// straight through. When `sel.cell` is set, `start`/`end` are
// cell-local offsets into that table cell's paragraph stream, and the
// `insertText` / `deleteRange` mutations must carry the SAME qualifier
// so the edit lands in the cell, not the body story. The qualifier is
// additive: body selections leave it `undefined` and the wire shape is
// byte-identical to before. Undo is correct because the engine's
// inverse op carries the same `cell` (proven by the cell-text probe).

import { useEffect, useRef } from "react";
import type {
  CanvasClient,
  CaretDirection,
  ContentSelection,
  Mutation,
} from "@paged-media/client";

export interface TextEditingContext {
  client: CanvasClient | null;
  selection: ContentSelection | null;
  setSelection: (s: ContentSelection | null) => void;
  /** ADR-012 — true while an active edit context owns undo (it declares
   *  `onUndo`). The edit-context controller routes Cmd-Z to that context;
   *  this hook must then leave the document stack alone. */
  undoOwnedByContext?: () => boolean;
  /** True while an edit context is active: its controller owns Escape
   *  (it cancels the context), so leaving the text is not ours to do. */
  escapeOwnedByContext?: () => boolean;
  /** Escape left the text. The caret is already cleared; the host puts
   *  the user back on the object level (InDesign: the frame that held
   *  the caret selected, the Selection tool in hand). */
  onLeaveText?: (left: ContentSelection) => void;
}

/** One key's work, run against the selection the previous key left. */
type Task = (
  sel: ContentSelection,
  client: CanvasClient,
) => void | Promise<void>;

const utf8 = new TextEncoder();

/** The engine's offsets are UTF-8 bytes. */
export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

export function useTextEditing(ctx: TextEditingContext) {
  // Shift-extend anchor: the offset that stays fixed while the focus
  // end moves. Reset to the caret offset on any non-extending move so a
  // fresh Shift+arrow grows from the current caret, not a stale anchor.
  const anchorRef = useRef<number | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // The selection as the last key left it. Synced from the prop only
  // when the prop CHANGES, so a render that has not caught up with this
  // handler's own writes cannot roll it back.
  const selRef = useRef<ContentSelection | null>(ctx.selection);
  const seenRef = useRef<ContentSelection | null>(ctx.selection);
  // Set by Escape until the queued exit runs, so keys pressed in between
  // (the "v" after Escape) are not typed into the text being left.
  const leavingRef = useRef(false);
  if (seenRef.current !== ctx.selection) {
    seenRef.current = ctx.selection;
    selRef.current = ctx.selection;
    leavingRef.current = false;
  }
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const setSel = (s: ContentSelection | null) => {
      selRef.current = s;
      ctxRef.current.setSelection(s);
    };
    const after = (work: () => unknown) => {
      queueRef.current = queueRef.current.then(async () => {
        try {
          await work();
        } catch {
          /* worker reload / disconnect — leave the caret put */
        }
      });
    };
    const enqueue = (task: Task) =>
      after(async () => {
        const sel = selRef.current;
        const client = ctxRef.current.client;
        if (!sel || !client) return;
        await task(sel, client);
      });
    /** An engine answer still applies only if nothing outside this
     *  handler moved the selection while the question was in flight. */
    const stillAt = (sel: ContentSelection) => selRef.current === sel;

    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const ctx = ctxRef.current;
      const client = ctx.client;
      if (!client) return;

      const cmd = e.metaKey || e.ctrlKey;
      const key = e.key;

      // Cmd+Z / Cmd+Shift+Z. Always handled when client exists,
      // regardless of selection state.
      if (cmd && (key === "z" || key === "Z")) {
        // Both this hook and the edit-context controller listen on
        // `window` in the capture phase, so stopPropagation in one never
        // stops the other and their order is registration order. While a
        // context owns undo, a document undo here as well would unwind
        // the document under the context's own step — inside a sheet it
        // undid the placed table's cell pour and emptied every cell.
        if (e.defaultPrevented || ctx.undoOwnedByContext?.()) return;
        e.preventDefault();
        // Behind any key still in flight, so it undoes what was typed.
        const redo = e.shiftKey;
        after(() => (redo ? client.redo() : client.undo()));
        return;
      }

      // The remaining shortcuts require an active selection.
      if (!selRef.current || leavingRef.current) return;

      if (key === "Escape") {
        if (e.defaultPrevented || ctx.escapeOwnedByContext?.()) return;
        e.preventDefault();
        e.stopPropagation();
        leavingRef.current = true;
        anchorRef.current = null;
        enqueue((left) => {
          leavingRef.current = false;
          setSel(null);
          ctxRef.current.onLeaveText?.(left);
        });
        return;
      }

      // Copy / cut a range. Pastes arrive as the `paste` event below.
      const letter = key.toLowerCase();
      if (cmd && !e.altKey && !e.shiftKey && (letter === "c" || letter === "x")) {
        const sel = selRef.current;
        if (sel.start === sel.end) return;
        e.preventDefault();
        const cut = letter === "x";
        enqueue(async (s, c) => {
          if (s.start === s.end) return;
          const text = await rangeText(c, s);
          if (text === null) return;
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            // Nothing reached the clipboard, so nothing may leave the
            // story either: a cut that lost the text would be data loss.
            return;
          }
          if (!cut) return;
          void c.mutate({
            op: "deleteRange",
            args: { storyId: s.storyId, start: s.start, end: s.end, cell: s.cell ?? undefined },
          });
          setSel({ ...s, end: s.start, affinity: false });
        });
        return;
      }

      if (key === "Backspace") {
        e.preventDefault();
        anchorRef.current = null;
        enqueue((sel, c) => {
          const cell = sel.cell ?? undefined;
          if (sel.start === sel.end && sel.start === 0) return;
          if (sel.start === sel.end) {
            // Caret: delete one character backwards.
            const start = sel.start - 1;
            void c.mutate({
              op: "deleteRange",
              args: { storyId: sel.storyId, start, end: sel.start, cell },
            });
            setSel({ ...sel, start, end: start, affinity: false });
          } else {
            void c.mutate({
              op: "deleteRange",
              args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
            });
            setSel({ ...sel, end: sel.start, affinity: false });
          }
        });
        return;
      }

      if (key === "Delete") {
        e.preventDefault();
        anchorRef.current = null;
        enqueue((sel, c) => {
          const cell = sel.cell ?? undefined;
          if (sel.start === sel.end) {
            // Forward delete — defer correct end-of-story handling
            // (worker will reject if out of range).
            void c.mutate({
              op: "deleteRange",
              args: { storyId: sel.storyId, start: sel.start, end: sel.start + 1, cell },
            });
          } else {
            void c.mutate({
              op: "deleteRange",
              args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
            });
            setSel({ ...sel, end: sel.start, affinity: false });
          }
        });
        return;
      }

      // Printable input. e.key is "a", "A", " ", etc. for character
      // keys; "Enter" / "Tab" / arrow keys handled elsewhere.
      if (key.length === 1 && !cmd && !e.altKey) {
        e.preventDefault();
        anchorRef.current = null;
        enqueue((sel, c) => insertAt(c, sel, key, setSel));
        return;
      }

      // ── Caret navigation ────────────────────────────────────────
      // The caret offset (the "focus" the user steers) is the end the
      // last extend moved. For a collapsed selection both ends equal
      // the caret; for a range we treat `end` as the focus and `start`
      // as the implicit anchor, falling back to anchorRef when set.
      const shift = e.shiftKey;

      // Left / Right arrows move the caret by one offset. Cmd+Left /
      // Cmd+Right jump to the line start / end (macOS line-nav
      // convention) via lineBounds.
      if (key === "ArrowLeft" || key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const toLineEdge = cmd; // Cmd+Arrow = line start/end on mac
        enqueue(async (sel, c) => {
          const caretFocus = focusOffset(sel, anchorRef.current);
          if (toLineEdge) {
            await applyLineEdge(c, sel, key === "ArrowLeft" ? "start" : "end", shift, anchorRef, caretFocus, setSel, stillAt);
            return;
          }
          const delta = key === "ArrowLeft" ? -1 : 1;
          const newFocus = Math.max(0, caretFocus + delta);
          applyMove(sel, newFocus, shift, anchorRef, caretFocus, setSel);
        });
        return;
      }

      // Up / Down arrows: vertical nav owned by the engine (line
      // metrics + desired-x). Returned offset is the new focus.
      if (key === "ArrowUp" || key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        const direction: CaretDirection = key === "ArrowUp" ? "up" : "down";
        enqueue(async (sel, c) => {
          const caretFocus = focusOffset(sel, anchorRef.current);
          const offset = await c.caretNav(sel.storyId, caretFocus, direction, sel.cell ?? null);
          // null = no-op (already at first/last line): keep the caret.
          if (offset === null || !stillAt(sel)) return;
          applyMove(sel, offset, shift, anchorRef, caretFocus, setSel);
        });
        return;
      }

      // Home / End: line start / end via lineBounds. Stop propagation
      // so the page-navigation shortcut (also on window) doesn't also
      // fire while we own the caret.
      if (key === "Home" || key === "End") {
        e.preventDefault();
        e.stopPropagation();
        enqueue((sel, c) =>
          applyLineEdge(
            c,
            sel,
            key === "Home" ? "start" : "end",
            shift,
            anchorRef,
            focusOffset(sel, anchorRef.current),
            setSel,
            stillAt,
          ),
        );
        return;
      }
    };

    // Paste — the DOM event carries the clipboard's plain text without a
    // permission prompt. Lands through the same insert as typing; a range
    // is replaced in ONE batch, so one undo takes the whole paste back.
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!selRef.current || leavingRef.current || !ctxRef.current.client) return;
      const raw = e.clipboardData?.getData("text/plain") ?? "";
      if (!raw) return;
      e.preventDefault();
      // Another app's line breaks (CRLF, CR) are each one paragraph break.
      const text = raw.replace(/\r\n?/g, "\n");
      anchorRef.current = null;
      enqueue((sel, c) => insertAt(c, sel, text, setSel));
    };

    // Capture phase — preempt the bubble-phase page-nav shortcuts.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("paste", onPaste, true);
    };
  }, []);
}

/** Insert `text` at the caret, or replace the range with it, and move
 *  the caret past it. A replace is one `batch`, so it undoes as one. */
function insertAt(
  client: CanvasClient,
  sel: ContentSelection,
  text: string,
  setSel: (s: ContentSelection | null) => void,
): void {
  const cell = sel.cell ?? undefined;
  const insert: Mutation = {
    op: "insertText",
    args: { storyId: sel.storyId, offset: sel.start, text, cell },
  };
  if (sel.start === sel.end) {
    void client.mutate(insert);
  } else {
    void client.mutate({
      op: "batch",
      args: {
        ops: [
          {
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
          },
          insert,
        ],
      },
    });
  }
  const caret = sel.start + byteLength(text);
  setSel({ ...sel, start: caret, end: caret, affinity: false });
}

/** The text of a body range, read from the engine. Paragraphs join with
 *  the engine's own "\n" boundary and the offsets are UTF-8 bytes, so the
 *  range is cut from the encoded text. `null` when the story cannot be
 *  read or the range sits in a table cell (whose text the story content
 *  read does not carry). */
async function rangeText(
  client: CanvasClient,
  sel: ContentSelection,
): Promise<string | null> {
  if (sel.cell) return null;
  const reply = await client.send({
    kind: "requestStoryContent",
    payload: { storyId: sel.storyId },
  });
  if (reply.kind !== "storyContentResult" || !reply.payload.content) return null;
  const text = reply.payload.content.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(""))
    .join("\n");
  const bytes = utf8.encode(text);
  return new TextDecoder().decode(bytes.slice(sel.start, sel.end));
}

/** The frame that holds the caret — where it is laid out, or, for an
 *  overset caret with no geometry, the last frame of the story's thread. */
export async function frameHoldingCaret(
  client: CanvasClient,
  sel: ContentSelection,
): Promise<string | null> {
  try {
    const caret = await client.caretGeometry({ ...sel, end: sel.start });
    if (caret?.frameId) return caret.frameId;
  } catch {
    /* fall through to the thread */
  }
  try {
    const links = await client.frameChain(sel.storyId);
    return links[links.length - 1]?.frameId ?? null;
  } catch {
    return null;
  }
}

/** The steerable end of the selection. For a collapsed caret both ends
 *  are the focus; for a range, `end` is the focus unless a recorded
 *  anchor says otherwise (an extend that collapsed the focus onto the
 *  anchor's far side). */
function focusOffset(sel: ContentSelection, anchor: number | null): number {
  if (sel.start === sel.end) return sel.start;
  if (anchor === sel.start) return sel.end;
  if (anchor === sel.end) return sel.start;
  return sel.end;
}

/** Apply a focus move. Non-shift collapses to the new focus and clears
 *  the anchor; shift extends from a stable anchor (seeded from the
 *  current caret on the first extend) to the new focus. */
function applyMove(
  sel: ContentSelection,
  newFocus: number,
  shift: boolean,
  anchorRef: React.MutableRefObject<number | null>,
  caretFocus: number,
  setSelection: (s: ContentSelection | null) => void,
): void {
  if (shift) {
    const anchor = anchorRef.current ?? caretFocus;
    anchorRef.current = anchor;
    setSelection({
      ...sel,
      start: Math.min(anchor, newFocus),
      end: Math.max(anchor, newFocus),
      affinity: false,
    });
  } else {
    anchorRef.current = null;
    setSelection({
      ...sel,
      start: newFocus,
      end: newFocus,
      affinity: false,
    });
  }
}

/** Resolve the line containing the caret focus and move/extend to its
 *  start or end. */
async function applyLineEdge(
  client: CanvasClient,
  sel: ContentSelection,
  edge: "start" | "end",
  shift: boolean,
  anchorRef: React.MutableRefObject<number | null>,
  caretFocus: number,
  setSelection: (s: ContentSelection | null) => void,
  stillAt: (sel: ContentSelection) => boolean,
): Promise<void> {
  const bounds = await client.lineBounds(sel.storyId, caretFocus, sel.cell ?? null);
  if (!bounds || !stillAt(sel)) return;
  const target = edge === "start" ? bounds.lineStart : bounds.lineEnd;
  applyMove(sel, target, shift, anchorRef, caretFocus, setSelection);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
