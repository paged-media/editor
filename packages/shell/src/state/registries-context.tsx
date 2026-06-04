import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import {
  createCommandRegistry,
  createKeybindingRegistry,
  createMenuRegistry,
  createOverlayRegistry,
  createModeRegistry,
  createPanelRegistry,
  createSemanticGroupRegistry,
  createToolRegistry,
  type CommandRegistry,
  type KeybindingRegistry,
  type MenuRegistry,
  type ModeRegistry,
  type OverlayRegistry,
  type PanelRegistry,
  type SemanticGroupRegistry,
  type ToolRegistry,
} from "../registries";

/**
 * The shell registries. Lifetime is the shell's: created at mount,
 * kept across renders so dispose handles registered by panels /
 * overlays stay valid as React re-renders.
 */
export interface ShellRegistries {
  panels: PanelRegistry;
  modes: ModeRegistry;
  commands: CommandRegistry;
  semanticGroups: SemanticGroupRegistry;
  keybindings: KeybindingRegistry;
  menus: MenuRegistry;
  overlays: OverlayRegistry;
  tools: ToolRegistry;
}

const Context = createContext<ShellRegistries | null>(null);

/**
 * Mounts the four registry instances at the shell root. The command
 * registry needs a `getEditor` thunk so its `invoke` can pass the
 * current `PagedEditor` into handlers; the caller (typically the
 * PagedEditor provider) supplies it.
 */
export function RegistriesProvider({
  getEditor,
  children,
}: PropsWithChildren<{ getEditor: () => unknown }>) {
  // Stable instances across renders. useRef beats useMemo here
  // because we want guaranteed identity even if React invokes the
  // memo factory twice (Strict Mode does this in dev).
  const ref = useRef<ShellRegistries | null>(null);
  const keybindingsDisposeRef = useRef<(() => void) | null>(null);
  if (!ref.current) {
    const commands = createCommandRegistry(getEditor);
    // Pass `getEditor` as the keybinding state thunk too, so `when`
    // predicates (e.g. the tool-shortcut text-suppression guard) read
    // the live editor handle.
    const keybindings = createKeybindingRegistry(commands, getEditor);
    keybindingsDisposeRef.current = () => keybindings.dispose();
    // Tools are supplied by the app via `<PagedShell tools={...}>` and
    // registered in ShellChrome (mirrors panels/overlays), so the rail
    // contains zero hardcoded entries. Bundles add more via
    // `useRegistries().tools.register(...)`.
    const tools = createToolRegistry();
    ref.current = {
      panels: createPanelRegistry(),
      modes: createModeRegistry(),
      commands,
      semanticGroups: createSemanticGroupRegistry(),
      keybindings,
      menus: createMenuRegistry(),
      overlays: createOverlayRegistry(),
      tools,
    };
  }

  // Tear down the global keydown listener on unmount.
  useEffect(() => {
    return () => {
      keybindingsDisposeRef.current?.();
      keybindingsDisposeRef.current = null;
    };
  }, []);

  // Wrap in useMemo so consumers see a stable object reference.
  const value = useMemo(() => ref.current!, []);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRegistries(): ShellRegistries {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useRegistries called outside RegistriesProvider");
  }
  return ctx;
}
