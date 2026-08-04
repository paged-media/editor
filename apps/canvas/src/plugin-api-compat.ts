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
import type { BindingProviderBackend } from "@paged-media/plugin-sdk";
import type {
  CanvasPointerEvent as RealCanvasPointerEvent,
  CommandContribution as RealCommandContribution,
  EditContextContribution as RealEditContextContribution,
  ExporterContribution as RealExporterContribution,
  GestureHandler as RealGestureHandler,
  ImporterContribution as RealImporterContribution,
  KeybindingContribution as RealKeybindingContribution,
  ObjectTypeContribution as RealObjectTypeContribution,
  OverlayContribution as RealOverlayContribution,
  PagedEditor as RealPagedEditor,
  PanelContribution as RealPanelContribution,
  ShellActiveBindingProvider as RealActiveBindingProvider,
  ShellBindingProviderHost as RealBindingProviderHost,
  ToolContribution as RealToolContribution,
  ToolPreviewShape as RealToolPreviewShape,
} from "@paged-media/shell";

type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

// Handle direction: the live editor satisfies the published contract.
export type _PagedEditorSatisfiesContract = Assert<
  Extends<RealPagedEditor, Api.PagedEditor>
>;

// Overlay vocabulary direction: every CONTRACT tool-preview variant must
// be renderable by the editor (the editor union stays a SUPERSET of the
// contract's). Explicit because the handle assertion above can't catch a
// missing variant — `setToolPreview` is a method, and method bivariance
// lets a narrower parameter slip through.
export type _ToolPreviewVocabularyRenderable = Assert<
  Extends<Api.ToolPreviewShape, RealToolPreviewShape>
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

// W3.2 — the un-reserved doors: contract-authored edit-context /
// object-type contributions must register against the shell's
// registries (the matcher + hooks survive the boundary).
export type _EditContextContributionRegistrable = Assert<
  Extends<Api.EditContextContribution, RealEditContextContribution>
>;
export type _ObjectTypeContributionRegistrable = Assert<
  Extends<Api.ObjectTypeContribution, RealObjectTypeContribution>
>;

// K-2 / S-06 — contract-authored document importers/exporters must
// register against the shell's IO registries (the file-routing flow).
export type _ImporterContributionRegistrable = Assert<
  Extends<Api.ImporterContribution, RealImporterContribution>
>;
export type _ExporterContributionRegistrable = Assert<
  Extends<Api.ExporterContribution, RealExporterContribution>
>;

// ADR 023 phase C — the BINDING-PROVIDER seam. `@paged-media/shell`
// keeps a structural MIRROR of the registry's host-facing slice (it
// cannot import plugin-sdk: it sits a layer below apps/canvas). THIS is
// the drift alarm on that mirror — the real registry the app builds and
// injects must satisfy what the shell's panels call, and a provider
// entry the SDK hands out must be readable as the shell's own.
//
// Direction is HANDLE direction (Real extends Contract), the same rule
// as PagedEditor: the app hands its richer registry where the shell
// expects the narrow mirror.
export type _BindingRegistrySatisfiesShellMirror = Assert<
  Extends<BindingProviderBackend, RealBindingProviderHost>
>;
export type _ActiveProviderReadableByShell = Assert<
  Extends<Api.ActiveBindingProvider, RealActiveBindingProvider>
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
