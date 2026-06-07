export type { Disposable, DockEdge, VisibilityPredicate } from "./types";

export {
  createPanelRegistry,
  type PanelApi,
  type PanelContribution,
  type PanelProps,
  type PanelRegistry,
  type PanelRegistryEvent,
} from "./panel";

export {
  createCommandRegistry,
  type CommandContribution,
  type CommandRegistry,
} from "./command";

export {
  createSemanticGroupRegistry,
  type SemanticGroupRegistry,
} from "./semantic-group";

export {
  createKeybindingRegistry,
  type KeybindingContribution,
  type KeybindingRegistry,
} from "./keybinding";

export {
  createMenuRegistry,
  type MenuItemContribution,
  type MenuRegistry,
  type MenuRegistryEvent,
} from "./menu";

export {
  createOverlayRegistry,
  type OverlayContribution,
  type OverlayPageRect,
  type OverlayProps,
  type OverlayRegistry,
  type OverlayRegistryEvent,
} from "./overlay";

export {
  createToolRegistry,
  DEFAULT_TOOLS,
  type Tool,
  type ToolContribution,
  type ToolId,
  type ToolGroupId,
  type ToolSectionId,
  type ToolRegistry,
  type ToolRegistryEvent,
} from "./tool";
export {
  createModeRegistry,
  type ModeCockpitSlots,
  type ModeContribution,
  type ModeRegistry,
  type ModeRegistryEvent,
  type ModeToolbarProps,
} from "./mode";

// W3.2 — edit-context + object-type registries (B-02 / W-03).
export {
  createEditContextRegistry,
  createObjectTypeRegistry,
  resolveDoubleClick,
  type EditContextContribution,
  type ObjectTypeContribution,
  type EditContextCandidate,
  type EnteredEditContext,
  type EditContextRegistry,
  type ObjectTypeRegistry,
  type EditContextRegistryEvent,
  type ObjectTypeRegistryEvent,
  type DoubleClickResolution,
} from "./edit-context";
