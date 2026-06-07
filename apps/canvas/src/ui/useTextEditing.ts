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
// Selection updates happen optimistically on the main thread (insert
// at offset O shifts the caret to O+len) so the caret stays in step
// with typing; the worker's authoritative `MutationApplied` reply
// confirms or supersedes via subsequent caret queries (PagedShell's
// post-mutation refresh re-fetches caret + selection geometry).
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
import type { CanvasClient } from "@paged-media/client";
import type { CaretDirection, ContentSelection } from "@paged-media/client";

export interface TextEditingContext {
  client: CanvasClient | null;
  selection: ContentSelection | null;
  setSelection: (s: ContentSelection | null) => void;
}

export function useTextEditing(ctx: TextEditingContext) {
  // Shift-extend anchor: the offset that stays fixed while the focus
  // end moves. Reset to the caret offset on any non-extending move so a
  // fresh Shift+arrow grows from the current caret, not a stale anchor.
  const anchorRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const sel = ctx.selection;
      const client = ctx.client;
      if (!client) return;

      const cmd = e.metaKey || e.ctrlKey;
      // v35 cell qualifier — forwarded verbatim onto every text mutation
      // / nav query so a caret inside a table cell edits THAT cell's
      // stream. `undefined` (body selection) keeps the legacy wire shape.
      const cell = sel?.cell ?? undefined;

      // Cmd+Z / Cmd+Shift+Z. Always handled when client exists,
      // regardless of selection state.
      if (cmd && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          void client.redo();
        } else {
          void client.undo();
        }
        return;
      }

      // The remaining shortcuts require an active selection.
      if (!sel) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        anchorRef.current = null;
        if (sel.start === sel.end && sel.start === 0) return;
        if (sel.start === sel.end) {
          // Caret: delete one character backwards.
          const start = sel.start - 1;
          const end = sel.start;
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start, end, cell },
          });
          ctx.setSelection({
            ...sel,
            start,
            end: start,
            affinity: false,
          });
        } else {
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
          });
          ctx.setSelection({ ...sel, end: sel.start, affinity: false });
        }
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        anchorRef.current = null;
        if (sel.start === sel.end) {
          // Forward delete — defer correct end-of-story handling
          // (worker will reject if out of range).
          void client.mutate({
            op: "deleteRange",
            args: {
              storyId: sel.storyId,
              start: sel.start,
              end: sel.start + 1,
              cell,
            },
          });
        } else {
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
          });
          ctx.setSelection({ ...sel, end: sel.start, affinity: false });
        }
        return;
      }

      // Printable input. e.key is "a", "A", " ", etc. for character
      // keys; "Enter" / "Tab" / arrow keys handled elsewhere.
      if (e.key.length === 1 && !cmd && !e.altKey) {
        e.preventDefault();
        anchorRef.current = null;
        const text = e.key;
        // Optimistic local shift: caret advances by 1.
        if (sel.start === sel.end) {
          void client.mutate({
            op: "insertText",
            args: { storyId: sel.storyId, offset: sel.start, text, cell },
          });
          ctx.setSelection({
            ...sel,
            start: sel.start + text.length,
            end: sel.start + text.length,
            affinity: false,
          });
        } else {
          // Range selection: replace = delete + insert. Send as two
          // ops; the worker applies them in order.
          void client.mutate({
            op: "deleteRange",
            args: { storyId: sel.storyId, start: sel.start, end: sel.end, cell },
          });
          void client.mutate({
            op: "insertText",
            args: { storyId: sel.storyId, offset: sel.start, text, cell },
          });
          ctx.setSelection({
            ...sel,
            start: sel.start + text.length,
            end: sel.start + text.length,
            affinity: false,
          });
        }
        return;
      }

      // ── Caret navigation ────────────────────────────────────────
      // The caret offset (the "focus" the user steers) is the end the
      // last extend moved. For a collapsed selection both ends equal
      // the caret; for a range we treat `end` as the focus and `start`
      // as the implicit anchor, falling back to anchorRef when set.

      const caretFocus = focusOffset(sel, anchorRef.current);

      // Left / Right arrows move the caret by one offset. Cmd+Left /
      // Cmd+Right jump to the line start / end (macOS line-nav
      // convention) via lineBounds.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const toLineEdge = cmd; // Cmd+Arrow = line start/end on mac
        if (toLineEdge) {
          void applyLineEdge(
            client,
            sel,
            e.key === "ArrowLeft" ? "start" : "end",
            e.shiftKey,
            anchorRef,
            caretFocus,
            ctx.setSelection,
          );
          return;
        }
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const newFocus = Math.max(0, caretFocus + delta);
        applyMove(sel, newFocus, e.shiftKey, anchorRef, caretFocus, ctx.setSelection);
        return;
      }

      // Up / Down arrows: vertical nav owned by the engine (line
      // metrics + desired-x). Returned offset is the new focus.
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        const direction: CaretDirection = e.key === "ArrowUp" ? "up" : "down";
        void client
          .caretNav(sel.storyId, caretFocus, direction, cell ?? null)
          .then((offset) => {
            // null = no-op (already at first/last line): keep the caret.
            if (offset === null) return;
            applyMove(
              sel,
              offset,
              e.shiftKey,
              anchorRef,
              caretFocus,
              ctx.setSelection,
            );
          })
          .catch(() => {
            /* worker reload / disconnect — leave the caret put */
          });
        return;
      }

      // Home / End: line start / end via lineBounds. Stop propagation
      // so the page-navigation shortcut (also on window) doesn't also
      // fire while we own the caret.
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        void applyLineEdge(
          client,
          sel,
          e.key === "Home" ? "start" : "end",
          e.shiftKey,
          anchorRef,
          caretFocus,
          ctx.setSelection,
        );
        return;
      }
    };

    // Capture phase — preempt the bubble-phase page-nav shortcuts.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ctx]);
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
): Promise<void> {
  try {
    const bounds = await client.lineBounds(sel.storyId, caretFocus, sel.cell ?? null);
    if (!bounds) return;
    const target = edge === "start" ? bounds.lineStart : bounds.lineEnd;
    applyMove(sel, target, shift, anchorRef, caretFocus, setSelection);
  } catch {
    /* worker reload / disconnect — leave the caret put */
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
