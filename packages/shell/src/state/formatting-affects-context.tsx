import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// Concept 1 (T3) — application state for the fill/stroke cluster:
//   - `activeWell` — which of fill / stroke the apply buttons target
//     (the well brought to the front).
//   - `affects` — the formatting-affects-container-vs-text toggle (J):
//     does a colour click target the frame fill or the text fill.
// Both are view/app state — `writes: []` against the document.

export type FillStrokeWell = "fill" | "stroke";
export type FormattingAffects = "container" | "text";

interface FormattingAffectsValue {
  activeWell: FillStrokeWell;
  setActiveWell: (w: FillStrokeWell) => void;
  affects: FormattingAffects;
  setAffects: (a: FormattingAffects) => void;
  toggleAffects: () => void;
}

const Context = createContext<FormattingAffectsValue | null>(null);

export function FormattingAffectsProvider({ children }: PropsWithChildren) {
  const [activeWell, setActiveWell] = useState<FillStrokeWell>("fill");
  const [affects, setAffects] = useState<FormattingAffects>("container");
  const toggleAffects = useCallback(
    () => setAffects((a) => (a === "container" ? "text" : "container")),
    [],
  );
  const value = useMemo<FormattingAffectsValue>(
    () => ({ activeWell, setActiveWell, affects, setAffects, toggleAffects }),
    [activeWell, affects, toggleAffects],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFormattingAffects(): FormattingAffectsValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useFormattingAffects called outside FormattingAffectsProvider",
    );
  }
  return ctx;
}

export function useOptionalFormattingAffects(): FormattingAffectsValue | null {
  return useContext(Context);
}
