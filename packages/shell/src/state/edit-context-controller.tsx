// W3.2 — the edit-context CONTROLLER (closes plugin-draw B-02 /
// plugin-web W-03). The STACK (edit-context-stack.tsx) is pure state;
// THIS side-effect component wires the stack to the shell chrome:
//
//   · Esc POPS one level (the global keydown, skipped when an editable
//     field has focus — same guard as usePathEditMode);
//   · on the ACTIVE frame change → EMPHASIZE the context's panels
//     (cockpit `openPanel` raises each) and FOCUS the first restricted
//     tool ("anchor tools focused" — the tool-set swap, v1 depth);
//   · selection cleared / shrunk away from the scope root → EXIT ALL
//     (a marquee elsewhere or an empty-pasteboard click leaves no
//     context stuck — mirrors the path-edit auto-exit).
//
// Renders nothing — mounted once inside the shell where the cockpit +
// tool + selection contexts are available.

import { useEffect, useRef } from "react";

import { cockpitActions } from "../cockpit/cockpit-state-context";
import { useEditContextStack } from "./edit-context-stack";
import { useSelection } from "./selection-context";
import { useOptionalTool } from "./tool-context";
import type { ToolId } from "../registries/tool";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function EditContextController() {
  const { active, pop, exitAll } = useEditContextStack();
  const { elementSelection } = useSelection();
  const tool = useOptionalTool();

  // Esc pops ONE level. Capture phase so a context pop beats other Esc
  // consumers (the command palette / path-edit) only when a context is
  // active; when none is active we let the event flow untouched.
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!activeRef.current) return; // no context → don't intercept
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      pop();
    };
    // Capture so we win the Escape while a context is active.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pop]);

  // On the active frame ENTER → emphasize panels + focus the first tool.
  // Keyed by the frame identity (type + scope root) so re-running only
  // fires on a genuine enter, not on every render.
  const enteredKey = active
    ? `${active.type}:${JSON.stringify(active.scopeRoot)}`
    : null;
  const lastEnteredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || enteredKey === lastEnteredRef.current) return;
    lastEnteredRef.current = enteredKey;
    // Panel emphasis — raise each declared panel (cockpit owns
    // placement; openPanel is a no-op when the cockpit isn't mounted).
    for (const panelId of active.panelIds) {
      cockpitActions.openPanel?.(panelId);
    }
    // Tool-set swap (v1 depth): focus the first restricted tool. Full
    // rail graying-out of non-context tools is the documented residual;
    // focusing the primary anchor tool is the user-visible swap.
    if (active.toolIds.length > 0 && tool) {
      tool.setBaseTool(active.toolIds[0] as ToolId);
    }
  }, [active, enteredKey, tool]);

  // Auto-exit when the selection no longer includes the scope root (the
  // user selected something outside the context — a marquee elsewhere,
  // an empty click). Mirrors usePathEditMode's auto-exit.
  useEffect(() => {
    if (!active) return;
    const rootKey = JSON.stringify(active.scopeRoot);
    const stillSelected = elementSelection.some(
      (id) => JSON.stringify(id) === rootKey,
    );
    if (!stillSelected && elementSelection.length > 0) {
      // Selection moved to a DIFFERENT element — leave the context.
      exitAll();
    }
  }, [active, elementSelection, exitAll]);

  return null;
}
