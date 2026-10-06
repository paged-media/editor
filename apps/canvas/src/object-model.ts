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

// ADR 323 — THE object registry. ONE per app, module scope, for the same
// two reasons `dataProviders` and `bindingProviders` are shared: routing
// is CROSS-BUNDLE (a `plugin:<id>/…` address goes to whichever bundle
// registered that kind), and the panels need the SAME instance the bundle
// hosts were built with.
//
// It is handed to THREE places and they must be the same object:
//   · every `createBundleHost` (`objects` in the shared host options) —
//     `contribute.objectModel` registers into it and `host.objects`
//     reads it; `supports("objects.shared@1")` turns true;
//   · `<PagedShell objectModel>` — `PropertyField` reads/writes through it;
//   · `__canvas.objects` (dev) — `editor.*` automation and the specs.
//
// Core addresses route through the SDK's core seam over the live engine
// (`createCoreObjects`), which reads the editor lazily: the registry can
// exist before the shell has mounted an editor, and answers `failed`
// until one is set.

import {
  CORE_PATHS,
  createCoreObjects,
  createObjectRegistry,
  fromElementId,
  type ObjectRegistry,
} from "@paged-media/plugin-sdk";
import type { PagedEditor } from "@paged-media/plugin-api";
import type {
  ShellObjectModelHost,
  ShellObjectsSurface,
  ShellPropertySchema,
} from "@paged-media/shell";

let currentEditor: PagedEditor | null = null;

/** The live `PagedEditor` the core seam reads (set by `PluginBundles`,
 *  the same handle every bundle host's `getEditor()` returns). */
export function setObjectModelEditor(editor: PagedEditor | null): void {
  currentEditor = editor;
}

export const objectRegistry: ObjectRegistry = createObjectRegistry({
  core: createCoreObjects(() => {
    if (!currentEditor) throw new Error("the editor has not mounted yet");
    return currentEditor;
  }),
});

type CoreRow = { wire?: string; inferred?: true };
const coreRow = (path: string): CoreRow | null =>
  ((CORE_PATHS as Record<string, CoreRow | { op: true }>)[path] as CoreRow | undefined) ?? null;

// The structural assertion: the SDK registry IS the shell's mirror. A
// contract change fails the editor's typecheck here, at the seam.
const objects: ShellObjectsSurface = objectRegistry;

export const editorObjectModel: ShellObjectModelHost = {
  objects,
  addressOf: (id) => fromElementId(id),
  isInferred: (row: ShellPropertySchema) =>
    !(row.addressKind ?? "").startsWith("plugin:") && coreRow(row.path)?.inferred === true,
  wireOf: (path) => coreRow(path)?.wire ?? null,
};
