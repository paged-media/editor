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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { ToolSettings } from "../tools/tool-options";

// Concept 1 (T8) — tool-scoped settings store. Tool options (Polygon
// sides, Pencil fidelity, …) write HERE, not the document: they are
// app-state, keyed by tool id, NOT `paged.mutate`. Gesture handlers
// read them to parameterise their operations.

type ToolSettingValue = number | boolean | string;

interface ToolSettingsValue {
  get: (toolId: string) => ToolSettings;
  getValue: (toolId: string, key: string) => ToolSettingValue | undefined;
  set: (toolId: string, key: string, value: ToolSettingValue) => void;
  /** v66 — be told when `toolId`'s settings change (the plugin door
   *  `host.tools.onDidChangeSettings`). Returns the unsubscribe. */
  subscribe: (toolId: string, listener: () => void) => () => void;
}

const Context = createContext<ToolSettingsValue | null>(null);

export function ToolSettingsProvider({ children }: PropsWithChildren) {
  // `store` drives re-renders (the popover reflects edits); `storeRef`
  // mirrors it so the read accessors are STABLE — a gesture handler
  // captures `paged.toolSettings` once at activation and must see the
  // value the popover wrote AFTER that capture. Closing `getValue` over
  // the `store` state instead would hand the handler a stale snapshot
  // (the polygon `sides` edit never reached the draw → DEFAULT_SIDES).
  const [store, setStore] = useState<Record<string, ToolSettings>>({});
  const storeRef = useRef(store);
  storeRef.current = store;

  const get = useCallback(
    (toolId: string): ToolSettings => storeRef.current[toolId] ?? {},
    [],
  );
  const getValue = useCallback(
    (toolId: string, key: string) => storeRef.current[toolId]?.[key],
    [],
  );
  const listenersRef = useRef(new Map<string, Set<() => void>>());
  const set = useCallback(
    (toolId: string, key: string, value: ToolSettingValue) => {
      // The ref moves with the write, not the next render, so a listener
      // reading `get(toolId)` sees the value it is being told about.
      const next = {
        ...storeRef.current,
        [toolId]: { ...(storeRef.current[toolId] ?? {}), [key]: value },
      };
      storeRef.current = next;
      setStore(next);
      for (const l of listenersRef.current.get(toolId) ?? []) {
        try {
          l();
        } catch {
          /* a listener must not break the write */
        }
      }
    },
    [],
  );
  const subscribe = useCallback((toolId: string, listener: () => void) => {
    const map = listenersRef.current;
    let set = map.get(toolId);
    if (!set) map.set(toolId, (set = new Set()));
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }, []);

  const value = useMemo<ToolSettingsValue>(
    () => ({ get, getValue, set, subscribe }),
    [get, getValue, set, subscribe],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useToolSettings(): ToolSettingsValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useToolSettings called outside ToolSettingsProvider");
  }
  return ctx;
}
