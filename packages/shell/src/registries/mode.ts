import type { ComponentType } from "react";

import type { Disposable } from "./types";
import type { WorkflowMode } from "../state/workflow-mode-context";

// Design system (publishing cockpit) — workflow-mode contributions.
// "Apps register, shell renders": the app declares what each mode
// means (toolbar segment, panel sets, palette suggestions); the
// shell's ModeSwitcher / ContextToolbar / mode-layout hook render
// and apply it. Mirrors the PanelRegistry idiom exactly.

export interface ModeToolbarProps {
  /** Editor handle (PagedEditor) — same contract as PanelProps. */
  paged: unknown;
}

/**
 * One workflow mode. The PANELS named here must be registered
 * through the normal panel registry — a mode is a VIEW selecting
 * which subset is mounted and where, never a second registration
 * path.
 */
export interface ModeContribution {
  id: WorkflowMode;
  /** Sentence-case label, e.g. "Data layout". */
  title: string;
  /** Glyph name for the switcher (Icon registry). */
  icon: string;
  /** Switcher position; lower floats left. */
  order: number;
  /** One-line tooltip. */
  blurb?: string;
  /** Mode-specific left segment of the ContextToolbar. */
  toolbarLeft?: ComponentType<ModeToolbarProps>;
  /** Panel ids visible in this mode, by dock edge. The canvas panel
   * is always present and never listed. */
  panelSet?: { left?: string[]; right?: string[]; bottom?: string[] };
  /** Command ids surfaced as "Suggested in <Mode>" in the palette. */
  paletteSuggestions?: string[];
}

export type ModeRegistryEvent =
  | { kind: "registered"; contribution: ModeContribution }
  | { kind: "unregistered"; id: WorkflowMode };

export interface ModeRegistry {
  register(contribution: ModeContribution): Disposable;
  unregister(id: WorkflowMode): void;
  get(id: WorkflowMode): ModeContribution | undefined;
  /** Sorted by `order`. */
  list(): ModeContribution[];
  onChange(handler: (event: ModeRegistryEvent) => void): Disposable;
}

export function createModeRegistry(): ModeRegistry {
  const byId = new Map<WorkflowMode, ModeContribution>();
  const listeners = new Set<(event: ModeRegistryEvent) => void>();

  function emit(event: ModeRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `ModeRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) {
        emit({ kind: "unregistered", id });
      }
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values()).sort((a, b) => a.order - b.order);
    },
    onChange(handler) {
      listeners.add(handler);
      return {
        dispose() {
          listeners.delete(handler);
        },
      };
    },
  };
}
