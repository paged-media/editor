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
  formatAddress,
  fromElementId,
  parseAddress,
  toElementId,
  type CoreObjects,
  type ObjectRegistry,
} from "@paged-media/plugin-sdk";
import type { PagedEditor } from "@paged-media/plugin-api";
import type { ElementId } from "@paged-media/client";
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

const getEditor = (): PagedEditor => {
  if (!currentEditor) throw new Error("the editor has not mounted yet");
  return currentEditor;
};

type CoreRow = { scope?: string; wire?: string; inferred?: true; readOnly?: true };
const coreRow = (path: string): CoreRow | null =>
  ((CORE_PATHS as Record<string, CoreRow | { op: true }>)[path] as CoreRow | undefined) ?? null;

// ------------------------------------------------------------------
// Table seam — an EDITOR-SIDE extension of the SDK's core seam, until it
// lands there (reported to the SDK track; core's `Set` on om/schema
// subsumes it).
//
// The protocol-69 core seam lists `table` and `cell` kinds with schema
// rows but answers `unmapped` for every get and set on them, and its
// `cell:<table>/<r>,<c>` address drops the STORY the wire's
// `ElementId::TableCell` needs. The Table panel used to write cells
// through `setElementProperty` directly; routing it through
// `host.objects` must not lose that. So, for these two kinds only:
//   · reads go through `requestElementProperties` on the cell / table;
//   · writes plan the same `setElementProperty` the panel sent, so the
//     registry still commits ONE batch = one undo step;
//   · the story comes from the table → story map `addressOf` fills
//     whenever the editor names a table element (the selection, the
//     Table panel's targets).
// (The SDK's 0.2.43 rows already type `cellInset*` as lengths; nothing
// is re-typed here.)
// ------------------------------------------------------------------

const tableStories = new Map<string, string>();

/** Remember which story a table lives in (the cell address drops it). */
export function noteTableStory(tableId: string, storyId: string): void {
  tableStories.set(tableId, storyId);
}

const wireOfPath = (path: string): string | null => coreRow(path)?.wire ?? null;

type Parsed = NonNullable<ReturnType<typeof parseAddress>>;

function tableElementId(a: Parsed): ElementId | null {
  if (a.kind === "cell") {
    const story = tableStories.get(a.table);
    return story
      ? { kind: "tableCell", id: { story_id: story, table_id: a.table, row: a.row, col: a.col } }
      : null;
  }
  if (a.kind === "table") {
    const story = tableStories.get(a.id);
    return story ? { kind: "table", id: { story_id: story, table_id: a.id } } : null;
  }
  return null;
}

function withTableSeam(core: CoreObjects): CoreObjects {
  const isTable = (a: Parsed) => a.kind === "cell" || a.kind === "table";
  const refuse = (code: "unknownAddress" | "unknownPath" | "readOnly", reason: string) =>
    ({ kind: "refused", code, reason }) as const;
  return {
    ...core,
    async get(a, path) {
      if (!isTable(a)) return core.get(a, path);
      // Protocol 71: the SDK seam reaches cells and tables through core's
      // `Get` — use it, and fall back only while it answers `unmapped`.
      const viaCore = await core.get(a, path);
      if (viaCore.kind !== "refused" || viaCore.code !== "unmapped") return viaCore;
      const scope = a.kind;
      const row = coreRow(path);
      if (!row || row.scope !== scope) return refuse("unknownPath", `${scope} has no path "${path}"`);
      const id = tableElementId(a);
      if (!id) return refuse("unknownAddress", `no ${scope} ${JSON.stringify(a)} (its story is unknown)`);
      const reply = (await getEditor()
        .client.send({ kind: "requestElementProperties", payload: { id } } as never)
        .catch(() => null)) as
        | { kind: string; payload?: { result?: { entries: { path: string; value: unknown }[] } | null } }
        | null;
      const props = reply?.kind === "elementProperties" ? reply.payload?.result : null;
      if (!props) return refuse("unknownAddress", `no ${scope} ${JSON.stringify(a)}`);
      const e = props.entries.find((x) => x.path === path);
      if (!e) return { kind: "absent" };
      return e.value == null ? { kind: "mixed" } : { kind: "value", value: (e.value as { value: unknown }).value };
    },
    async planSet(a, path, value, ...rest) {
      if (!isTable(a)) return core.planSet(a, path, value, ...rest);
      const viaCore = await core.planSet(a, path, value, ...rest);
      if (viaCore.ok || viaCore.code !== "unmapped") return viaCore;
      const scope = a.kind;
      const row = coreRow(path);
      if (!row || row.scope !== scope) return { ok: false, code: "unknownPath", reason: `${scope} has no path "${path}"` };
      if (row.readOnly) return { ok: false, code: "readOnly", reason: `${path} is read-only` };
      const id = tableElementId(a);
      if (!id) return { ok: false, code: "unknownAddress", reason: `no ${scope} ${JSON.stringify(a)} (its story is unknown)` };
      return {
        ok: true,
        mutations: [
          {
            op: "setElementProperty",
            args: { elementId: id, path, value: { type: wireOfPath(path) ?? "text", value } },
          } as never,
        ],
      };
    },
    async elementIdOf(a) {
      if (isTable(a)) return tableElementId(a) as never;
      return core.elementIdOf(a);
    },
  };
}

export const objectRegistry: ObjectRegistry = createObjectRegistry({
  core: withTableSeam(createCoreObjects(getEditor)),
});

/** `layer:<id>` with the id escaped as the grammar requires (a self id
 *  like `Layer/u0` carries a slash). */
export function layerAddress(id: string): string {
  return formatAddress({ kind: "layer", id } as never);
}

/** The ADR 131 address of an element, remembering a table's story. */
export function addressOfElement(id: ElementId): string {
  if (id.kind === "tableCell" || id.kind === "table") {
    noteTableStory(id.id.table_id, id.id.story_id);
  }
  return fromElementId(id as never);
}

// The structural assertion: the SDK registry IS the shell's mirror. A
// contract change fails the editor's typecheck here, at the seam.
const objects: ShellObjectsSurface = objectRegistry;

export const editorObjectModel: ShellObjectModelHost = {
  objects,
  addressOf: (id) => addressOfElement(id),
  isInferred: (row: ShellPropertySchema) =>
    !(row.addressKind ?? "").startsWith("plugin:") && coreRow(row.path)?.inferred === true,
  wireOf: (path) => wireOfPath(path),
  elementIdOf: (address) => {
    const a = parseAddress(address);
    if (!a) return null;
    return (tableElementId(a) ?? toElementId(a)) as ElementId | null;
  },
};
