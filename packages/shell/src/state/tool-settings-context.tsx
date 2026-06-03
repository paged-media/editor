import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
}

const Context = createContext<ToolSettingsValue | null>(null);

export function ToolSettingsProvider({ children }: PropsWithChildren) {
  const [store, setStore] = useState<Record<string, ToolSettings>>({});

  const get = useCallback(
    (toolId: string): ToolSettings => store[toolId] ?? {},
    [store],
  );
  const getValue = useCallback(
    (toolId: string, key: string) => store[toolId]?.[key],
    [store],
  );
  const set = useCallback(
    (toolId: string, key: string, value: ToolSettingValue) => {
      setStore((prev) => ({
        ...prev,
        [toolId]: { ...(prev[toolId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const value = useMemo<ToolSettingsValue>(
    () => ({ get, getValue, set }),
    [get, getValue, set],
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
