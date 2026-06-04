import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// Design system (publishing cockpit) — the workflow mode. One
// product, six purpose-built experiences: each mode re-skins the
// context toolbar, the visible panel sets and the canvas overlays
// (the contributions live in the ModeRegistry; this context holds
// only the active id — the screen-mode pattern). Pure VIEW state:
// switching modes writes NOTHING to the document.

export type WorkflowMode =
  | "design"
  | "content"
  | "prepress"
  | "data"
  | "review"
  | "export";

const STORAGE_KEY = "paged.workflowMode";

const ALL_MODES: ReadonlySet<string> = new Set([
  "design",
  "content",
  "prepress",
  "data",
  "review",
  "export",
]);

function loadInitialMode(): WorkflowMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && ALL_MODES.has(raw)) return raw as WorkflowMode;
  } catch {
    /* storage unavailable — fall through */
  }
  return "design";
}

interface WorkflowModeValue {
  mode: WorkflowMode;
  setMode: (m: WorkflowMode) => void;
}

const Context = createContext<WorkflowModeValue | null>(null);

export function WorkflowModeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<WorkflowMode>(loadInitialMode);
  const setMode = useCallback((m: WorkflowMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* persistence is a convenience only */
    }
  }, []);
  const value = useMemo<WorkflowModeValue>(
    () => ({ mode, setMode }),
    [mode, setMode],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkflowMode(): WorkflowModeValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useWorkflowMode called outside WorkflowModeProvider");
  }
  return ctx;
}

export function useOptionalWorkflowMode(): WorkflowModeValue | null {
  return useContext(Context);
}
