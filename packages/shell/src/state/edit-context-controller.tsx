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

// W3.2 — the edit-context CONTROLLER (closes plugin-draw B-02 /
// plugin-web W-03). The STACK (edit-context-stack.tsx) is pure state;
// THIS side-effect component wires the stack to the shell chrome:
//
//   · Esc POPS one level (the global keydown, skipped when an editable
//     field has focus — same guard as usePathEditMode);
//   · on the ACTIVE frame change → EMPHASIZE the context's panels
//     (cockpit `openPanel` raises each — UNLESS the panel on screen is
//     one this context SERVES, see below) and FOCUS the first restricted
//     tool ("anchor tools focused" — the tool-set swap, v1 depth);
//   · selection cleared / shrunk away from the scope root → EXIT ALL
//     (a marquee elsewhere or an empty-pasteboard click leaves no
//     context stuck — mirrors the path-edit auto-exit).
//
// Renders nothing — mounted once inside the shell where the cockpit +
// tool + selection contexts are available.

import { useEffect, useRef } from "react";

import { useBindingProviderHost } from "../catalog/binding-providers";
import { panelServedBy } from "../catalog/panel-binding-surface";
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
  const { active, activeContribution, commit, cancel, isActiveDirty, exitAll } =
    useEditContextStack();
  const { elementSelection } = useSelection();
  const tool = useOptionalTool();
  // ADR 023 follow-up — held in a ref because the enter effect below is
  // keyed on the frame identity and must NOT re-run because the registry
  // emitted (entering a context emits, by construction).
  const providerHost = useBindingProviderHost();
  const providerHostRef = useRef(providerHost);
  providerHostRef.current = providerHost;

  // K-1 — keyboard routing while a context is active (capture phase so the
  // context wins over the palette / path-edit; the editable-target guard
  // keeps Enter/Esc for a focused <input> elsewhere). Policy:
  //   · MID SUB-EDIT (isDirty, e.g. an in-frame cell being typed): the
  //     context's `onContentKey` owns ALL keys — Enter commits the CELL,
  //     Esc cancels the CELL, the context stays.
  //   · otherwise Esc CANCELS the context (onCancel→onExit); Enter COMMITS
  //     it but only when it opts in (onCommit — sheet has none at the
  //     context level, so Enter falls through to start/forward below);
  //   · a printable / editing key (no Cmd/Ctrl) is FORWARDED to
  //     `onContentKey` (e.g. typing begins a cell edit). Shortcuts pass
  //     through untouched.
  const activeRef = useRef(active);
  activeRef.current = active;
  const contributionRef = useRef(activeContribution);
  contributionRef.current = activeContribution;
  const wantsCommitRef = useRef<boolean>(false);
  wantsCommitRef.current = !!activeContribution?.onCommit;
  const isDirtyRef = useRef(isActiveDirty);
  isDirtyRef.current = isActiveDirty;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return; // no context → don't intercept
      if (isEditableTarget(e.target)) return;
      const contribution = contributionRef.current;
      const onContentKey = contribution?.onContentKey;

      // ADR-012 Tier 1 — a context that DECLARES undo ownership gets the
      // un/redo chords routed to ITS op-log; the document stack stays
      // suspended until the modal exit (Tier 2: one batch). Ranked above
      // the dirty branch so Cmd-Z mid-cell-edit reaches the plugin's
      // undo (which may first unwind the in-flight buffer) instead of
      // vanishing into onContentKey. No fall-through on `false` — the
      // boundary IS the modal entry/exit (ADR-012).
      if (
        contribution?.onUndo &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) contribution.onRedo?.();
        else contribution.onUndo();
        return;
      }

      // Mid sub-edit → the context owns every key.
      if (onContentKey && isDirtyRef.current()) {
        e.preventDefault();
        e.stopPropagation();
        onContentKey(e);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (e.key === "Enter" && wantsCommitRef.current) {
        e.preventDefault();
        e.stopPropagation();
        commit();
        return;
      }
      // Forward a printable / editing key (no modifier combo) to the
      // context — e.g. typing into a selected cell begins an edit.
      if (
        onContentKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")
      ) {
        e.preventDefault();
        e.stopPropagation();
        onContentKey(e);
      }
    };
    // Capture so we win these keys while a context is active.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commit, cancel]);

  // On the active frame ENTER → emphasize panels + focus the first tool.
  // Keyed by the frame identity (type + scope root) so re-running only
  // fires on a genuine enter, not on every render.
  const enteredKey = active
    ? `${active.type}:${JSON.stringify(active.scopeRoot)}`
    : null;
  const lastEnteredRef = useRef<string | null>(null);
  /** The tool in hand as this entry began — see the leave-by-tool rule. */
  const toolAtEntryRef = useRef<string | null>(null);
  /** The live tool, readable from the entry effect without making that
   *  effect depend on it (it is keyed on the frame, not the tool). */
  const activeToolRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      // FORGET the last entry when the stack empties. Without this the
      // guard also suppresses a genuine RE-entry: leave a context with Esc
      // and double-click the SAME element again and the key is unchanged,
      // so neither the panel emphasis nor the tool focus ever ran a second
      // time. Found while testing the ADR 023 non-displacement rule; the
      // defect predates it.
      lastEnteredRef.current = null;
      return;
    }
    if (enteredKey === lastEnteredRef.current) return;
    lastEnteredRef.current = enteredKey;
    // Panel emphasis — raise each declared panel (cockpit owns
    // placement; openPanel is a no-op when the cockpit isn't mounted).
    //
    // ADR 023 follow-up — EXCEPT when raising would displace a panel this
    // context SERVES. `panelIds` was written when every panel belonged to
    // one owner, so "raise mine" and "keep the shared one visible" could
    // not conflict; with a host panel that retargets they do, and the
    // dock shows one panel at a time — so the shared panel would go off
    // screen at the exact moment it retargets, which is the one moment
    // the whole design exists to produce.
    //
    // The answer is NOT a second declaration beside `panelIds` (that
    // would put host panel ids in plugin code and could drift from
    // `provides`). It is inferred from what the context's own providers
    // ALREADY declare, intersected with what the panel on screen actually
    // asks the seam about — see catalog/panel-binding-surface.tsx. The
    // authority is purely NEGATIVE: it can only withhold the raise, never
    // open or close anything on the plugin's behalf.
    const onScreen = cockpitActions.activeTab?.() ?? null;
    const host = providerHostRef.current;
    const serving =
      onScreen !== null &&
      host !== null &&
      panelServedBy(
        onScreen,
        host
          .activeProviders()
          .filter((p) => p.contextType === active.type)
          .map((p) => p.provides),
      );
    for (const panelId of active.panelIds) {
      // Still OPENED either way — the context's own surface reaches the
      // tab strip and is one click away; only the raise is withheld.
      cockpitActions.openPanel?.(panelId, { activate: !serving });
    }
    // Tool-set swap (v1 depth): focus the first restricted tool. Full
    // rail graying-out of non-context tools is the documented residual;
    // focusing the primary anchor tool is the user-visible swap.
    // Focus the context's primary tool. A declared-empty list has no
    // primary and must not fall back to the host's — the context said
    // no tool applies.
    const primary = active.toolIds?.[0];
    if (primary && tool) tool.setBaseTool(primary as ToolId);
    // The tool this entry STARTS from. The leave-by-tool rule below
    // fires on a CHANGE away from it, never on the tool that was
    // already in hand — otherwise a context declaring `toolIds: []`
    // would exit itself the instant it opened, since every tool is
    // outside an empty set including the one the user already held.
    toolAtEntryRef.current = (primary ?? activeToolRef.current) ?? null;
  }, [active, enteredKey, tool]);

  // ADR 024 — LEAVING BY TOOL, derived rather than wired per entry point.
  //
  // Picking a tool the context does not own means "I am done in here",
  // and the ToolRail already implemented exactly that: commit the
  // context, then activate. The problem was that it was the ONLY caller
  // to do so — `Tools: <name>` from the palette, the tool's keyboard
  // shortcut, and the cockpit toolbar's pills all called `setBaseTool`
  // straight, leaving the user inside a context whose declared tool set
  // no longer matched the active tool. Four surfaces for one action,
  // one of them right.
  //
  // Watching the RESULT instead of patching each caller covers all of
  // them, plus the ones that do not exist yet — a plugin command, a
  // script. The rail's own commit becomes redundant and stays harmless.
  //
  // Ordering: the enter effect above sets the tool to `toolIds[0]`,
  // which is in the set by construction, so entry can never trip this.
  // The `enteredKey` guard is shared for the same reason it exists
  // there — a re-entry on the same element must not be suppressed.
  const activeTool = tool?.effectiveTool;
  activeToolRef.current = activeTool ?? null;
  useEffect(() => {
    if (!active || !active.toolIds || !activeTool) return;
    // Unchanged since entry — the user has not reached for anything.
    if (activeTool === toolAtEntryRef.current) return;
    // Not yet swapped for this entry — the enter effect owns the first
    // tool and has not run. Acting now would exit the context we are in
    // the middle of entering.
    if (enteredKey !== lastEnteredRef.current) return;
    if (active.toolIds.includes(activeTool)) return;
    // COMMIT, not cancel: the user reached for another tool, they did
    // not press Esc. Discarding their in-flight edit because they
    // clicked the wrong thing would be its own defect.
    commit();
  }, [active, activeTool, commit, enteredKey]);

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
