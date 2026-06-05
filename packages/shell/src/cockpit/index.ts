// Cockpit — the fixed publishing-cockpit layout (the dockview
// replacement). See CockpitLayout.tsx for the composition contract.

export { CockpitLayout, type CockpitLayoutProps } from "./CockpitLayout";
export {
  CockpitStateProvider,
  cockpitActions,
  useCockpitState,
  useOptionalCockpitState,
  type CockpitState,
  type InspectorContext,
} from "./cockpit-state-context";
export { PanelHost } from "./PanelHost";
export { RightDock } from "./RightDock";
export { groupSpreads, type SpreadEntry } from "./spread-grouping";
export {
  navigateToPages,
  setCockpitPageNavigator,
  type PageNavigator,
} from "./cockpit-navigation";
