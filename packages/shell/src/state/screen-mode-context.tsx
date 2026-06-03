import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// Concept 1 (T7) — the screen-mode selector. Pure VIEW state on the
// overlay layer; it writes NOTHING to the document (`writes: []`). The
// overlay renderer (Phase 5 work) reads `screenMode` to hide
// non-printing items, mask the pasteboard, reveal bleed/slug, etc.
// `W` toggles Normal ⇄ Preview (text-suppressed like tool shortcuts).

export type ScreenMode =
  | "normal"
  | "preview"
  | "bleed"
  | "slug"
  | "presentation";

export const SCREEN_MODES: ReadonlyArray<{ mode: ScreenMode; label: string }> = [
  { mode: "normal", label: "Normal" },
  { mode: "preview", label: "Preview" },
  { mode: "bleed", label: "Bleed" },
  { mode: "slug", label: "Slug" },
  { mode: "presentation", label: "Presentation" },
];

interface ScreenModeValue {
  screenMode: ScreenMode;
  setScreenMode: (m: ScreenMode) => void;
  /** Toggle Normal ⇄ Preview (the `W` shortcut). */
  togglePreview: () => void;
}

const Context = createContext<ScreenModeValue | null>(null);

export function ScreenModeProvider({ children }: PropsWithChildren) {
  const [screenMode, setScreenMode] = useState<ScreenMode>("normal");
  const togglePreview = useCallback(
    () => setScreenMode((m) => (m === "preview" ? "normal" : "preview")),
    [],
  );
  const value = useMemo<ScreenModeValue>(
    () => ({ screenMode, setScreenMode, togglePreview }),
    [screenMode, togglePreview],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useScreenMode(): ScreenModeValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useScreenMode called outside ScreenModeProvider");
  }
  return ctx;
}

export function useOptionalScreenMode(): ScreenModeValue | null {
  return useContext(Context);
}
