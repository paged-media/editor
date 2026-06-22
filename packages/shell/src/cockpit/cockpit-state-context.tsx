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

// Cockpit — the right-dock tab state + inspector-context override.
//
// EVERY mode owns an ordered tab list: design seeds the kit's
// Properties|Library|Swatches; single-inspector modes seed exactly
// one tab (the strip auto-hides at one tab, so the kit's "single
// fixed inspector" look holds). Any registered panel — including a
// late-registered plugin/bundle panel — can be opened as an extra
// closable tab via `openPanel` (panel rail, Window menu, tests).
// That is the WHOLE configurability surface: tabs in one dock,
// never free-floating panels.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useWorkflowMode } from "../state/workflow-mode-context";
import { useRegistries } from "../state/registries-context";
import type { WorkflowMode } from "../state/workflow-mode-context";
import {
  loadCockpitStore,
  saveModeUiState,
  type CockpitStore,
  type ModeUiState,
} from "./cockpit-persistence";

/** Manual override for the Properties panel's sub-inspector — the
 *  kit's panel-rail Text/Image/Pages clicks. Live selection still
 *  wins when present; this is the "show me the text properties"
 *  steer. */
export type InspectorContext = "text" | "image" | "page";

export interface CockpitState {
  /** Ordered right-dock tabs for the ACTIVE mode. */
  rightTabs: string[];
  /** Active tab id (member of `rightTabs`; null when empty). */
  activeTab: string | null;
  /** Tabs seeded by the mode's slots — closing them is allowed, but
   *  they re-seed on a fresh visit when no persisted state exists. */
  openPanel(id: string): void;
  activateTab(id: string): void;
  closeTab(id: string): void;
  inspectorContext: InspectorContext | null;
  setInspectorContext(ctx: InspectorContext | null): void;
}

const CockpitStateContext = createContext<CockpitState | null>(null);

/** Module-level dispatch — the provider keeps these pointed at the
 *  live actions so code rendered ABOVE the provider (the shell's
 *  `window.__canvas` hook, the panel show/hide commands) can reach
 *  the cockpit without context plumbing. Null while no cockpit
 *  provider is mounted (the legacy dockview path). */
export const cockpitActions: {
  openPanel: ((id: string) => void) | null;
  closeTab: ((id: string) => void) | null;
} = { openPanel: null, closeTab: null };

/** Seed a mode's tab list from its registered slots. */
function seedTabs(
  mode: WorkflowMode,
  modes: ReturnType<typeof useRegistries>["modes"],
): ModeUiState {
  const slots = modes.get(mode)?.slots;
  const tabs = slots?.tabs ?? (slots?.inspector ? [slots.inspector] : []);
  return { rightTabs: [...tabs], activeTab: tabs[0] ?? null };
}

export function CockpitStateProvider({ children }: PropsWithChildren) {
  const { mode } = useWorkflowMode();
  const registries = useRegistries();
  const storeRef = useRef<CockpitStore | null>(null);
  if (storeRef.current === null) storeRef.current = loadCockpitStore();

  // Per-mode state map kept in a single useState so a mode switch is
  // one render. Lazy: a mode materialises on first visit (persisted
  // state or slot seed).
  const [byMode, setByMode] = useState<
    Partial<Record<WorkflowMode, ModeUiState>>
  >({});
  const [inspectorContext, setInspectorContext] =
    useState<InspectorContext | null>(null);

  // Modes + panels register in app effects AFTER the first render —
  // re-derive the slot seed (and re-resolve tab contributions) when
  // either registry changes. Also how late-registered plugin panels
  // become resolvable.
  const [registryVersion, setRegistryVersion] = useState(0);
  useEffect(() => {
    const bump = () => setRegistryVersion((v) => v + 1);
    const d1 = registries.modes.onChange(bump);
    const d2 = registries.panels.onChange(bump);
    return () => {
      d1.dispose();
      d2.dispose();
    };
  }, [registries]);

  const current: ModeUiState = useMemo(() => {
    return (
      byMode[mode] ??
      storeRef.current?.[mode] ??
      seedTabs(mode, registries.modes)
    );
    // registryVersion re-derives the seed once the app's modes land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byMode, mode, registries.modes, registryVersion]);

  const commit = useCallback(
    (next: ModeUiState) => {
      setByMode((prev) => ({ ...prev, [mode]: next }));
      storeRef.current = saveModeUiState(storeRef.current ?? {}, mode, next);
    },
    [mode],
  );

  const activateTab = useCallback(
    (id: string) => {
      if (!current.rightTabs.includes(id)) return;
      commit({ ...current, activeTab: id });
    },
    [commit, current],
  );

  const openPanel = useCallback(
    (id: string) => {
      // Any REGISTERED panel may open; unknown ids are ignored so a
      // stale persisted tab or a disposed plugin panel can't wedge
      // the dock.
      if (!registries.panels.get(id)) return;
      const rightTabs = current.rightTabs.includes(id)
        ? current.rightTabs
        : [...current.rightTabs, id];
      commit({ rightTabs, activeTab: id });
    },
    [commit, current, registries.panels],
  );

  const closeTab = useCallback(
    (id: string) => {
      const idx = current.rightTabs.indexOf(id);
      if (idx < 0) return;
      const rightTabs = current.rightTabs.filter((t) => t !== id);
      const activeTab =
        current.activeTab === id
          ? (rightTabs[Math.max(0, idx - 1)] ?? null)
          : current.activeTab;
      commit({ rightTabs, activeTab });
    },
    [commit, current],
  );

  // Keep the module-level dispatch pointed at the live actions.
  useEffect(() => {
    cockpitActions.openPanel = openPanel;
    cockpitActions.closeTab = closeTab;
    return () => {
      cockpitActions.openPanel = null;
      cockpitActions.closeTab = null;
    };
  }, [closeTab, openPanel]);

  const value = useMemo<CockpitState>(
    () => ({
      rightTabs: current.rightTabs,
      activeTab: current.activeTab,
      openPanel,
      activateTab,
      closeTab,
      inspectorContext,
      setInspectorContext,
    }),
    [activateTab, closeTab, current, inspectorContext, openPanel],
  );

  return (
    <CockpitStateContext.Provider value={value}>
      {children}
    </CockpitStateContext.Provider>
  );
}

export function useCockpitState(): CockpitState {
  const ctx = useContext(CockpitStateContext);
  if (!ctx) {
    throw new Error("useCockpitState requires CockpitStateProvider");
  }
  return ctx;
}

export function useOptionalCockpitState(): CockpitState | null {
  return useContext(CockpitStateContext);
}
