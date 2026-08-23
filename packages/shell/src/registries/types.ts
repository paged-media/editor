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

// Cross-registry shared types. Kept in their own module so each
// registry file can be read top-down without forward references.

/**
 * Returned by every `register` call so callers can clean up at
 * unmount time. Stable shape — the matching `dispose()` is the
 * only API surface this exposes.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Initial dock edge for a panel. Users may rearrange after mount;
 * this is initial-placement-only.
 */
export type DockEdge = "left" | "right" | "top" | "bottom" | "center";

/**
 * Predicate evaluated against application state to decide whether
 * a contribution is visible / enabled.
 *
 * The string form (e.g. `"selection.hasType('TextFrame')"`) is the
 * future bundle-friendly DSL; today only the function form is
 * implemented. The string variant resolves to the always-false
 * predicate so contributions that use the DSL are inert until the
 * evaluator lands.
 */
export type VisibilityPredicate =
  | string
  | ((state: unknown) => boolean);

/**
 * Evaluate a {@link VisibilityPredicate} against application state.
 *
 * THE ONE EVALUATOR. It lived inside `keybinding.ts` and was therefore
 * the reason `when` was honoured by exactly one of the five registries
 * that declare it — the other four had no way to ask without copying
 * it. Sharing it is what lets `when` mean the same thing everywhere,
 * which is the only way a contribution author can trust it.
 *
 * Absent ⇒ enabled: a contribution that says nothing is available.
 * A THROWING predicate ⇒ DISABLED, deliberately. A predicate that
 * cannot decide has not established that the command is safe to offer,
 * and offering it anyway is how a broken guard becomes a live command.
 *
 * The string DSL form is inert (always false) until an evaluator lands
 * — the same posture the type documents.
 */
export function isEnabled(
  when: VisibilityPredicate | undefined,
  getState: (() => unknown) | undefined,
): boolean {
  if (when === undefined) return true;
  if (typeof when === "function") {
    try {
      return Boolean(when(getState?.()));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * ADR 024 — may a panel be OFFERED where the user currently is?
 *
 * `false` only when ANOTHER edit context claims this panel and that
 * context is not the active one. Deliberately narrow:
 *
 *   · a panel no context claims stays offered, because host panels and
 *     the selection-driven plugin panels (paged.image's adjustments on
 *     a selected frame) are legitimately usable without entering
 *     anything;
 *   · the ACTIVE context's own panels stay offered, obviously;
 *   · only a panel that is somebody ELSE'S content surface is hidden —
 *     "Vector stroke" while editing a Word document is a control for
 *     content that is not on screen and cannot be reached from here.
 *
 * Pure and exported so it can be tested without a shell: `state` is the
 * `PagedEditor` handle, read structurally rather than by type, because
 * this lives below the module that defines it.
 */
export function panelBelongsHere(state: unknown, panelId: string): boolean {
  const s = state as {
    editContext?: { type?: string } | null;
    registries?: { editContexts?: { list?: () => unknown[] } };
  } | null;
  const list = s?.registries?.editContexts?.list?.();
  if (!list) return true; // No registry to ask — offer it.
  const activeType = s?.editContext?.type ?? null;
  for (const raw of list) {
    const c = raw as { type?: string; panelIds?: readonly string[] };
    if (!c.panelIds?.includes(panelId)) continue;
    // Claimed by the active context → offered.
    if (c.type === activeType) return true;
    // Claimed by a context that is not active → not offered.
    return false;
  }
  return true;
}
