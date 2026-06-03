import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { ToolId } from "../registries/tool";

/** Ids of the two built-in tools the legacy scalar `ActiveTool` union
 *  maps onto. Kept here (not selection-context) so the mapping helpers
 *  and the seed share one source of truth. */
export const SELECT_TOOL_ID: ToolId = "paged.tool.select";
export const TEXT_TOOL_ID: ToolId = "paged.tool.type";

/**
 * Concept 1 (T2) — the active tool is a base selection plus a
 * transient-override STACK, not a scalar, because spring-loaded tools
 * (hold Space → momentary Hand, hold Cmd → momentary Direct-Selection,
 * peek another tool) push/pop on top of the base. The effective tool
 * is `overrides.at(-1) ?? base`.
 */
export interface ActiveToolState {
  /** Set by click or sticky single-key press. */
  base: ToolId;
  /** Pushed by spring-load, popped on key-up. Nested holds (Space over
   *  a Pen peek) are why this is a stack, not a single slot. */
  overrides: ToolId[];
}

/**
 * Why the effective tool last changed. The gesture spine reads this to
 * decide whether to commit/cancel the outgoing handler's in-flight
 * gesture ("switch") or keep it for resume ("suspend").
 */
export type ToolChangeReason = "switch" | "suspend";

interface InternalState {
  active: ActiveToolState;
  reason: ToolChangeReason;
}

export interface ToolContextValue {
  toolState: ActiveToolState;
  /** Derived: `overrides.at(-1) ?? base`. Allocation-free. */
  effectiveTool: ToolId;
  /** Reason for the most recent effective-tool change. */
  lastReason: ToolChangeReason;
  /** Set the base tool (click / sticky key). Keeps any held overrides. */
  setBaseTool: (id: ToolId) => void;
  /** Push a spring-load override (key down). */
  pushOverride: (id: ToolId) => void;
  /** Pop the topmost matching override (key up). Pop-by-id so
   *  out-of-order key-ups (release Cmd while Space still held) don't
   *  corrupt the stack. */
  popOverride: (id: ToolId) => void;
  /** Non-React mirror for synchronous readers (gesture spine,
   *  keybinding predicates) that must see the latest state without a
   *  re-render. */
  toolStateRef: React.MutableRefObject<ActiveToolState>;
}

function deriveEffective(s: ActiveToolState): ToolId {
  return s.overrides.length > 0 ? s.overrides[s.overrides.length - 1] : s.base;
}

const Context = createContext<ToolContextValue | null>(null);

export function ToolProvider({ children }: PropsWithChildren) {
  const [internal, setInternal] = useState<InternalState>(() => ({
    active: { base: SELECT_TOOL_ID, overrides: [] },
    reason: "switch",
  }));

  const toolStateRef = useRef<ActiveToolState>(internal.active);
  // Keep the synchronous mirror current on every render.
  toolStateRef.current = internal.active;

  const setBaseTool = useCallback((id: ToolId) => {
    setInternal((prev) =>
      prev.active.base === id && prev.reason === "switch"
        ? prev
        : {
            active: { base: id, overrides: prev.active.overrides },
            reason: "switch",
          },
    );
  }, []);

  const pushOverride = useCallback((id: ToolId) => {
    setInternal((prev) => ({
      active: { base: prev.active.base, overrides: [...prev.active.overrides, id] },
      reason: "suspend",
    }));
  }, []);

  const popOverride = useCallback((id: ToolId) => {
    setInternal((prev) => {
      const idx = prev.active.overrides.lastIndexOf(id);
      if (idx < 0) return prev;
      const overrides = prev.active.overrides.slice();
      overrides.splice(idx, 1);
      return {
        active: { base: prev.active.base, overrides },
        reason: "suspend",
      };
    });
  }, []);

  const effectiveTool = deriveEffective(internal.active);

  const value = useMemo<ToolContextValue>(
    () => ({
      toolState: internal.active,
      effectiveTool,
      lastReason: internal.reason,
      setBaseTool,
      pushOverride,
      popOverride,
      toolStateRef,
    }),
    [internal, effectiveTool, setBaseTool, pushOverride, popOverride],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTool(): ToolContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useTool called outside ToolProvider");
  }
  return ctx;
}

/** Same as `useTool` but returns `null` outside the provider. */
export function useOptionalTool(): ToolContextValue | null {
  return useContext(Context);
}
