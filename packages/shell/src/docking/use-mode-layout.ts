// Cockpit — per-mode panel sets + layout memory (styleguide D3).
//
// On a mode switch the OUTGOING layout is parked under
// `paged.layout.mode.<prev>`; the INCOMING mode restores its parked
// layout, or — first visit — default-builds from the mode's
// `panelSet`: close everything but the canvas, then mount the
// declared panels into ONE stacked group per edge (the kit's
// left-stack / right-inspector composition). The live layout keeps
// auto-persisting to `paged.layout.current` as before, so a reload
// resumes exactly where the user was, whatever the mode.
//
// The FIRST run after mount deliberately does nothing: boot
// restored `paged.layout.current` (or the bridge mounted the
// defaults) and the persisted mode id matches that layout.

import { useEffect, useRef } from "react";

import type { DockingSubstrate } from "./substrate";
import { resolvePanelSpec } from "./panel-bridge";
import type { ShellRegistries } from "../state/registries-context";
import type { WorkflowMode } from "../state/workflow-mode-context";
import {
  getModeLayout,
  saveModeLayout,
} from "../persistence/layout-persistence";

export function useModeLayout(opts: {
  substrate: DockingSubstrate | null;
  registries: ShellRegistries;
  mode: WorkflowMode;
  /** False when the app contributed no modes — the hook no-ops. */
  enabled: boolean;
  /** Invoked before the switch is applied — ShellChrome restores a
   * Tab-hidden chrome first so the outgoing snapshot is the REAL
   * layout, not the canvas-only hidden state. */
  beforeSwitch?: () => void;
}): void {
  const { substrate, registries, mode, enabled, beforeSwitch } = opts;
  const prevRef = useRef<WorkflowMode | null>(null);

  useEffect(() => {
    if (!enabled || !substrate) return;
    if (prevRef.current === null) {
      // Boot: the persisted layout already matches the persisted
      // mode — just start tracking.
      prevRef.current = mode;
      return;
    }
    if (prevRef.current === mode) return;
    const prev = prevRef.current;
    prevRef.current = mode;

    beforeSwitch?.();

    // Park the outgoing mode's layout.
    try {
      saveModeLayout(prev, substrate.serialize());
    } catch {
      /* park is best-effort; the switch must still happen */
    }

    // Restore the incoming mode, or build its default set.
    const parked = getModeLayout(mode);
    if (parked) {
      try {
        substrate.restore(parked);
        return;
      } catch {
        /* malformed snapshot — fall through to the default build */
      }
    }
    buildDefaultLayout(substrate, registries, mode);
  }, [enabled, substrate, registries, mode, beforeSwitch]);
}

function buildDefaultLayout(
  substrate: DockingSubstrate,
  registries: ShellRegistries,
  mode: WorkflowMode,
): void {
  const contribution = registries.modes.get(mode);
  substrate.closePanelsExcept(["paged.canvas"]);
  if (!contribution?.panelSet) return;

  const mountEdge = (
    ids: readonly string[] | undefined,
    edge: "left" | "right" | "bottom",
  ) => {
    for (const id of ids ?? []) {
      const panel = registries.panels.get(id);
      if (!panel) {
        // The mode references a panel the app didn't register —
        // skip loudly so a typo doesn't silently thin a mode out.
        // eslint-disable-next-line no-console
        console.warn(`paged: mode "${mode}" references unknown panel "${id}"`);
        continue;
      }
      if (substrate.hasPanel(id)) continue;
      const spec = resolvePanelSpec(panel);
      // One stacked group per edge — the cockpit composition —
      // regardless of the panel's standalone defaults.
      substrate.addPanel({
        ...spec,
        defaultDock: edge,
        semanticGroup: `mode-${mode}-${edge}`,
      });
    }
  };
  mountEdge(contribution.panelSet.left, "left");
  mountEdge(contribution.panelSet.right, "right");
  mountEdge(contribution.panelSet.bottom, "bottom");
}
