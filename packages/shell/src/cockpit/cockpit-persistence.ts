// Cockpit — per-mode UI-state persistence. Replaces the dockview
// layout snapshots: the fixed cockpit has nothing to serialize but
// "which right-dock tabs are open, which is active". One small
// localStorage blob, debounced writes, and a one-shot cleanup of the
// legacy `paged.layout.*` keys.

import type { WorkflowMode } from "../state/workflow-mode-context";

const KEY = "paged.cockpit.v1";
const LEGACY_PREFIXES = ["paged.layout."];

export interface ModeUiState {
  /** Ordered right-dock tabs (panel ids). */
  rightTabs: string[];
  /** Active tab id; must be a member of `rightTabs`. */
  activeTab: string | null;
}

export type CockpitStore = Partial<Record<WorkflowMode, ModeUiState>>;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load the persisted per-mode state and delete the legacy dockview
 *  layout keys (one-shot migration: old snapshots are meaningless in
 *  the fixed cockpit). */
export function loadCockpitStore(): CockpitStore {
  const ls = safeStorage();
  if (!ls) return {};
  // Legacy cleanup — enumerate first, then remove (removal mutates
  // the key index).
  const stale: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && LEGACY_PREFIXES.some((p) => k.startsWith(p))) stale.push(k);
  }
  for (const k of stale) ls.removeItem(k);

  try {
    const raw = ls.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CockpitStore;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

let pending: number | null = null;
let latest: CockpitStore = {};

/** Merge one mode's state into the blob; debounced 300 ms. */
export function saveModeUiState(
  store: CockpitStore,
  mode: WorkflowMode,
  state: ModeUiState,
): CockpitStore {
  const next: CockpitStore = { ...store, [mode]: state };
  latest = next;
  const ls = safeStorage();
  if (!ls) return next;
  if (pending !== null) window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = null;
    try {
      ls.setItem(KEY, JSON.stringify(latest));
    } catch {
      /* quota / privacy mode — state stays in-memory */
    }
  }, 300);
  return next;
}
