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

// ADR 323 — the migration of a composition panel onto `PropertyField`.
//
// A composition declares its fields as `selectionProperty` bindings on
// type-specific leaves (`paged.input.length`, `.color-swatch`, …): the
// LEAF decides the type. `asPropertyFields(node)` rewrites every such
// field into a `paged.input.property` node naming the same path, so the
// TYPE comes from the target's schema row and reads/writes go through
// `host.objects` — and every field gains "Bind to data…" and the badges.
//
// What it keeps: the label, chrome props (icon, prefix, suffix,
// placeholder, layout) and the presentation of enum-like TEXT paths (the
// options and whether they were segments or a select) — core's schema
// says `text` for those until it publishes their members (ADR 132).
// Literal-bound and seam nodes are left exactly as they were.
//
// Pure, so the node unit test pins it.

import type { CompositionNode } from "@paged-media/catalog";

/** Mirrors `built-in.ts` (which re-exports it) — kept here so this module
 *  stays free of the React leaf imports. */
export const PAGED_INPUT_PROPERTY = "paged.input.property";

const SEGMENTS = "paged.input.toggle-group";
const SELECT = "paged.input.select";

export function asPropertyFields(node: CompositionNode): CompositionNode {
  const children = node.children?.map(asPropertyFields);
  const value = node.bindings?.value as
    | { kind?: string; path?: string; scope?: "element" | "content" }
    | undefined;
  const props = (node.props ?? {}) as Record<string, unknown>;
  if (
    value?.kind !== "selectionProperty" ||
    typeof value.path !== "string" ||
    props.seam === true
  ) {
    return children ? { ...node, children } : node;
  }
  const rest = { ...node.bindings };
  delete rest.value;
  return {
    ...node,
    catalogId: PAGED_INPUT_PROPERTY,
    props: {
      ...props,
      path: value.path,
      ...(value.scope ? { scope: value.scope } : {}),
      ...(node.catalogId === SEGMENTS ? { style: "segments" } : {}),
      ...(node.catalogId === SELECT ? { style: "select" } : {}),
    },
    bindings: rest,
    ...(children ? { children } : {}),
  };
}
