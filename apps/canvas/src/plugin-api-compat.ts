// M1.1(a) compat assertions (decision 2026-06-06) — since the
// vendoring pass, @paged-media/plugin-api OWNS the published plugin
// contract (hand-written editor.ts + vendored wire.d.ts). THIS file
// is the drift alarm on the editor side of the dev link: if the
// editor's real shapes stop satisfying the contract — or contract
// contributions stop being registrable here — the EDITOR'S typecheck
// fails, never a plugin author's build.
//
// Direction rules (plugin-api editor.ts header):
//  · handle types (PagedEditor):    Real extends Contract
//    (the host hands its richer handle where bundles expect the
//    narrow contract)
//  · contribution types:            Contract extends Real
//    (bundles author contract-typed contributions; the host's
//    registries must accept them)
// Wire types are vendored verbatim and checked by
// plugin-sdk/scripts/sync-wire.mjs --check, not here.

import type * as Api from "@paged-media/plugin-api";
import type {
  CanvasPointerEvent as RealCanvasPointerEvent,
  CommandContribution as RealCommandContribution,
  GestureHandler as RealGestureHandler,
  KeybindingContribution as RealKeybindingContribution,
  OverlayContribution as RealOverlayContribution,
  PagedEditor as RealPagedEditor,
  PanelContribution as RealPanelContribution,
  ToolContribution as RealToolContribution,
} from "@paged-media/shell";

type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

// Handle direction: the live editor satisfies the published contract.
export type _PagedEditorSatisfiesContract = Assert<
  Extends<RealPagedEditor, Api.PagedEditor>
>;

// Contribution direction: contract-authored contributions register
// against the real registries.
export type _ToolContributionRegistrable = Assert<
  Extends<Api.ToolContribution, RealToolContribution>
>;
export type _PanelContributionRegistrable = Assert<
  Extends<Api.PanelContribution, RealPanelContribution>
>;
export type _CommandContributionRegistrable = Assert<
  Extends<Api.CommandContribution, RealCommandContribution>
>;
export type _KeybindingContributionRegistrable = Assert<
  Extends<Api.KeybindingContribution, RealKeybindingContribution>
>;
export type _OverlayContributionRegistrable = Assert<
  Extends<Api.OverlayContribution, RealOverlayContribution>
>;

// Gesture seam, both ways: the spine feeds real events/handles to
// contract handlers, and contract handlers must be mountable where
// the spine expects real ones.
export type _PointerEventsFlowToContractHandlers = Assert<
  Extends<RealCanvasPointerEvent, Api.CanvasPointerEvent>
>;
export type _ContractHandlerMountable = Assert<
  Extends<Api.GestureHandler, RealGestureHandler>
>;
