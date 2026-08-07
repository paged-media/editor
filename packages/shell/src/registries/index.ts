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

export type { Disposable, DockEdge, VisibilityPredicate } from "./types";
export { isEnabled, panelBelongsHere } from "./types";

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
  type CommandInvocation,
  type CommandInvocationEvent,
  type CommandObserver,
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
  type ToolStatus,
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
  type ContentPointerEvent,
  type ObjectTypeContribution,
  type EditContextCandidate,
  type EnteredEditContext,
  type EditContextRegistry,
  type ObjectTypeRegistry,
  type EditContextRegistryEvent,
  type ObjectTypeRegistryEvent,
  type DoubleClickResolution,
} from "./edit-context";

// K-2 / S-06 — document importer + exporter registries (Wave 3 IO).
export {
  createImporterRegistry,
  createExporterRegistry,
  fileExtension,
  type ImporterContribution,
  type ImportRequest,
  type ExporterContribution,
  type ExportResult,
  type ImporterRegistry,
  type ExporterRegistry,
  type ImporterRegistryEvent,
  type ExporterRegistryEvent,
} from "./document-io";
