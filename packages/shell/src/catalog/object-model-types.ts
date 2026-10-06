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

// ADR 323 — the HOST side of `host.objects`, as a STRUCTURAL MIRROR.
//
// Same reason as `binding-providers.tsx` and `schema-panel-types.ts`:
// `@paged-media/shell` sits below `apps/canvas` and does not depend on
// `@paged-media/plugin-api` / `plugin-sdk`. The app builds the ONE shared
// registry (`createObjectRegistry({ core: createCoreObjects(…) })`),
// asserts it satisfies `ShellObjectsSurface` at the injection point, and
// hands it down through `<PagedShell objectModel>`. A contract change then
// fails the EDITOR's typecheck at that seam.
//
// Types only — this file is imported by the node unit test as well.

import type { ElementId } from "@paged-media/client";

/** ADR 132's value types (plugin-api `ValueType`, mirrored). */
export type ShellValueType =
  | { kind: "bool" }
  | {
      kind: "number";
      integer?: boolean;
      unit?: "pt" | "deg" | "percent" | "em1000" | "ppi";
    }
  | { kind: "length" }
  | { kind: "color" }
  | { kind: "enum"; members: readonly string[] }
  | { kind: "text"; multiline?: boolean; maxLength?: number }
  | { kind: "ref"; to: string }
  | { kind: "bounds" }
  | { kind: "transform" }
  | { kind: "point" }
  | { kind: "bytes"; mime?: readonly string[] }
  | { kind: "asset" }
  | { kind: "list"; of: ShellValueType; maxItems?: number }
  | { kind: "map"; of: ShellValueType; keyPattern?: string }
  | { kind: "struct"; fields: Readonly<Record<string, ShellValueType>> };

/** One ADR 132 schema row (plugin-api `PropertySchema`, mirrored). */
export interface ShellPropertySchema {
  addressKind?: string;
  appliesTo?: readonly string[];
  path: string;
  type: ShellValueType;
  nullable?: boolean;
  range?: { min?: number; max?: number; step?: number };
  default?: unknown;
  access?: "readWrite" | "readOnly" | "derived";
  bindable?: boolean;
  summary?: string;
  title?: string;
}

export type ShellObjectErrorCode =
  | "badAddress"
  | "unknownAddress"
  | "unknownPath"
  | "unknownCommand"
  | "invalidValue"
  | "readOnly"
  | "unmapped"
  | "denied"
  | "failed";

export type ShellObjectValue =
  | { kind: "value"; value: unknown }
  | { kind: "mixed" }
  | { kind: "absent" }
  | { kind: "refused"; code: ShellObjectErrorCode; reason: string };

export type ShellObjectOp =
  | { op: "set"; address: string; path: string; value: unknown }
  | {
      op: "create";
      kind: string;
      within?: string;
      props?: Record<string, unknown>;
      handle?: string;
    }
  | { op: "delete"; address: string }
  | { op: "invoke"; command: string; args: unknown };

export interface ShellObjectWriteResult {
  applied: boolean;
  reason?: string;
  undoSteps: 0 | 1;
  code?: ShellObjectErrorCode;
  index?: number;
}

export interface ShellObjectCommandInfo {
  id: string;
  title: string;
  owner: string;
  args: ShellValueType;
}

/** The slice of plugin-api `ObjectsSurface` the editor's host side calls. */
export interface ShellObjectsSurface {
  query(selector: string, opts?: { limit?: number }): Promise<string[]>;
  get(address: string, path: string): Promise<ShellObjectValue>;
  set(
    address: string,
    path: string,
    value: unknown,
    opts?: { label?: string },
  ): Promise<ShellObjectWriteResult>;
  batch(
    ops: readonly ShellObjectOp[],
    opts?: { label?: string },
  ): Promise<ShellObjectWriteResult>;
  schema(addressOrKind: string): Promise<readonly ShellPropertySchema[]>;
  commands(): Promise<readonly ShellObjectCommandInfo[]>;
  invoke(command: string, args: unknown): Promise<unknown>;
  onDidChange(
    listener: (e: { addresses: readonly string[]; origin: string }) => void,
  ): { dispose(): void };
}

/** What the app injects through `<PagedShell objectModel>`. */
export interface ShellObjectModelHost {
  objects: ShellObjectsSurface;
  /** The canonical ADR 131 address of a selected element (plugin-sdk
   *  `fromElementId`). */
  addressOf(id: ElementId): string;
  /** Core rows the SDK's seam could not probe on a real engine are
   *  marked `inferred` there (plugin-sdk `CORE_PATHS`); the field shows a
   *  subtle badge for them. */
  isInferred?(row: ShellPropertySchema): boolean;
  /** The wire `Value` variant a core path writes (`CORE_PATHS[path].wire`),
   *  for the ADR 023 binding-provider lane, which still speaks wire
   *  values. Absent / null: the provider lane is not consulted. */
  wireOf?(path: string): string | null;
}
