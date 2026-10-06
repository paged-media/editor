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

// ADR 323 — `editor.get/set/query/batch/schema`: the editor-automation
// face of `host.objects`, the same calls a Boa script, the Node CLI and a
// data binding make.
//
// Refusals surface as ERRORS carrying the refusal code (the same rule the
// Boa bridge follows), except `batch`, which returns its result whole —
// `applied`, `code` and the failing op's `index` ARE the per-op answer.
//
// Pure (types-only imports) so the node unit test runs it as-is.

import type {
  ShellObjectOp,
  ShellObjectValue,
  ShellObjectWriteResult,
  ShellObjectsSurface,
  ShellPropertySchema,
} from "../catalog/object-model-types";

/** An automation call the object model refused. */
export class ObjectModelError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ObjectModelError";
    this.code = code;
  }
}

export interface ObjectAutomationApi {
  /** Addresses matching an ADR 131 selector. */
  query(selector: string, opts?: { limit?: number }): Promise<string[]>;
  /** One read: `{ kind: "value", value }`, `{ kind: "mixed" }` or
   *  `{ kind: "absent" }`; a refusal throws with its code. */
  get(address: string, path: string): Promise<ShellObjectValue>;
  /** One write = one undo step; a refusal throws with its code. */
  set(address: string, path: string, value: unknown): Promise<ShellObjectWriteResult>;
  /** All-or-nothing, one undo step; returns the result (never throws a
   *  refusal — read `applied`, `code`, `index`). */
  batch(ops: readonly ShellObjectOp[]): Promise<ShellObjectWriteResult>;
  /** The schema rows of an address's kind, or of a kind name. */
  schema(addressOrKind: string): Promise<readonly ShellPropertySchema[]>;
}

type ObjectsLike = Pick<ShellObjectsSurface, "query" | "get" | "set" | "batch" | "schema">;

export function buildObjectAutomation(
  getObjects: () => ObjectsLike | null | undefined,
): ObjectAutomationApi {
  const objects = (): ObjectsLike => {
    const o = getObjects();
    if (!o) throw new ObjectModelError("unavailable", "no object registry is wired in this editor");
    return o;
  };
  return {
    async query(selector, opts) {
      return objects().query(selector, opts);
    },
    async get(address, path) {
      const v = await objects().get(address, path);
      if (v.kind === "refused") throw new ObjectModelError(v.code, v.reason);
      return v;
    },
    async set(address, path, value) {
      const r = await objects().set(address, path, value);
      if (!r.applied) throw new ObjectModelError(r.code ?? "failed", r.reason ?? "refused");
      return r;
    },
    async batch(ops) {
      return objects().batch(ops);
    },
    async schema(addressOrKind) {
      return objects().schema(addressOrKind);
    },
  };
}
